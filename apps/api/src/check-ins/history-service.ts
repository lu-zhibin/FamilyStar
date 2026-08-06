import { normalizeFamilySettings } from '../family-settings/service.js';
import { encodeCursor, InvalidPaginationError } from '../http/cursor.js';
import {
  InvalidQueryFilterError,
  parseFamilyDateRange,
  parseUuidFilter,
} from '../http/query-validation.js';
import type {
  HistoryCursor,
  HistoryOperations,
  HistoryQuery,
  HistoryServiceDependencies,
  HistorySubmissionType,
} from './history-types.js';

export class HistoryAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'HistoryAccessError';
  }
}

function parseCursor(cursor: HistoryQuery['cursor']): HistoryCursor | null {
  if (!cursor) return null;
  const submittedAt = new Date(cursor.sortValue);
  if (!Number.isFinite(submittedAt.getTime()) || submittedAt.toISOString() !== cursor.sortValue) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }
  const match = /^(SOLO|COLLABORATION):(.+)$/.exec(cursor.id);
  if (!match) throw new InvalidPaginationError('The cursor is invalid.');
  try {
    const attemptId = parseUuidFilter(match[2], 'cursor attempt id');
    if (!attemptId) throw new InvalidPaginationError('The cursor is invalid.');
    return {
      submittedAt,
      submissionType: match[1] as HistorySubmissionType,
      attemptId,
    };
  } catch (error) {
    if (error instanceof InvalidPaginationError) throw error;
    if (error instanceof InvalidQueryFilterError) {
      throw new InvalidPaginationError('The cursor is invalid.');
    }
    throw error;
  }
}

function businessDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { startDate: start, endDateExclusive: endExclusive };
}

export class HistoryService implements HistoryOperations {
  constructor(private readonly dependencies: HistoryServiceDependencies) {}

  async getMine(input: HistoryQuery & { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'child') {
      throw new HistoryAccessError('FORBIDDEN', 'A child session is required.');
    }
    return this.read(session.familyId, { ...input, childId: session.subjectId });
  }

  async getFamily(input: HistoryQuery & { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'parent') {
      throw new HistoryAccessError('FORBIDDEN', 'A parent session is required.');
    }
    return this.read(session.familyId, input);
  }

  private async read(familyId: string, input: HistoryQuery) {
    const settings = await this.dependencies.repository.findFamilySettings(familyId);
    if (!settings) throw new HistoryAccessError('NOT_FOUND', 'The family was not found.');
    if ((input.startDate === undefined) !== (input.endDate === undefined)) {
      throw new InvalidQueryFilterError('start_date and end_date must be provided together.');
    }
    const dateRange =
      input.startDate && input.endDate
        ? parseFamilyDateRange({
            startDate: input.startDate,
            endDate: input.endDate,
            timeZone: normalizeFamilySettings(settings).timeZone,
            maxDays: 366,
          })
        : null;
    const businessDates = dateRange
      ? businessDateRange(dateRange.startDate, dateRange.endDate)
      : null;
    const records = await this.dependencies.repository.findHistory({
      familyId,
      filters: {
        ...(input.childId === undefined ? {} : { childId: input.childId }),
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.submissionType === undefined ? {} : { submissionType: input.submissionType }),
        ...(businessDates === null ? {} : businessDates),
      },
      cursor: parseCursor(input.cursor),
      limit: input.limit,
    });
    const hasMore = records.length > input.limit;
    const items = records.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items,
      page: {
        has_more: hasMore,
        next_cursor:
          hasMore && last
            ? encodeCursor({
                sortValue: last.submittedAt.toISOString(),
                id: `${last.submissionType}:${last.attemptId}`,
              })
            : null,
      },
    };
  }

  private async session(token?: string) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new HistoryAccessError('UNAUTHORIZED', 'An active session is required.');
    return session;
  }
}
