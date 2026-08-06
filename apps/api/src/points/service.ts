import { encodeCursor, InvalidPaginationError } from '../http/cursor.js';
import { InvalidQueryFilterError, parseUuidFilter } from '../http/query-validation.js';
import type {
  PointsCursorPosition,
  PointsReadOperations,
  PointsReadServiceDependencies,
} from './types.js';

export class PointsReadAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'PointsReadAccessError';
  }
}

function parsePosition(cursor: PointsCursorPosition | null) {
  if (!cursor) return null;
  const createdAt = new Date(cursor.sortValue);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== cursor.sortValue) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }
  try {
    const id = parseUuidFilter(cursor.id, 'cursor id');
    if (!id) throw new InvalidPaginationError('The cursor is invalid.');
    return { createdAt, id };
  } catch (error) {
    if (error instanceof InvalidPaginationError) throw error;
    if (error instanceof InvalidQueryFilterError) {
      throw new InvalidPaginationError('The cursor is invalid.');
    }
    throw error;
  }
}

export class PointsReadService implements PointsReadOperations {
  constructor(private readonly dependencies: PointsReadServiceDependencies) {}

  async getMe(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'child') {
      throw new PointsReadAccessError('FORBIDDEN', 'A child session is required.');
    }
    return this.read(session.familyId, session.subjectId);
  }

  async getChild(input: { sessionToken?: string; childId: string }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'parent') {
      throw new PointsReadAccessError('FORBIDDEN', 'A parent session is required.');
    }
    return this.read(session.familyId, input.childId);
  }

  async getMyLogs(input: {
    sessionToken?: string;
    cursor: PointsCursorPosition | null;
    limit: number;
  }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'child') {
      throw new PointsReadAccessError('FORBIDDEN', 'A child session is required.');
    }
    const cursor = parsePosition(input.cursor);
    await this.read(session.familyId, session.subjectId);
    const records = await this.dependencies.repository.findChildLogs({
      familyId: session.familyId,
      childId: session.subjectId,
      cursor,
      limit: input.limit,
    });
    const hasMore = records.length > input.limit;
    const logs = records.slice(0, input.limit);
    const last = logs.at(-1);
    return {
      logs,
      page: {
        has_more: hasMore,
        next_cursor:
          hasMore && last
            ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
            : null,
      },
    };
  }

  private async session(token?: string) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) {
      throw new PointsReadAccessError('UNAUTHORIZED', 'An active session is required.');
    }
    return session;
  }

  private async read(familyId: string, childId: string) {
    const points = await this.dependencies.repository.findActiveChildSummary(familyId, childId);
    if (!points) throw new PointsReadAccessError('NOT_FOUND', 'The child was not found.');
    return { points };
  }
}
