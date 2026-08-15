export const DEFAULT_CURSOR_PAGE_LIMIT = 20;
export const MAX_CURSOR_PAGE_LIMIT = 100;

const CURSOR_VERSION = 1;
const MAX_ENCODED_CURSOR_LENGTH = 2048;
const MAX_SORT_VALUE_LENGTH = 512;
const MAX_ID_LENGTH = 256;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const positiveIntegerPattern = /^[1-9]\d*$/;

export type CursorPosition = Readonly<{
  sortValue: string;
  id: string;
}>;

export type CursorPageQuery = Readonly<{
  cursor: CursorPosition | null;
  limit: number;
}>;

export class InvalidPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaginationError';
  }
}

function validatePosition(value: unknown): CursorPosition {
  if (!Array.isArray(value) || value.length !== 3 || value[0] !== CURSOR_VERSION) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }

  const sortValue = value[1];
  const id = value[2];
  if (
    typeof sortValue !== 'string' ||
    sortValue.length === 0 ||
    sortValue.length > MAX_SORT_VALUE_LENGTH ||
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > MAX_ID_LENGTH
  ) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }

  return { sortValue, id };
}

export function encodeCursor(position: CursorPosition): string {
  const validated = validatePosition([CURSOR_VERSION, position.sortValue, position.id]);
  return Buffer.from(
    JSON.stringify([CURSOR_VERSION, validated.sortValue, validated.id]),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  if (
    cursor.length === 0 ||
    cursor.length > MAX_ENCODED_CURSOR_LENGTH ||
    !base64UrlPattern.test(cursor)
  ) {
    throw new InvalidPaginationError('The cursor is invalid.');
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const position = validatePosition(JSON.parse(decoded) as unknown);
    if (encodeCursor(position) !== cursor) {
      throw new InvalidPaginationError('The cursor is invalid.');
    }
    return position;
  } catch (error) {
    if (error instanceof InvalidPaginationError) throw error;
    throw new InvalidPaginationError('The cursor is invalid.');
  }
}

export function parseCursorPageQuery(
  query: Readonly<{ cursor?: string; limit?: string }>,
  options: Readonly<{ defaultLimit?: number; maxLimit?: number }> = {},
): CursorPageQuery {
  const defaultLimit = options.defaultLimit ?? DEFAULT_CURSOR_PAGE_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_CURSOR_PAGE_LIMIT;
  if (
    !Number.isSafeInteger(defaultLimit) ||
    defaultLimit < 1 ||
    !Number.isSafeInteger(maxLimit) ||
    maxLimit < 1 ||
    defaultLimit > maxLimit
  ) {
    throw new InvalidPaginationError('The pagination limits are invalid.');
  }

  let limit = defaultLimit;
  if (query.limit !== undefined) {
    if (!positiveIntegerPattern.test(query.limit)) {
      throw new InvalidPaginationError('The page limit must be a positive integer.');
    }
    limit = Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit > maxLimit) {
      throw new InvalidPaginationError(`The page limit cannot exceed ${maxLimit}.`);
    }
  }

  return {
    cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
    limit,
  };
}
