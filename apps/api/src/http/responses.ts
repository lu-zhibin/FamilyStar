import type { ApiErrorResponse, ApiSuccessResponse, ErrorCode } from '@familystar/shared';

export function createSuccessResponse<T>(
  data: T,
  requestId: string,
  timestamp = new Date().toISOString(),
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      request_id: requestId,
      timestamp,
    },
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  timestamp = new Date().toISOString(),
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    meta: {
      request_id: requestId,
      timestamp,
    },
  };
}
