import { getCheckInWindow, isScheduledOnDate } from '../tasks/frequency.js';
import { InvalidSubmissionContentError, validateSubmissionContent } from './content.js';
import type {
  CheckInDependencies,
  CheckInOperations,
  CollaborationParticipantState,
  SoloAssignmentContext,
  SubmissionContent,
} from './types.js';

export class CheckInError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'INVALID' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'CheckInError';
  }
}

function familyDate(date: Date, timeZone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function validateCalendarDate(value: string): void {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CheckInError('INVALID', 'Invalid check date.');
  }
}

export function resolveCheckInEligibility(
  context: SoloAssignmentContext,
  checkDate: string,
  now: Date,
): { isMakeup: boolean } {
  validateCalendarDate(checkDate);
  const today = familyDate(now, context.settings.timeZone);
  if (
    context.taskStatus !== 'ACTIVE' ||
    context.collaborationMode !== 'SOLO' ||
    checkDate < context.startDate ||
    (context.endDate !== null && checkDate > context.endDate) ||
    !isScheduledOnDate(context.frequency, checkDate) ||
    checkDate > today
  ) {
    throw new CheckInError('INVALID', 'The assignment is not due on the requested date.');
  }
  const window = getCheckInWindow({
    dueDate: checkDate,
    timeZone: context.settings.timeZone,
    deadline: context.settings.checkInDeadline,
    makeupDays: context.settings.makeupDays,
  });
  if (checkDate === today && now.getTime() <= window.deadlineAt.getTime())
    return { isMakeup: false };
  if (checkDate < today && context.settings.makeupDays > 0 && today <= window.makeupUntil) {
    return { isMakeup: true };
  }
  throw new CheckInError('INVALID', 'The check-in window has closed.');
}

export function isCollaborationRoundComplete(
  participants: readonly CollaborationParticipantState[],
): boolean {
  const active = participants.filter(({ active }) => active);
  return (
    active.length > 0 && active.every(({ submissionStatus }) => submissionStatus === 'APPROVED')
  );
}

export class CheckInService implements CheckInOperations {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CheckInDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async submit(input: Parameters<CheckInOperations['submit']>[0]) {
    const session = await this.requireChild(input.sessionToken);
    const existing = await this.dependencies.repository.findCheckInByIdempotencyKey(
      session.familyId,
      input.idempotencyKey,
    );
    if (existing) return { checkIn: existing };
    const context = await this.dependencies.repository.findSoloAssignment(
      session.familyId,
      session.subjectId,
      input.assignmentId,
    );
    if (!context) throw new CheckInError('NOT_FOUND', 'The assignment was not found.');
    const now = this.now();
    const checkDate = input.checkDate ?? familyDate(now, context.settings.timeZone);
    const eligibility = resolveCheckInEligibility(context, checkDate, now);
    const content = await this.content(session.familyId, context.checkType, input.content);
    try {
      return {
        checkIn: await this.dependencies.repository.submitSolo({
          context,
          idempotencyKey: input.idempotencyKey,
          checkDate,
          isMakeup: eligibility.isMakeup,
          status: context.verifyMode === 'AUTO' ? 'APPROVED' : 'PENDING',
          ...content,
          submittedAt: now,
        }),
      };
    } catch (error) {
      if (error instanceof CheckInError) throw error;
      throw new CheckInError('CONFLICT', 'The check-in conflicts with its current state.');
    }
  }

  async get(input: Parameters<CheckInOperations['get']>[0]) {
    const session = await this.requireChild(input.sessionToken);
    const checkIn = await this.dependencies.repository.findCheckIn(
      session.familyId,
      session.subjectId,
      input.checkInId,
    );
    if (!checkIn) throw new CheckInError('NOT_FOUND', 'The check-in was not found.');
    return { checkIn };
  }

  async submitCollaboration(input: Parameters<CheckInOperations['submitCollaboration']>[0]) {
    const session = await this.requireChild(input.sessionToken);
    const existing = await this.dependencies.repository.findCollaborationByIdempotencyKey(
      session.familyId,
      input.idempotencyKey,
    );
    if (existing) return { submission: existing };
    const context = await this.dependencies.repository.findRound(
      session.familyId,
      session.subjectId,
      input.roundId,
    );
    if (
      !context ||
      !context.childIsActiveParticipant ||
      (context.status !== 'PENDING' && context.status !== 'ACTIVE')
    ) {
      throw new CheckInError('NOT_FOUND', 'The collaboration round was not found.');
    }
    const content = await this.content(session.familyId, context.checkType, input.content);
    try {
      return {
        submission: await this.dependencies.repository.submitCollaboration({
          context,
          childId: session.subjectId,
          idempotencyKey: input.idempotencyKey,
          status: context.verifyMode === 'AUTO' ? 'APPROVED' : 'PENDING',
          ...content,
          submittedAt: this.now(),
        }),
      };
    } catch (error) {
      if (error instanceof CheckInError) throw error;
      throw new CheckInError(
        'CONFLICT',
        'The collaboration submission conflicts with its current state.',
      );
    }
  }

  async listCollaboration(input: Parameters<CheckInOperations['listCollaboration']>[0]) {
    const session = await this.requireChild(input.sessionToken);
    const context = await this.dependencies.repository.findRound(
      session.familyId,
      session.subjectId,
      input.roundId,
    );
    if (!context || !context.childIsActiveParticipant) {
      throw new CheckInError('NOT_FOUND', 'The collaboration round was not found.');
    }
    return {
      submissions: await this.dependencies.repository.listCollaborationSubmissions(
        session.familyId,
        session.subjectId,
        input.roundId,
      ),
    };
  }

  private async content(
    familyId: string,
    checkType: SoloAssignmentContext['checkType'],
    input: SubmissionContent,
  ) {
    const media = await this.dependencies.repository.findReadyMedia(familyId, input.mediaIds);
    if (media.length !== input.mediaIds.length) {
      throw new CheckInError('INVALID', 'One or more media assets are unavailable.');
    }
    try {
      return validateSubmissionContent(checkType, input.text, media);
    } catch (error) {
      if (error instanceof InvalidSubmissionContentError) {
        throw new CheckInError('INVALID', error.message);
      }
      throw error;
    }
  }

  private async requireChild(token?: string) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session || session.role !== 'child') {
      throw new CheckInError('UNAUTHORIZED', 'An active child session is required.');
    }
    return session;
  }
}
