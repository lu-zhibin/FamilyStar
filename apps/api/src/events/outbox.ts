import type { DomainEvent } from '@familystar/shared';

export type TransactionRunner<Transaction> = {
  run<Result>(work: (transaction: Transaction) => Promise<Result>): Promise<Result>;
};

export type OutboxWriter<Transaction> = {
  append(transaction: Transaction, event: DomainEvent): Promise<void>;
};

export type TransactionResult<Result> = Readonly<{
  result: Result;
  events: readonly DomainEvent[];
}>;

export async function runWithOutbox<Transaction, Result>(
  runner: TransactionRunner<Transaction>,
  writer: OutboxWriter<Transaction>,
  work: (transaction: Transaction) => Promise<TransactionResult<Result>>,
): Promise<Result> {
  return runner.run(async (transaction) => {
    const { result, events } = await work(transaction);
    for (const event of events) {
      await writer.append(transaction, event);
    }
    return result;
  });
}

export type ClaimedOutboxEvent = Readonly<{
  event: DomainEvent;
  attempts: number;
}>;

export type ClaimOutboxOptions = Readonly<{
  workerId: string;
  batchSize: number;
  leaseMilliseconds: number;
  now: Date;
}>;

export type OutboxRepository = {
  claimBatch(options: ClaimOutboxOptions): Promise<readonly ClaimedOutboxEvent[]>;
  markPublished(eventId: string, workerId: string, publishedAt: Date): Promise<void>;
  reschedule(
    eventId: string,
    workerId: string,
    availableAt: Date,
    errorCode: string,
  ): Promise<void>;
};

export type OutboxPublisher = {
  publish(event: DomainEvent): Promise<void>;
};

export type OutboxDispatcherOptions = Readonly<{
  workerId: string;
  batchSize: number;
  leaseMilliseconds: number;
  retryBaseMilliseconds: number;
  retryMaxMilliseconds: number;
  clock?: () => Date;
}>;

export type DispatchResult = Readonly<{
  claimed: number;
  published: number;
  failed: number;
}>;

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
}

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function errorCodeOf(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) {
    return error.name.slice(0, 80);
  }
  return 'UnknownError';
}

export class OutboxDispatcher {
  private readonly clock: () => Date;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: OutboxPublisher,
    private readonly options: OutboxDispatcherOptions,
  ) {
    requireNonEmpty(options.workerId, 'Worker ID');
    requirePositiveSafeInteger(options.batchSize, 'Batch size');
    requirePositiveSafeInteger(options.leaseMilliseconds, 'Lease duration');
    requirePositiveSafeInteger(options.retryBaseMilliseconds, 'Retry base duration');
    requirePositiveSafeInteger(options.retryMaxMilliseconds, 'Retry maximum duration');
    if (options.retryMaxMilliseconds < options.retryBaseMilliseconds) {
      throw new Error('Retry maximum duration must be at least the retry base duration.');
    }
    this.clock = options.clock ?? (() => new Date());
  }

  async dispatchBatch(): Promise<DispatchResult> {
    const claimed = await this.repository.claimBatch({
      workerId: this.options.workerId,
      batchSize: this.options.batchSize,
      leaseMilliseconds: this.options.leaseMilliseconds,
      now: this.clock(),
    });
    let published = 0;
    let failed = 0;

    for (const item of claimed) {
      try {
        await this.publisher.publish(item.event);
        await this.repository.markPublished(
          item.event.event_id,
          this.options.workerId,
          this.clock(),
        );
        published += 1;
      } catch (error) {
        const retryAt = new Date(this.clock().getTime() + this.retryDelay(item.attempts));
        await this.repository.reschedule(
          item.event.event_id,
          this.options.workerId,
          retryAt,
          errorCodeOf(error),
        );
        failed += 1;
      }
    }

    return Object.freeze({ claimed: claimed.length, published, failed });
  }

  private retryDelay(attempts: number): number {
    const exponent = Math.min(Math.max(0, attempts - 1), 52);
    return Math.min(
      this.options.retryMaxMilliseconds,
      this.options.retryBaseMilliseconds * 2 ** exponent,
    );
  }
}
