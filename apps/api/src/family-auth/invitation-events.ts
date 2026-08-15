import { randomUUID } from 'node:crypto';

import { createDomainEvent } from '@familystar/shared';

export const INVITATION_EMAIL_REQUESTED_EVENT = 'family.invitation.email-requested.v1' as const;
export const INVITATION_CREATED_EVENT = 'family.invitation.created.v1' as const;
export const INVITATION_RESENT_EVENT = 'family.invitation.resent.v1' as const;
export const INVITATION_REVOKED_EVENT = 'family.invitation.revoked.v1' as const;
export const INVITATION_ACCEPTED_EVENT = 'family.invitation.accepted.v1' as const;

export function createInvitationLifecycleEvent(input: {
  eventName:
    | typeof INVITATION_CREATED_EVENT
    | typeof INVITATION_RESENT_EVENT
    | typeof INVITATION_REVOKED_EVENT
    | typeof INVITATION_ACCEPTED_EVENT;
  invitationId: string;
  familyId: string;
  actorId: string;
  email: string;
  occurredAt: Date;
}) {
  return createDomainEvent({
    event_id: randomUUID(),
    event_name: input.eventName,
    occurred_at: input.occurredAt.toISOString(),
    family_id: input.familyId,
    actor_id: input.actorId,
    correlation_id: input.invitationId,
    payload: { invitation_id: input.invitationId, email: input.email },
  });
}

export function createInvitationEmailRequestedEvent(input: {
  invitationId: string;
  familyId: string;
  actorId: string;
  email: string;
  invitationLink: string;
  correlationId: string;
  occurredAt: Date;
}) {
  return createDomainEvent({
    event_id: randomUUID(),
    event_name: INVITATION_EMAIL_REQUESTED_EVENT,
    occurred_at: input.occurredAt.toISOString(),
    family_id: input.familyId,
    actor_id: input.actorId,
    correlation_id: input.correlationId,
    payload: {
      invitation_id: input.invitationId,
      email: input.email,
      invitation_link: input.invitationLink,
    },
  });
}
