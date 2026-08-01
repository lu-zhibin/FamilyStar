import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ERROR_CODES,
  PLUGIN_REGISTRY_ERROR_CODES,
  PluginRegistry,
  createDomainEvent,
} from './index.js';
import type {
  ApiErrorResponse,
  ApiResponse,
  ApiSuccessResponse,
  DomainEvent,
  EventName,
  EventPayload,
  HealthInfo,
  MediaAttachment,
  Plugin,
  PluginManifest,
  PluginRegistryErrorCode,
  PluginRegistryOptions,
  ServiceInfo,
} from './index.js';

describe('shared API types', () => {
  it('exposes runtime error codes through the public entry point', () => {
    expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
  });

  it('uses success as the response discriminant', () => {
    expectTypeOf<ApiResponse<ServiceInfo>>().toEqualTypeOf<
      ApiSuccessResponse<ServiceInfo> | ApiErrorResponse
    >();
  });

  it('keeps health information compatible with service information', () => {
    expectTypeOf<HealthInfo>().toMatchTypeOf<ServiceInfo>();
    expectTypeOf<HealthInfo['status']>().toEqualTypeOf<'ok'>();
    expectTypeOf<HealthInfo['uptime_seconds']>().toEqualTypeOf<number>();
  });

  it('supports optional media metadata without requiring placeholder values', () => {
    const media: MediaAttachment = {
      id: 'media-1',
      type: 'image',
      url: 'https://media.example.test/image.jpg',
      size_bytes: 1024,
      created_at: '2026-07-30T00:00:00.000Z',
    };

    expect(media.thumbnail_url).toBeUndefined();
    expect(media.duration).toBeUndefined();
  });

  it('exposes plugin contracts through the public entry point', () => {
    const options: PluginRegistryOptions<{ service: string }> = {
      context: { service: 'familystar' },
      allowedPermissions: [],
    };
    const registry = new PluginRegistry(options);

    expect(registry.list()).toEqual([]);
    expect(PLUGIN_REGISTRY_ERROR_CODES.INVALID_MANIFEST).toBe('INVALID_MANIFEST');
    expectTypeOf<PluginRegistryErrorCode>().toEqualTypeOf<
      (typeof PLUGIN_REGISTRY_ERROR_CODES)[keyof typeof PLUGIN_REGISTRY_ERROR_CODES]
    >();
    expectTypeOf<Plugin<{ service: string }>['manifest']>().toEqualTypeOf<PluginManifest>();
  });

  it('exposes versioned domain event contracts through the public entry point', () => {
    const event = createDomainEvent({
      event_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f185',
      event_name: 'core.family.created.v1',
      occurred_at: '2026-07-30T10:00:00.000Z',
      family_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f186',
      actor_id: null,
      correlation_id: 'request_123',
      payload: { family_name: 'FamilyStar' },
    });

    expect(event.event_name).toBe('core.family.created.v1');
    expectTypeOf<DomainEvent<EventName, EventPayload>['payload']>().toEqualTypeOf<EventPayload>();
  });
});
