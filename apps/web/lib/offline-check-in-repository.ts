export const OFFLINE_CHECK_IN_DB = {
  name: 'familystar-offline',
  version: 1,
  stores: {
    checkInQueue: 'check-in-queue',
    mediaDrafts: 'media-drafts',
  },
} as const;

export const MEDIA_DRAFT_LIMITS = {
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
  ],
  imageBytes: 25 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  totalBytes: 200 * 1024 * 1024,
  totalFiles: 10,
} as const;

export type QueuedSubmissionType = 'TICK' | 'TEXT';
export type CheckInQueueStatus = 'pending';
export type MediaDraftStatus = 'awaiting-confirmation';

export type CheckInAttemptMetadata = Readonly<{
  attemptCount: number;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
}>;

export type CheckInQueueRecord = Readonly<{
  id: string;
  intentId: string;
  createdAt: string;
  endpoint: '/check-ins';
  taskId: string;
  taskAssignmentId: string;
  checkDate: string;
  submissionType: QueuedSubmissionType;
  text?: string;
  idempotencyKey: string;
  status: CheckInQueueStatus;
  attempt: CheckInAttemptMetadata;
}>;

export type NewCheckInQueueRecord = Omit<CheckInQueueRecord, 'status' | 'attempt'>;

export type MediaDraftRecord = Readonly<{
  id: string;
  intentId: string;
  createdAt: string;
  taskId: string;
  taskAssignmentId: string;
  queueId: string | null;
  submissionType: 'PHOTO' | 'VIDEO' | 'MIXED';
  text?: string;
  checkInIdempotencyKey: string;
  uploadIdempotencyKey: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  status: MediaDraftStatus;
}>;

export type NewMediaDraftRecord = Omit<MediaDraftRecord, 'status'>;

export interface OfflineCheckInRepository {
  enqueueCheckIn(record: NewCheckInQueueRecord): Promise<CheckInQueueRecord>;
  listCheckIns(): Promise<readonly CheckInQueueRecord[]>;
  saveMediaDrafts(records: readonly NewMediaDraftRecord[]): Promise<readonly MediaDraftRecord[]>;
  listMediaDrafts(): Promise<readonly MediaDraftRecord[]>;
}

export type OfflineStorageErrorCode =
  | 'UNSUPPORTED'
  | 'INVALID_MEDIA_TYPE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_LIMIT_EXCEEDED'
  | 'INVALID_QUEUE_LINK'
  | 'QUOTA_EXCEEDED'
  | 'TRANSACTION_FAILED';

const storageMessages: Record<OfflineStorageErrorCode, string> = {
  UNSUPPORTED: '当前浏览器无法使用离线存储，请联网后再提交。',
  INVALID_MEDIA_TYPE: '该文件类型无法保存为媒体草稿。',
  FILE_TOO_LARGE: '文件超过本地草稿的单文件大小限制。',
  TOTAL_LIMIT_EXCEEDED: '本地媒体草稿已达到数量或总容量限制。',
  INVALID_QUEUE_LINK: '媒体草稿关联的离线打卡不存在。',
  QUOTA_EXCEEDED: '设备存储空间不足，媒体草稿保存失败。',
  TRANSACTION_FAILED: '离线存储写入失败，请释放空间或联网后重试。',
};

export class OfflineStorageError extends Error {
  constructor(
    readonly code: OfflineStorageErrorCode,
    options?: ErrorOptions,
  ) {
    super(storageMessages[code], options);
    this.name = 'OfflineStorageError';
  }
}

function compareCreatedAt<T extends { createdAt: string; id: string }>(left: T, right: T): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function validateMediaFile(record: NewMediaDraftRecord): void {
  if (!MEDIA_DRAFT_LIMITS.allowedMimeTypes.includes(record.mimeType as never)) {
    throw new OfflineStorageError('INVALID_MEDIA_TYPE');
  }
  const maximum = record.mimeType.startsWith('image/')
    ? MEDIA_DRAFT_LIMITS.imageBytes
    : MEDIA_DRAFT_LIMITS.videoBytes;
  if (record.size < 1 || record.size > maximum || record.blob.size !== record.size) {
    throw new OfflineStorageError('FILE_TOO_LARGE');
  }
}

function validateMediaTotal(
  existing: readonly MediaDraftRecord[],
  incoming: readonly NewMediaDraftRecord[],
): void {
  incoming.forEach(validateMediaFile);
  const fileCount = existing.length + incoming.length;
  const byteCount = [...existing, ...incoming].reduce((sum, record) => sum + record.size, 0);
  if (fileCount > MEDIA_DRAFT_LIMITS.totalFiles || byteCount > MEDIA_DRAFT_LIMITS.totalBytes) {
    throw new OfflineStorageError('TOTAL_LIMIT_EXCEEDED');
  }
}

function pendingRecord(record: NewCheckInQueueRecord): CheckInQueueRecord {
  return {
    ...record,
    status: 'pending',
    attempt: { attemptCount: 0, lastAttemptAt: null, lastErrorCode: null },
  };
}

function awaitingConfirmation(record: NewMediaDraftRecord): MediaDraftRecord {
  return { ...record, status: 'awaiting-confirmation' };
}

export class MemoryOfflineCheckInRepository implements OfflineCheckInRepository {
  private readonly checkIns = new Map<string, CheckInQueueRecord>();
  private readonly mediaDrafts = new Map<string, MediaDraftRecord>();

  async enqueueCheckIn(record: NewCheckInQueueRecord): Promise<CheckInQueueRecord> {
    const existing = [...this.checkIns.values()].find((item) => item.intentId === record.intentId);
    if (existing) return existing;
    const queued = pendingRecord(record);
    this.checkIns.set(queued.id, queued);
    return queued;
  }

  async listCheckIns(): Promise<readonly CheckInQueueRecord[]> {
    return [...this.checkIns.values()].sort(compareCreatedAt);
  }

  async saveMediaDrafts(
    records: readonly NewMediaDraftRecord[],
  ): Promise<readonly MediaDraftRecord[]> {
    if (records.length === 0) return [];
    const existingIntent = [...this.mediaDrafts.values()].filter(
      (item) => item.intentId === records[0]!.intentId,
    );
    if (existingIntent.length > 0) return existingIntent.sort(compareCreatedAt);
    const queueIds = new Set([...this.checkIns.keys()]);
    if (records.some(({ queueId }) => queueId !== null && !queueIds.has(queueId))) {
      throw new OfflineStorageError('INVALID_QUEUE_LINK');
    }
    const existing = [...this.mediaDrafts.values()];
    validateMediaTotal(existing, records);
    const drafts = records.map(awaitingConfirmation);
    drafts.forEach((draft) => this.mediaDrafts.set(draft.id, draft));
    return drafts;
  }

  async listMediaDrafts(): Promise<readonly MediaDraftRecord[]> {
    return [...this.mediaDrafts.values()].sort(compareCreatedAt);
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function storageError(error: unknown): OfflineStorageError {
  if (error instanceof OfflineStorageError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new OfflineStorageError('QUOTA_EXCEEDED', { cause: error });
  }
  return new OfflineStorageError('TRANSACTION_FAILED', {
    cause: error instanceof Error ? error : undefined,
  });
}

export class IndexedDbOfflineCheckInRepository implements OfflineCheckInRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDb: IDBFactory | undefined = globalThis.indexedDB) {}

  private database(): Promise<IDBDatabase> {
    if (!this.indexedDb) return Promise.reject(new OfflineStorageError('UNSUPPORTED'));
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDb!.open(OFFLINE_CHECK_IN_DB.name, OFFLINE_CHECK_IN_DB.version);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OFFLINE_CHECK_IN_DB.stores.checkInQueue)) {
          const queue = database.createObjectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue, {
            keyPath: 'id',
          });
          queue.createIndex('intentId', 'intentId', { unique: true });
          queue.createIndex('createdAt', 'createdAt');
          queue.createIndex('status', 'status');
        }
        if (!database.objectStoreNames.contains(OFFLINE_CHECK_IN_DB.stores.mediaDrafts)) {
          const drafts = database.createObjectStore(OFFLINE_CHECK_IN_DB.stores.mediaDrafts, {
            keyPath: 'id',
          });
          drafts.createIndex('intentId', 'intentId');
          drafts.createIndex('createdAt', 'createdAt');
          drafts.createIndex('status', 'status');
          drafts.createIndex('taskId', 'taskId');
          drafts.createIndex('queueId', 'queueId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(storageError(request.error));
      request.onblocked = () => reject(new OfflineStorageError('TRANSACTION_FAILED'));
    });
    return this.databasePromise;
  }

  async enqueueCheckIn(record: NewCheckInQueueRecord): Promise<CheckInQueueRecord> {
    try {
      const database = await this.database();
      const transaction = database.transaction(
        OFFLINE_CHECK_IN_DB.stores.checkInQueue,
        'readwrite',
      );
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue);
      const existing = (await requestResult(store.index('intentId').get(record.intentId))) as
        CheckInQueueRecord | undefined;
      if (existing) {
        transaction.abort();
        return existing;
      }
      const queued = pendingRecord(record);
      store.add(queued);
      await transactionComplete(transaction);
      return queued;
    } catch (error) {
      throw storageError(error);
    }
  }

  async listCheckIns(): Promise<readonly CheckInQueueRecord[]> {
    try {
      const database = await this.database();
      const transaction = database.transaction(OFFLINE_CHECK_IN_DB.stores.checkInQueue, 'readonly');
      const values = (await requestResult(
        transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue).getAll(),
      )) as CheckInQueueRecord[];
      await transactionComplete(transaction);
      return values.sort(compareCreatedAt);
    } catch (error) {
      throw storageError(error);
    }
  }

  async saveMediaDrafts(
    records: readonly NewMediaDraftRecord[],
  ): Promise<readonly MediaDraftRecord[]> {
    if (records.length === 0) return [];
    try {
      const database = await this.database();
      const transaction = database.transaction(
        [OFFLINE_CHECK_IN_DB.stores.checkInQueue, OFFLINE_CHECK_IN_DB.stores.mediaDrafts],
        'readwrite',
      );
      const queueStore = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue);
      const draftStore = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.mediaDrafts);
      const existingIntent = (await requestResult(
        draftStore.index('intentId').getAll(records[0]!.intentId),
      )) as MediaDraftRecord[];
      if (existingIntent.length > 0) {
        transaction.abort();
        return existingIntent.sort(compareCreatedAt);
      }
      for (const { queueId } of records) {
        if (queueId !== null && !(await requestResult(queueStore.get(queueId)))) {
          transaction.abort();
          throw new OfflineStorageError('INVALID_QUEUE_LINK');
        }
      }
      const existing = (await requestResult(draftStore.getAll())) as MediaDraftRecord[];
      validateMediaTotal(existing, records);
      const drafts = records.map(awaitingConfirmation);
      drafts.forEach((draft) => draftStore.add(draft));
      await transactionComplete(transaction);
      return drafts;
    } catch (error) {
      throw storageError(error);
    }
  }

  async listMediaDrafts(): Promise<readonly MediaDraftRecord[]> {
    try {
      const database = await this.database();
      const transaction = database.transaction(OFFLINE_CHECK_IN_DB.stores.mediaDrafts, 'readonly');
      const values = (await requestResult(
        transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.mediaDrafts).getAll(),
      )) as MediaDraftRecord[];
      await transactionComplete(transaction);
      return values.sort(compareCreatedAt);
    } catch (error) {
      throw storageError(error);
    }
  }
}

let browserRepository: OfflineCheckInRepository | null = null;

export function getOfflineCheckInRepository(): OfflineCheckInRepository | null {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  browserRepository ??= new IndexedDbOfflineCheckInRepository(indexedDB);
  return browserRepository;
}
