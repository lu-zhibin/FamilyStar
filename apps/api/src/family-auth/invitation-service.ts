import { createHash, randomBytes } from 'node:crypto';

import type { OutboxWriter, TransactionRunner } from '../events/outbox.js';
import { runWithOutbox } from '../events/outbox.js';
import { INVITATION_TTL_MILLISECONDS } from './constants.js';
import { createInvitationEmailRequestedEvent } from './invitation-events.js';
import type { PasswordHasher } from './password.js';
import { validateParentPassword } from './password.js';
import type { FamilyInvitationRepository, PublicParentIdentity, SessionStore } from './types.js';

export class InvitationAuthenticationError extends Error {
  constructor() {
    super('A valid parent session is required.');
    this.name = 'InvitationAuthenticationError';
  }
}

export class InvitationCreatorRequiredError extends Error {
  constructor() {
    super('Only the family creator can invite another parent.');
    this.name = 'InvitationCreatorRequiredError';
  }
}

export class FamilyParentLimitError extends Error {
  constructor() {
    super('This family already has two active parents.');
    this.name = 'FamilyParentLimitError';
  }
}

export class InvalidInvitationTokenError extends Error {
  constructor() {
    super('The invitation token is invalid.');
    this.name = 'InvalidInvitationTokenError';
  }
}

export class InvitationExpiredError extends Error {
  constructor() {
    super('The invitation has expired.');
    this.name = 'InvitationExpiredError';
  }
}

export class InvitationUnavailableError extends Error {
  constructor() {
    super('The invitation is no longer available.');
    this.name = 'InvitationUnavailableError';
  }
}

export type InvitationOperations = {
  create(input: { sessionToken?: string; email: string; correlationId: string }): Promise<{
    invitation: { id: string; email: string; expiresAt: string };
    delivery: 'email' | 'copy-link';
    invitationLink?: string;
  }>;
  accept(input: {
    token: string;
    nickname: string;
    password: string;
  }): Promise<{ parent: PublicParentIdentity; sessionToken: string }>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class FamilyInvitationService<Transaction> implements InvitationOperations {
  constructor(
    private readonly repository: FamilyInvitationRepository<Transaction>,
    private readonly transactionRunner: TransactionRunner<Transaction>,
    private readonly outboxWriter: OutboxWriter<Transaction>,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordHasher,
    private readonly publicBaseUrl: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly tokenFactory: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  async create(input: { sessionToken?: string; email: string; correlationId: string }): Promise<{
    invitation: { id: string; email: string; expiresAt: string };
    delivery: 'email' | 'copy-link';
    invitationLink?: string;
  }> {
    const session = input.sessionToken ? await this.sessions.read(input.sessionToken) : null;
    if (!session || session.role !== 'parent') throw new InvitationAuthenticationError();

    const now = this.clock();
    const token = this.tokenFactory();
    const invitationLink = new URL(
      `/invite?token=${encodeURIComponent(token)}`,
      this.publicBaseUrl,
    ).toString();
    const creation = await runWithOutbox(
      this.transactionRunner,
      this.outboxWriter,
      async (transaction) => {
        const result = await this.repository.createOrRefresh(transaction, {
          actorId: session.subjectId,
          familyId: session.familyId,
          email: normalizeEmail(input.email),
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MILLISECONDS),
          now,
        });
        const events = result.emailConfigured
          ? [
              createInvitationEmailRequestedEvent({
                invitationId: result.invitation.id,
                familyId: result.invitation.familyId,
                actorId: session.subjectId,
                email: result.invitation.email,
                invitationLink,
                correlationId: input.correlationId,
                occurredAt: now,
              }),
            ]
          : [];
        return { result, events };
      },
    );

    return {
      invitation: {
        id: creation.invitation.id,
        email: creation.invitation.email,
        expiresAt: creation.invitation.expiresAt.toISOString(),
      },
      delivery: creation.emailConfigured ? 'email' : 'copy-link',
      ...(creation.emailConfigured ? {} : { invitationLink }),
    };
  }

  async accept(input: { token: string; nickname: string; password: string }): Promise<{
    parent: PublicParentIdentity;
    sessionToken: string;
  }> {
    validateParentPassword(input.password);
    const passwordHash = await this.passwords.hash(input.password);
    const parent = await this.transactionRunner.run((transaction) =>
      this.repository.accept(transaction, {
        tokenHash: hashToken(input.token),
        nickname: input.nickname.trim(),
        passwordHash,
        now: this.clock(),
      }),
    );
    const sessionToken = await this.sessions.create({
      subjectId: parent.id,
      familyId: parent.familyId,
      role: 'parent',
      issuedAt: this.clock().toISOString(),
    });
    return {
      parent: {
        id: parent.id,
        familyId: parent.familyId,
        familyCode: parent.familyCode,
        nickname: parent.nickname,
        email: parent.email,
      },
      sessionToken,
    };
  }
}
