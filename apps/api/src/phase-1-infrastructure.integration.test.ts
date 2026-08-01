import type { PrismaClient } from '@prisma/client';
import {
  CHECK_IN_MANIFEST,
  STATIC_BUSINESS_MODULES,
  initializeBusinessModules,
  unregisterBusinessModules,
} from '@familystar/business-modules';
import { createDomainEvent } from '@familystar/shared';
import type { DomainEvent } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import { EventBus } from './events/event-bus.js';
import { IdempotentEventConsumer } from './events/idempotent-consumer.js';
import {
  OutboxDispatcher,
  runWithOutbox,
  type ClaimOutboxOptions,
  type OutboxRepository,
  type OutboxWriter,
  type TransactionRunner,
} from './events/outbox.js';
import { RedisEventReceiptStore } from './events/redis-event-receipts.js';
import { CREDENTIAL_VAULT_ERROR_CODES } from './infrastructure/credentials/errors.js';
import { createMasterKeyring } from './infrastructure/credentials/keyring.js';
import { PrismaCredentialVaultRepository } from './infrastructure/credentials/prisma-repository.js';
import { CredentialVault } from './infrastructure/credentials/vault.js';
import type {
  CredentialRecordContext,
  EncryptedCredentialEnvelope,
  IntegrationType,
} from './infrastructure/credentials/vault.js';
import { createRedisKeyspace } from './infrastructure/redis/keys.js';
import type { RedisCommandPort } from './infrastructure/redis/primitives.js';

const FAMILY_ID = '018f47a8-7b21-7cc2-9a4d-8f92fa16f186';
const RECORD_ID = '018f5f3a-9b2e-7c41-8d56-1234567890ab';
const START_TIME = new Date('2026-07-30T13:00:00.000Z');

function taskArchivedEvent(eventId = '018f31f2-b9a8-7cc0-a9e1-1256dc8cd915'): DomainEvent {
  return createDomainEvent({
    event_id: eventId,
    event_name: 'tasks.task.archived.v1',
    occurred_at: '2026-07-30T12:59:00.000Z',
    family_id: FAMILY_ID,
    actor_id: null,
    correlation_id: 'task-2_7-integration',
    payload: { task_id: 'task-1' },
  });
}

type MemoryOutboxRecord = {
  event: DomainEvent;
  attempts: number;
  availableAt: Date;
  publishedAt: Date | null;
  lockOwner: string | null;
  errorCode: string | null;
};

type MemoryTransaction = {
  businessChanges: string[];
  outbox: MemoryOutboxRecord[];
};

function cloneOutboxRecord(record: MemoryOutboxRecord): MemoryOutboxRecord {
  return {
    ...record,
    availableAt: new Date(record.availableAt),
    publishedAt: record.publishedAt === null ? null : new Date(record.publishedAt),
  };
}

class MemoryTransactionalOutbox
  implements TransactionRunner<MemoryTransaction>, OutboxWriter<MemoryTransaction>, OutboxRepository
{
  private state: MemoryTransaction = { businessChanges: [], outbox: [] };
  private readonly failOnAppend: number | undefined;

  constructor(failOnAppend?: number) {
    this.failOnAppend = failOnAppend;
  }

  get businessChanges(): readonly string[] {
    return this.state.businessChanges;
  }

  get records(): readonly MemoryOutboxRecord[] {
    return this.state.outbox;
  }

  async run<Result>(work: (transaction: MemoryTransaction) => Promise<Result>): Promise<Result> {
    const transaction: MemoryTransaction = {
      businessChanges: [...this.state.businessChanges],
      outbox: this.state.outbox.map(cloneOutboxRecord),
    };
    const result = await work(transaction);
    this.state = transaction;
    return result;
  }

  async append(transaction: MemoryTransaction, event: DomainEvent): Promise<void> {
    if (transaction.outbox.length + 1 === this.failOnAppend) {
      throw new Error('outbox append failed');
    }
    transaction.outbox.push({
      event,
      attempts: 0,
      availableAt: new Date(event.occurred_at),
      publishedAt: null,
      lockOwner: null,
      errorCode: null,
    });
  }

  async claimBatch(options: ClaimOutboxOptions) {
    const claimed = this.state.outbox
      .filter(
        (record) =>
          record.publishedAt === null &&
          record.lockOwner === null &&
          record.availableAt.getTime() <= options.now.getTime(),
      )
      .slice(0, options.batchSize);

    for (const record of claimed) {
      record.lockOwner = options.workerId;
      record.attempts += 1;
    }

    return claimed.map((record) => ({ event: record.event, attempts: record.attempts }));
  }

  async markPublished(eventId: string, workerId: string, publishedAt: Date): Promise<void> {
    const record = this.requireLease(eventId, workerId);
    record.publishedAt = new Date(publishedAt);
    record.lockOwner = null;
  }

  async reschedule(
    eventId: string,
    workerId: string,
    availableAt: Date,
    errorCode: string,
  ): Promise<void> {
    const record = this.requireLease(eventId, workerId);
    record.availableAt = new Date(availableAt);
    record.errorCode = errorCode;
    record.lockOwner = null;
  }

  private requireLease(eventId: string, workerId: string): MemoryOutboxRecord {
    const record = this.state.outbox.find(
      (candidate) => candidate.event.event_id === eventId && candidate.lockOwner === workerId,
    );
    if (record === undefined) {
      throw new Error('outbox lease lost');
    }
    return record;
  }
}

class MemoryRedisCommandPort implements RedisCommandPort {
  readonly commands: readonly string[][] = [];
  private readonly values = new Map<string, string>();

  async sendCommand(arguments_: readonly string[]): Promise<unknown> {
    (this.commands as string[][]).push([...arguments_]);

    if (arguments_[0] === 'SET' && arguments_[5] === 'NX') {
      const key = arguments_[1];
      const value = arguments_[2];
      if (key === undefined || value === undefined) {
        throw new Error('invalid SET command');
      }
      if (this.values.has(key)) {
        return null;
      }
      this.values.set(key, value);
      return 'OK';
    }

    if (arguments_[0] === 'EVAL') {
      const key = arguments_[3];
      const owner = arguments_[4];
      if (key === undefined || owner === undefined) {
        throw new Error('invalid EVAL command');
      }
      if (this.values.get(key) !== owner) {
        return 0;
      }
      this.values.delete(key);
      return 1;
    }

    throw new Error(`unsupported Redis command: ${arguments_[0] ?? 'empty'}`);
  }
}

type CredentialRow = {
  id: string;
  familyId: string;
  integrationType: 'EMAIL' | 'COS';
  encryptedCredentials: Uint8Array;
  credentialNonce: Uint8Array;
  credentialAuthTag: Uint8Array;
  wrappedDataKey: Uint8Array;
  dataKeyNonce: Uint8Array;
  dataKeyAuthTag: Uint8Array;
  keyVersion: string;
};

type FindCredentialArguments = {
  where: {
    familyId: string;
    integrationType: 'EMAIL' | 'COS';
    family: { deletedAt: null };
  };
};

type UpdateCredentialArguments = {
  where: {
    id: string;
    familyId: string;
    integrationType: 'EMAIL' | 'COS';
    keyVersion: string;
  };
  data: {
    wrappedDataKey: Uint8Array;
    dataKeyNonce: Uint8Array;
    dataKeyAuthTag: Uint8Array;
    keyVersion: string;
  };
};

function cloneCredentialRow(row: CredentialRow): CredentialRow {
  return {
    ...row,
    encryptedCredentials: Uint8Array.from(row.encryptedCredentials),
    credentialNonce: Uint8Array.from(row.credentialNonce),
    credentialAuthTag: Uint8Array.from(row.credentialAuthTag),
    wrappedDataKey: Uint8Array.from(row.wrappedDataKey),
    dataKeyNonce: Uint8Array.from(row.dataKeyNonce),
    dataKeyAuthTag: Uint8Array.from(row.dataKeyAuthTag),
  };
}

class MemoryCredentialPrisma {
  private row: CredentialRow;

  readonly familyIntegrationSetting: {
    findFirst: (arguments_: FindCredentialArguments) => Promise<CredentialRow | null>;
    updateMany: (arguments_: UpdateCredentialArguments) => Promise<{ count: number }>;
  };

  constructor(row: CredentialRow) {
    this.row = cloneCredentialRow(row);
    this.familyIntegrationSetting = {
      findFirst: async ({ where }) => {
        return where.familyId === this.row.familyId &&
          where.integrationType === this.row.integrationType
          ? cloneCredentialRow(this.row)
          : null;
      },
      updateMany: async ({ where, data }) => {
        if (
          where.id !== this.row.id ||
          where.familyId !== this.row.familyId ||
          where.integrationType !== this.row.integrationType ||
          where.keyVersion !== this.row.keyVersion
        ) {
          return { count: 0 };
        }
        this.row = {
          ...this.row,
          wrappedDataKey: Uint8Array.from(data.wrappedDataKey),
          dataKeyNonce: Uint8Array.from(data.dataKeyNonce),
          dataKeyAuthTag: Uint8Array.from(data.dataKeyAuthTag),
          keyVersion: data.keyVersion,
        };
        return { count: 1 };
      },
    };
  }
}

function createVault(activeKeyVersion: 'v1' | 'v2'): CredentialVault {
  return new CredentialVault(
    createMasterKeyring({
      CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: activeKeyVersion,
      CREDENTIAL_VAULT_MASTER_KEYS: JSON.stringify({
        v1: Buffer.alloc(32, 1).toString('base64'),
        v2: Buffer.alloc(32, 2).toString('base64'),
      }),
    }),
  );
}

function credentialRow(
  context: CredentialRecordContext,
  envelope: EncryptedCredentialEnvelope,
): CredentialRow {
  const integrationType: Record<IntegrationType, 'EMAIL' | 'COS'> = {
    email: 'EMAIL',
    cos: 'COS',
  };
  return {
    id: context.recordId,
    familyId: context.familyId,
    integrationType: integrationType[context.integrationType],
    encryptedCredentials: Uint8Array.from(envelope.encryptedCredentials),
    credentialNonce: Uint8Array.from(envelope.credentialNonce),
    credentialAuthTag: Uint8Array.from(envelope.credentialAuthTag),
    wrappedDataKey: Uint8Array.from(envelope.wrappedDataKey),
    dataKeyNonce: Uint8Array.from(envelope.dataKeyNonce),
    dataKeyAuthTag: Uint8Array.from(envelope.dataKeyAuthTag),
    keyVersion: envelope.keyVersion,
  };
}

describe('Phase 1 infrastructure integration', () => {
  it('registers real business modules and routes a declared event through scoped EventBus access', async () => {
    const registry = await initializeBusinessModules();
    const bus = new EventBus();
    const tasksManifest = registry.get('tasks');
    const checkInManifest = registry.get('check-in');
    if (tasksManifest === undefined || checkInManifest === undefined) {
      throw new Error('Expected static business manifests');
    }
    const handler = vi.fn();
    bus.createScope(checkInManifest).subscribe('tasks.task.archived.v1', handler);
    const event = taskArchivedEvent();

    expect(registry.list().map(({ name }) => name)).toEqual(
      STATIC_BUSINESS_MODULES.map(({ manifest }) => manifest.name),
    );
    await bus.createScope(tasksManifest).publish(event);
    expect(handler).toHaveBeenCalledWith(event);
    expect(Object.isFrozen(handler.mock.calls[0]?.[0])).toBe(true);

    await unregisterBusinessModules(registry);
    expect(registry.list()).toEqual([]);
  });

  it('commits an Outbox event, reschedules a failed publication, and publishes the retry', async () => {
    const store = new MemoryTransactionalOutbox();
    const event = taskArchivedEvent();
    const result = await runWithOutbox(store, store, async (transaction) => {
      transaction.businessChanges.push('task-1:archived');
      return { result: 'committed', events: [event] };
    });
    const bus = new EventBus();
    let deliveries = 0;
    bus.createScope(CHECK_IN_MANIFEST).subscribe('tasks.task.archived.v1', () => {
      deliveries += 1;
      if (deliveries === 1) {
        throw new TypeError('transient handler failure');
      }
    });
    let now = new Date(START_TIME);
    const dispatcher = new OutboxDispatcher(store, bus.createOutboxPublisher(), {
      workerId: 'worker-1',
      batchSize: 10,
      leaseMilliseconds: 30_000,
      retryBaseMilliseconds: 1_000,
      retryMaxMilliseconds: 8_000,
      clock: () => new Date(now),
    });

    expect(result).toBe('committed');
    expect(store.businessChanges).toEqual(['task-1:archived']);
    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    expect(store.records[0]).toMatchObject({ attempts: 1, errorCode: 'TypeError' });

    now = new Date('2026-07-30T13:00:01.000Z');
    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });
    expect(deliveries).toBe(2);
    expect(store.records[0]).toMatchObject({ attempts: 2, publishedAt: now });
  });

  it('rolls back business changes when a later Outbox append fails', async () => {
    const store = new MemoryTransactionalOutbox(2);

    await expect(
      runWithOutbox(store, store, async (transaction) => {
        transaction.businessChanges.push('task-1:archived');
        return {
          result: undefined,
          events: [taskArchivedEvent(), taskArchivedEvent('018f31f2-b9a8-7cc0-a9e1-1256dc8cd916')],
        };
      }),
    ).rejects.toThrow('outbox append failed');
    expect(store.businessChanges).toEqual([]);
    expect(store.records).toEqual([]);
  });

  it('suppresses duplicate consumption through the real Redis receipt adapter', async () => {
    const redis = new MemoryRedisCommandPort();
    const receipts = new RedisEventReceiptStore(redis, createRedisKeyspace('familystar_test'));
    const handler = vi.fn();
    const consumer = new IdempotentEventConsumer(receipts, handler, {
      consumer: 'check-in projector',
      receiptTtlSeconds: 60,
      ownerTokenFactory: () => 'owner-1',
    });
    const event = taskArchivedEvent();

    await expect(consumer.consume(event)).resolves.toBe('processed');
    await expect(consumer.consume(event)).resolves.toBe('duplicate');
    expect(handler).toHaveBeenCalledOnce();
    expect(redis.commands[0]?.[1]).toBe(
      `familystar_test:idempotency:check-in%20projector:${event.event_id}`,
    );
  });

  it('owner-releases a failed receipt so a later delivery can recover', async () => {
    const redis = new MemoryRedisCommandPort();
    const receipts = new RedisEventReceiptStore(redis, createRedisKeyspace('familystar_test'));
    let attempts = 0;
    const consumer = new IdempotentEventConsumer(
      receipts,
      () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('retry delivery');
        }
      },
      {
        consumer: 'check-in-projector',
        receiptTtlSeconds: 60,
        ownerTokenFactory: () => `owner-${attempts + 1}`,
      },
    );
    const event = taskArchivedEvent();

    await expect(consumer.consume(event)).rejects.toThrow('retry delivery');
    await expect(consumer.consume(event)).resolves.toBe('processed');
    expect(attempts).toBe(2);
    expect(redis.commands.map(([command]) => command)).toEqual(['SET', 'EVAL', 'SET']);
  });

  it('round-trips encrypted Prisma fields and preserves credential ciphertext during rewrap', async () => {
    const context: CredentialRecordContext = {
      recordId: RECORD_ID,
      familyId: FAMILY_ID,
      integrationType: 'cos',
    };
    const oldVault = createVault('v1');
    const envelope = oldVault.encrypt(context, {
      secretId: 'integration-test-id',
      secretKey: 'integration-test-key',
    });
    const prisma = new MemoryCredentialPrisma(credentialRow(context, envelope));
    const repository = new PrismaCredentialVaultRepository(prisma as unknown as PrismaClient);
    const stored = await repository.findByFamilyAndType(FAMILY_ID, 'cos');
    if (stored === null) {
      throw new Error('Expected encrypted credential record');
    }
    const rotatedVault = createVault('v2');

    expect(rotatedVault.decrypt(stored.context, stored.envelope)).toEqual({
      secretId: 'integration-test-id',
      secretKey: 'integration-test-key',
    });
    expect(
      await repository.findByFamilyAndType('018f47a8-7b21-7cc2-9a4d-8f92fa16f187', 'cos'),
    ).toBeNull();
    expect(() =>
      rotatedVault.decrypt(
        { ...stored.context, recordId: '018f5f3a-9b2e-7c41-8d56-1234567890ac' },
        stored.envelope,
      ),
    ).toThrowError(
      expect.objectContaining({ code: CREDENTIAL_VAULT_ERROR_CODES.AUTHENTICATION_FAILED }),
    );

    const rewrapped = rotatedVault.rewrapDataKey(stored.context, stored.envelope);
    await expect(repository.updateWrappedDataKey(stored, rewrapped)).resolves.toBe(true);
    const rotated = await repository.findByFamilyAndType(FAMILY_ID, 'cos');
    if (rotated === null) {
      throw new Error('Expected rewrapped credential record');
    }
    expect(rotated.envelope.keyVersion).toBe('v2');
    expect(rotated.envelope.encryptedCredentials).toEqual(envelope.encryptedCredentials);
    expect(rotated.envelope.credentialNonce).toEqual(envelope.credentialNonce);
    expect(rotated.envelope.credentialAuthTag).toEqual(envelope.credentialAuthTag);
    expect(rotatedVault.decrypt(rotated.context, rotated.envelope)).toEqual({
      secretId: 'integration-test-id',
      secretKey: 'integration-test-key',
    });
  });
});
