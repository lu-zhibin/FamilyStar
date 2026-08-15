import { createHash, randomBytes } from 'node:crypto';

import type { OutboxWriter, TransactionRunner } from '../events/outbox.js';
import { runWithOutbox } from '../events/outbox.js';
import { INVITATION_TTL_MILLISECONDS } from './constants.js';
import {
  createInvitationEmailRequestedEvent,
  createInvitationLifecycleEvent,
  INVITATION_ACCEPTED_EVENT,
  INVITATION_CREATED_EVENT,
  INVITATION_RESENT_EVENT,
  INVITATION_REVOKED_EVENT,
} from './invitation-events.js';
import type { PasswordHasher } from './password.js';
import { validateParentPassword } from './password.js';
import type {
  FamilyInvitationRepository,
  InvitationCreation,
  PublicParentIdentity,
  SessionStore,
} from './types.js';

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
  resend(input: { sessionToken?: string; invitationId: string; correlationId: string }): Promise<{
    invitation: { id: string; email: string; expiresAt: string };
    delivery: 'email' | 'copy-link';
    invitationLink?: string;
  }>;
  revoke(input: {
    sessionToken?: string;
    invitationId: string;
  }): Promise<{ invitation: { id: string; status: 'expired' } }>;
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
    const session = await this.requireParent(input.sessionToken);

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
        const events = [
          createInvitationLifecycleEvent({
            eventName: INVITATION_CREATED_EVENT,
            invitationId: result.invitation.id,
            familyId: result.invitation.familyId,
            actorId: session.subjectId,
            email: result.invitation.email,
            occurredAt: now,
          }),
          ...(result.emailConfigured
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
            : []),
        ];
        return { result, events };
      },
    );

    return this.deliveryResult(creation, invitationLink);
  }

  async resend(input: {
    sessionToken?: string;
    invitationId: string;
    correlationId: string;
  }): Promise<{
    invitation: { id: string; email: string; expiresAt: string };
    delivery: 'email' | 'copy-link';
    invitationLink?: string;
  }> {
    const session = await this.requireParent(input.sessionToken);
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
        const result = await this.repository.refresh(transaction, {
          actorId: session.subjectId,
          familyId: session.familyId,
          invitationId: input.invitationId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MILLISECONDS),
          now,
        });
        return {
          result,
          events: [
            createInvitationLifecycleEvent({
              eventName: INVITATION_RESENT_EVENT,
              invitationId: result.invitation.id,
              familyId: result.invitation.familyId,
              actorId: session.subjectId,
              email: result.invitation.email,
              occurredAt: now,
            }),
            ...(result.emailConfigured
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
              : []),
          ],
        };
      },
    );
    return this.deliveryResult(creation, invitationLink);
  }

  async revoke(input: {
    sessionToken?: string;
    invitationId: string;
  }): Promise<{ invitation: { id: string; status: 'expired' } }> {
    const session = await this.requireParent(input.sessionToken);
    const now = this.clock();
    const invitation = await runWithOutbox(
      this.transactionRunner,
      this.outboxWriter,
      async (transaction) => {
        const result = await this.repository.revoke(transaction, {
          actorId: session.subjectId,
          familyId: session.familyId,
          invitationId: input.invitationId,
          now,
        });
        return {
          result,
          events: [
            createInvitationLifecycleEvent({
              eventName: INVITATION_REVOKED_EVENT,
              invitationId: result.id,
              familyId: session.familyId,
              actorId: session.subjectId,
              email: result.email,
              occurredAt: now,
            }),
          ],
        };
      },
    );
    return { invitation: { id: invitation.id, status: 'expired' } };
  }

  async accept(input: { token: string; nickname: string; password: string }): Promise<{
    parent: PublicParentIdentity;
    sessionToken: string;
  }> {
    validateParentPassword(input.password);
    const passwordHash = await this.passwords.hash(input.password);
    const now = this.clock();
    const parent = await runWithOutbox(
      this.transactionRunner,
      this.outboxWriter,
      async (transaction) => {
        const result = await this.repository.accept(transaction, {
          tokenHash: hashToken(input.token),
          nickname: input.nickname.trim(),
          passwordHash,
          now,
        });
        return {
          result,
          events: [
            createInvitationLifecycleEvent({
              eventName: INVITATION_ACCEPTED_EVENT,
              invitationId: result.invitationId,
              familyId: result.familyId,
              actorId: result.id,
              email: result.email,
              occurredAt: now,
            }),
          ],
        };
      },
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

  private async requireParent(sessionToken?: string) {
    const session = sessionToken ? await this.sessions.read(sessionToken) : null;
    if (!session || session.role !== 'parent') throw new InvitationAuthenticationError();
    return session;
  }

  private deliveryResult(creation: InvitationCreation, invitationLink: string) {
    return {
      invitation: {
        id: creation.invitation.id,
        email: creation.invitation.email,
        expiresAt: creation.invitation.expiresAt.toISOString(),
      },
      delivery: creation.emailConfigured ? ('email' as const) : ('copy-link' as const),
      ...(creation.emailConfigured ? {} : { invitationLink }),
    };
  }
}
