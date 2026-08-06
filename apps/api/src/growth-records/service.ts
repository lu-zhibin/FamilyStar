import type { AuthSession } from '../family-auth/types.js';
import { normalizeFamilySettings } from '../family-settings/service.js';
import { encodeCursor, InvalidPaginationError } from '../http/cursor.js';
import {
  InvalidQueryFilterError,
  parseFamilyDateRange,
  parseUuidFilter,
} from '../http/query-validation.js';
import type {
  GrowthRecordCursor,
  GrowthRecordDependencies,
  GrowthRecordOperations,
  GrowthRecordQuery,
  ManualGrowthRecordInput,
  ManualGrowthRecordPatch,
} from './types.js';

export class GrowthRecordAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'GrowthRecordAccessError';
  }
}

export class InvalidGrowthRecordInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGrowthRecordInputError';
  }
}

function parseCursor(cursor: GrowthRecordQuery['cursor']): GrowthRecordCursor | null {
  if (!cursor) return null;
  const occurredOn = new Date(cursor.sortValue);
  if (!Number.isFinite(occurredOn.getTime()) || occurredOn.toISOString() !== cursor.sortValue) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }
  try {
    const id = parseUuidFilter(cursor.id, 'cursor id');
    if (!id) throw new InvalidPaginationError('The cursor is invalid.');
    return { occurredOn, id };
  } catch (error) {
    if (error instanceof InvalidQueryFilterError) {
      throw new InvalidPaginationError('The cursor is invalid.');
    }
    throw error;
  }
}

function businessDate(value: string, timeZone: string): Date {
  const range = parseFamilyDateRange({ startDate: value, endDate: value, timeZone, maxDays: 1 });
  return new Date(`${range.startDate}T00:00:00.000Z`);
}

function businessDateRange(startDate: string, endDate: string, timeZone: string) {
  const range = parseFamilyDateRange({ startDate, endDate, timeZone, maxDays: 366 });
  const endDateExclusive = new Date(`${range.endDate}T00:00:00.000Z`);
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);
  return {
    startDate: new Date(`${range.startDate}T00:00:00.000Z`),
    endDateExclusive,
  };
}

function normalizedMediaIds(mediaIds: readonly string[]): readonly string[] {
  if (mediaIds.length > 10) {
    throw new InvalidGrowthRecordInputError(
      'A growth record can reference at most 10 media assets.',
    );
  }
  const unique = new Set(mediaIds);
  if (unique.size !== mediaIds.length) {
    throw new InvalidGrowthRecordInputError('Growth record media IDs must be unique.');
  }
  return [...unique];
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (normalized.length > 10_000) {
    throw new InvalidGrowthRecordInputError('Growth record content is too long.');
  }
  return normalized.length === 0 ? null : normalized;
}

function normalizeTitle(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new InvalidGrowthRecordInputError('Growth record title is invalid.');
  }
  return normalized;
}

export class GrowthRecordService implements GrowthRecordOperations {
  private readonly now: () => Date;

  constructor(private readonly dependencies: GrowthRecordDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async list(input: GrowthRecordQuery & { sessionToken?: string }) {
    const session = await this.parent(input.sessionToken);
    const timeZone = await this.familyTimeZone(session.familyId);
    if ((input.startDate === undefined) !== (input.endDate === undefined)) {
      throw new InvalidQueryFilterError('start_date and end_date must be provided together.');
    }
    const dateRange =
      input.startDate && input.endDate
        ? businessDateRange(input.startDate, input.endDate, timeZone)
        : null;
    const records = await this.dependencies.repository.findMany({
      familyId: session.familyId,
      filters: {
        ...(input.childId === undefined ? {} : { childId: input.childId }),
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(dateRange === null ? {} : dateRange),
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
            ? encodeCursor({ sortValue: last.occurredOn.toISOString(), id: last.id })
            : null,
      },
    };
  }

  async create(input: Parameters<GrowthRecordOperations['create']>[0]) {
    const session = await this.parent(input.sessionToken);
    const timeZone = await this.familyTimeZone(session.familyId);
    const record: ManualGrowthRecordInput = {
      ...input.record,
      title: normalizeTitle(input.record.title),
      contentText: normalizeText(input.record.contentText),
      occurredOn: businessDate(input.record.occurredOn, timeZone),
      mediaIds: normalizedMediaIds(input.record.mediaIds),
    };
    return {
      record: await this.dependencies.repository.createManual({
        familyId: session.familyId,
        parentId: session.subjectId,
        record,
      }),
    };
  }

  async update(input: Parameters<GrowthRecordOperations['update']>[0]) {
    const session = await this.parent(input.sessionToken);
    const timeZone = await this.familyTimeZone(session.familyId);
    const patch: ManualGrowthRecordPatch = {
      ...(input.record.childId === undefined ? {} : { childId: input.record.childId }),
      ...(input.record.taskId === undefined ? {} : { taskId: input.record.taskId }),
      ...(input.record.type === undefined ? {} : { type: input.record.type }),
      ...(input.record.title === undefined ? {} : { title: normalizeTitle(input.record.title) }),
      ...(input.record.contentText === undefined
        ? {}
        : { contentText: normalizeText(input.record.contentText) }),
      ...(input.record.occurredOn === undefined
        ? {}
        : { occurredOn: businessDate(input.record.occurredOn, timeZone) }),
      ...(input.record.mediaIds === undefined
        ? {}
        : { mediaIds: normalizedMediaIds(input.record.mediaIds) }),
    };
    const record = await this.dependencies.repository.updateManual({
      familyId: session.familyId,
      recordId: input.recordId,
      record: patch,
    });
    if (!record) throw new GrowthRecordAccessError('NOT_FOUND', 'The growth record was not found.');
    return { record };
  }

  async remove(input: Parameters<GrowthRecordOperations['remove']>[0]) {
    const session = await this.parent(input.sessionToken);
    if (
      !(await this.dependencies.repository.softDeleteManual(
        session.familyId,
        input.recordId,
        this.now(),
      ))
    ) {
      throw new GrowthRecordAccessError('NOT_FOUND', 'The growth record was not found.');
    }
  }

  private async familyTimeZone(familyId: string): Promise<string> {
    const settings = await this.dependencies.repository.findFamilySettings(familyId);
    if (!settings) throw new GrowthRecordAccessError('NOT_FOUND', 'The family was not found.');
    return normalizeFamilySettings(settings).timeZone;
  }

  private async parent(token?: string): Promise<AuthSession> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session)
      throw new GrowthRecordAccessError('UNAUTHORIZED', 'An active session is required.');
    if (session.role !== 'parent') {
      throw new GrowthRecordAccessError('FORBIDDEN', 'A parent session is required.');
    }
    return session;
  }
}
