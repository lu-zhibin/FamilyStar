import type { EventName } from '@familystar/shared';

export const CHECK_IN_APPROVED_EVENT = 'check-in.entry.approved.v1' as const satisfies EventName;
export const CHECK_IN_REJECTED_EVENT = 'check-in.entry.rejected.v1' as const satisfies EventName;

export type CheckInApprovedEventPayload = Readonly<{
  source_type: 'CHECK_IN' | 'COLLABORATION_SUBMISSION';
  source_id: string;
  child_id: string;
  task_id: string;
  task_name: string;
  content_text: string | null;
  occurred_on: string;
  points_earned: number;
  media_ids: readonly string[];
}>;

export type CheckInRejectedEventPayload = Readonly<{
  source_type: 'CHECK_IN' | 'COLLABORATION_SUBMISSION';
  source_id: string;
  child_id: string;
  task_name: string;
  reason: string | null;
}>;
