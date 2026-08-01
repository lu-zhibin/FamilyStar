import { validatePluginManifest } from '@familystar/shared';
import type { DomainEvent, EventName, PluginManifest } from '@familystar/shared';

export const EVENT_BUS_ERROR_CODES = {
  PUBLISH_DENIED: 'PUBLISH_DENIED',
  SUBSCRIBE_DENIED: 'SUBSCRIBE_DENIED',
} as const;

export type EventBusErrorCode = (typeof EVENT_BUS_ERROR_CODES)[keyof typeof EVENT_BUS_ERROR_CODES];

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export type EventBusScope = Readonly<{
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventName: EventName, handler: EventHandler): () => void;
}>;

export type EventPublisher = Readonly<Pick<EventBusScope, 'publish'>>;

export class EventBusAccessError extends Error {
  readonly code: EventBusErrorCode;
  readonly pluginName: string;
  readonly eventName: string;

  constructor(code: EventBusErrorCode, pluginName: string, eventName: string) {
    super(`Plugin ${pluginName} cannot access event ${eventName}.`);
    this.name = 'EventBusAccessError';
    this.code = code;
    this.pluginName = pluginName;
    this.eventName = eventName;
  }
}

export class EventBus {
  private readonly handlers = new Map<EventName, Map<symbol, EventHandler>>();

  createScope(sourceManifest: PluginManifest): EventBusScope {
    const manifest = validatePluginManifest(sourceManifest);

    return Object.freeze({
      publish: async (event: DomainEvent) => {
        if (!manifest.publishes.includes(event.event_name)) {
          throw new EventBusAccessError(
            EVENT_BUS_ERROR_CODES.PUBLISH_DENIED,
            manifest.name,
            event.event_name,
          );
        }

        await this.publish(event);
      },
      subscribe: (eventName: EventName, handler: EventHandler) => {
        if (!manifest.subscribes.includes(eventName)) {
          throw new EventBusAccessError(
            EVENT_BUS_ERROR_CODES.SUBSCRIBE_DENIED,
            manifest.name,
            eventName,
          );
        }

        return this.subscribe(eventName, handler);
      },
    });
  }

  createOutboxPublisher(): EventPublisher {
    return Object.freeze({
      publish: (event: DomainEvent) => this.publish(event),
    });
  }

  private subscribe(eventName: EventName, handler: EventHandler): () => void {
    const token = Symbol(eventName);
    const handlers = this.handlers.get(eventName) ?? new Map<symbol, EventHandler>();
    handlers.set(token, handler);
    this.handlers.set(eventName, handlers);

    return () => {
      handlers.delete(token);
      if (handlers.size === 0) {
        this.handlers.delete(eventName);
      }
    };
  }

  private async publish(event: DomainEvent): Promise<void> {
    const handlers = [...(this.handlers.get(event.event_name)?.values() ?? [])];
    for (const handler of handlers) {
      await handler(event);
    }
  }
}
