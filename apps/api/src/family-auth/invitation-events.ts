import { randomUUID } from 'node:crypto';

import { createDomainEvent } from '@familystar/shared';

export const INVITATION_EMAIL_REQUESTED_EVENT = 'family.invitation.email-requested.v1' as const;

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
