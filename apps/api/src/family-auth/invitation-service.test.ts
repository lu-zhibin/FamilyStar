import { describe, expect, it } from 'vitest';

import type { OutboxWriter, TransactionRunner } from '../events/outbox.js';
import { INVITATION_TTL_MILLISECONDS } from './constants.js';
import { INVITATION_EMAIL_REQUESTED_EVENT } from './invitation-events.js';
import { FamilyInvitationService, InvitationAuthenticationError } from './invitation-service.js';
import type { PasswordHasher } from './password.js';
import type { AuthSession, FamilyInvitationRepository, SessionStore } from './types.js';

const familyId = '00000000-0000-4000-8000-000000000001';
const parentId = '00000000-0000-4000-8000-000000000002';
const invitationId = '00000000-0000-4000-8000-000000000003';
const fixedNow = new Date('2026-07-30T12:00:00.000Z');

function createHarness(options: { emailConfigured?: boolean; session?: AuthSession | null } = {}) {
  const writes: unknown[] = [];
  const events: unknown[] = [];
  const transactionRunner: TransactionRunner<{ id: string }> = {
    async run(work) {
      return work({ id: 'transaction' });
    },
  };
  const repository: FamilyInvitationRepository<{ id: string }> = {
    async createOrRefresh(_transaction, input) {
      writes.push(input);
      return {
        invitation: {
          id: invitationId,
          familyId,
          invitedById: parentId,
          email: input.email,
          expiresAt: input.expiresAt,
        },
        emailConfigured: options.emailConfigured ?? false,
      };
    },
    async accept(_transaction, input) {
      writes.push(input);
      return {
        id: parentId,
        familyId,
        familyCode: 'STARFAM001',
        nickname: input.nickname,
        email: 'second@example.com',
        passwordHash: input.passwordHash,
      };
    },
  };
  const outboxWriter: OutboxWriter<{ id: string }> = {
    async append(_transaction, event) {
      events.push(event);
    },
  };
  const sessions: SessionStore = {
    async create() {
      return 'new-session';
    },
    async read() {
      return options.session === undefined
        ? { subjectId: parentId, familyId, role: 'parent', issuedAt: fixedNow.toISOString() }
        : options.session;
    },
    async revokeSubject() {},
  };
  const passwords: PasswordHasher = {
    async hash() {
      return 'password-hash';
    },
    async verify() {
      return true;
    },
  };
  return {
    events,
    writes,
    service: new FamilyInvitationService(
      repository,
      transactionRunner,
      outboxWriter,
      sessions,
      passwords,
      'https://family.example/',
      () => fixedNow,
      () => 'plain-invitation-token',
    ),
  };
}

describe('FamilyInvitationService', () => {
  it('creates a seven-day copyable invitation when email is unavailable', async () => {
    const harness = createHarness();
    const result = await harness.service.create({
      sessionToken: 'parent-session',
      email: ' SECOND@Example.COM ',
      correlationId: 'request-1',
    });

    expect(harness.writes[0]).toMatchObject({
      actorId: parentId,
      familyId,
      email: 'second@example.com',
      expiresAt: new Date(fixedNow.getTime() + INVITATION_TTL_MILLISECONDS),
    });
    expect(harness.writes[0]).not.toMatchObject({ tokenHash: 'plain-invitation-token' });
    expect(result).toMatchObject({
      invitation: { id: invitationId, email: 'second@example.com' },
      delivery: 'copy-link',
      invitationLink: 'https://family.example/invite?token=plain-invitation-token',
    });
    expect(harness.events).toHaveLength(0);
  });

  it('queues one email event when family email is verified', async () => {
    const harness = createHarness({ emailConfigured: true });
    const result = await harness.service.create({
      sessionToken: 'parent-session',
      email: 'second@example.com',
      correlationId: 'request-2',
    });

    expect(result).toMatchObject({ delivery: 'email' });
    expect(result).not.toHaveProperty('invitationLink');
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]).toMatchObject({
      event_name: INVITATION_EMAIL_REQUESTED_EVENT,
      family_id: familyId,
      actor_id: parentId,
      correlation_id: 'request-2',
      payload: { invitation_id: invitationId, email: 'second@example.com' },
    });
  });

  it('requires a valid parent session before creating an invitation', async () => {
    const harness = createHarness({ session: null });
    await expect(
      harness.service.create({ email: 'second@example.com', correlationId: 'request-3' }),
    ).rejects.toBeInstanceOf(InvitationAuthenticationError);
    expect(harness.writes).toHaveLength(0);
  });

  it('rejects child sessions from parent invitation operations', async () => {
    const harness = createHarness({
      session: {
        subjectId: 'child-1',
        familyId,
        role: 'child',
        issuedAt: fixedNow.toISOString(),
      },
    });
    await expect(
      harness.service.create({
        sessionToken: 'child-session',
        email: 'second@example.com',
        correlationId: 'request-4',
      }),
    ).rejects.toBeInstanceOf(InvitationAuthenticationError);
    expect(harness.writes).toHaveLength(0);
  });

  it('accepts an invitation, hashes the password, and creates a session', async () => {
    const harness = createHarness();
    const result = await harness.service.accept({
      token: 'plain-invitation-token',
      nickname: ' Second Parent ',
      password: 'twelve-chars-password',
    });

    expect(harness.writes[0]).toMatchObject({
      nickname: 'Second Parent',
      passwordHash: 'password-hash',
      now: fixedNow,
    });
    expect(harness.writes[0]).not.toMatchObject({ tokenHash: 'plain-invitation-token' });
    expect(result).toEqual({
      parent: {
        id: parentId,
        familyId,
        familyCode: 'STARFAM001',
        nickname: 'Second Parent',
        email: 'second@example.com',
      },
      sessionToken: 'new-session',
    });
  });
});
