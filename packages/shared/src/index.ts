import type { ErrorCode } from './errors.js';

export { ERROR_CODES } from './errors.js';
export type { ErrorCode } from './errors.js';
export { createDomainEvent, isEventName, parseEventName } from './events.js';
export type {
  DomainEvent,
  DomainEventInput,
  EventName,
  EventNameParts,
  EventPayload,
  JsonValue,
} from './events.js';
export {
  PLUGIN_REGISTRY_ERROR_CODES,
  PluginRegistry,
  PluginRegistryError,
  validatePluginManifest,
} from './plugins.js';
export {
  CORE_FAMILY_MODULE_IDS,
  DEFAULT_OPTIONAL_FAMILY_MODULE_STATES,
  FAMILY_MODULE_DEFINITIONS,
  OPTIONAL_FAMILY_MODULE_IDS,
} from './family-modules.js';
export { DEFAULT_THEME_KEY, findTheme, THEME_CATALOG } from './themes.js';
export type { ThemeDefinition, ThemeTokenName } from './themes.js';
export type {
  CoreFamilyModuleId,
  FamilyModuleDefinition,
  FamilyModuleId,
  FamilyModulesReadModel,
  FamilyModuleState,
  OptionalFamilyModuleId,
} from './family-modules.js';
export type {
  Plugin,
  PluginManifest,
  PluginRegistryErrorCode,
  PluginRegistryOptions,
} from './plugins.js';

export type MediaType = 'image' | 'video' | 'audio';

export type MediaAttachment = {
  id: string;
  type: MediaType;
  url: string;
  thumbnail_url?: string;
  duration?: number;
  size_bytes: number;
  width?: number;
  height?: number;
  created_at: string;
};

export type ServiceInfo = {
  name: string;
  version: string;
};

export type ApiResponseMeta = {
  request_id: string;
  timestamp: string;
};

export type CursorPage = {
  next_cursor: string | null;
  has_more: boolean;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta: ApiResponseMeta;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ApiResponseMeta;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type HealthInfo = ServiceInfo & {
  status: 'ok';
  checked_at: string;
  uptime_seconds: number;
};
