import { randomUUID } from 'node:crypto';

import type { DomainEvent } from '@familystar/shared';

export type EventReceiptStore = {
  claim(
    consumer: string,
    eventId: string,
    ownerToken: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  release(consumer: string, eventId: string, ownerToken: string): Promise<boolean>;
};

export type IdempotentConsumerOptions = Readonly<{
  consumer: string;
  receiptTtlSeconds: number;
  ownerTokenFactory?: () => string;
}>;

export type ConsumeResult = 'processed' | 'duplicate';

export class IdempotentEventConsumer {
  private readonly ownerTokenFactory: () => string;

  constructor(
    private readonly receipts: EventReceiptStore,
    private readonly handler: (event: DomainEvent) => void | Promise<void>,
    private readonly options: IdempotentConsumerOptions,
  ) {
    if (options.consumer.trim().length === 0) {
      throw new Error('Consumer name must not be empty.');
    }
    if (!Number.isSafeInteger(options.receiptTtlSeconds) || options.receiptTtlSeconds <= 0) {
      throw new Error('Receipt TTL must be a positive safe integer.');
    }
    this.ownerTokenFactory = options.ownerTokenFactory ?? randomUUID;
  }

  async consume(event: DomainEvent): Promise<ConsumeResult> {
    const ownerToken = this.ownerTokenFactory();
    const claimed = await this.receipts.claim(
      this.options.consumer,
      event.event_id,
      ownerToken,
      this.options.receiptTtlSeconds,
    );
    if (!claimed) {
      return 'duplicate';
    }

    try {
      await this.handler(event);
      return 'processed';
    } catch (error) {
      await this.receipts.release(this.options.consumer, event.event_id, ownerToken);
      throw error;
    }
  }
}
