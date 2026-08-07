export const OFFLINE_CHECK_IN_DB = {
  name: 'familystar-offline',
  version: 2,
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
export type CheckInQueueStatus = 'pending' | 'syncing' | 'conflict' | 'business-failed';
export type MediaDraftStatus =
  'awaiting-confirmation' | 'uploading' | 'conflict' | 'business-failed';

export type OfflineOwnerScope = Readonly<{
  familyId: string;
  childId: string;
}>;

export type OfflineFailure = Readonly<{
  code: string;
  message: string;
  authoritativeState: Record<string, unknown> | null;
}>;

export type CheckInAttemptMetadata = Readonly<{
  attemptCount: number;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
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
  owner: OfflineOwnerScope;
  status: CheckInQueueStatus;
  attempt: CheckInAttemptMetadata;
  failure: OfflineFailure | null;
  leaseOwner: string | null;
  leaseUntil: string | null;
}>;

export type NewCheckInQueueRecord = Omit<
  CheckInQueueRecord,
  'status' | 'attempt' | 'failure' | 'leaseOwner' | 'leaseUntil'
>;

export type MediaDraftRecord = Readonly<{
  id: string;
  intentId: string;
  createdAt: string;
  taskId: string;
  taskAssignmentId: string;
  checkDate: string;
  queueId: string | null;
  submissionType: 'PHOTO' | 'VIDEO' | 'MIXED';
  text?: string;
  checkInIdempotencyKey: string;
  uploadIdempotencyKey: string;
  owner: OfflineOwnerScope;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  status: MediaDraftStatus;
  uploadedMediaId: string | null;
  failure: OfflineFailure | null;
}>;

export type NewMediaDraftRecord = Omit<MediaDraftRecord, 'status' | 'uploadedMediaId' | 'failure'>;

export interface OfflineCheckInRepository {
  enqueueCheckIn(record: NewCheckInQueueRecord): Promise<CheckInQueueRecord>;
  listCheckIns(): Promise<readonly CheckInQueueRecord[]>;
  claimNextCheckIn(
    owner: OfflineOwnerScope,
    leaseOwner: string,
    now: Date,
    leaseMilliseconds: number,
  ): Promise<CheckInQueueRecord | null>;
  recordAttempt(
    id: string,
    leaseOwner: string,
    errorCode: string,
    attemptedAt: Date,
    nextAttemptAt?: Date,
  ): Promise<void>;
  markConflict(id: string, leaseOwner: string, failure: OfflineFailure): Promise<void>;
  markBusinessFailed(id: string, leaseOwner: string, failure: OfflineFailure): Promise<void>;
  removeCompleted(id: string, leaseOwner: string): Promise<void>;
  retryCheckIn(id: string, owner: OfflineOwnerScope): Promise<void>;
  deleteCheckIn(id: string, owner: OfflineOwnerScope): Promise<void>;
  saveMediaDrafts(records: readonly NewMediaDraftRecord[]): Promise<readonly MediaDraftRecord[]>;
  listMediaDrafts(): Promise<readonly MediaDraftRecord[]>;
  markMediaUploading(intentId: string, owner: OfflineOwnerScope): Promise<void>;
  markMediaUploaded(id: string, owner: OfflineOwnerScope, mediaId: string): Promise<void>;
  markMediaFailed(
    intentId: string,
    owner: OfflineOwnerScope,
    status: 'conflict' | 'business-failed' | 'awaiting-confirmation',
    failure: OfflineFailure,
  ): Promise<void>;
  removeMediaDrafts(intentId: string, owner: OfflineOwnerScope): Promise<void>;
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
    attempt: {
      attemptCount: 0,
      lastAttemptAt: null,
      lastErrorCode: null,
      nextAttemptAt: null,
    },
    failure: null,
    leaseOwner: null,
    leaseUntil: null,
  };
}

function awaitingConfirmation(record: NewMediaDraftRecord): MediaDraftRecord {
  return {
    ...record,
    status: 'awaiting-confirmation',
    uploadedMediaId: null,
    failure: null,
  };
}

function sameOwner(record: { owner?: OfflineOwnerScope }, owner: OfflineOwnerScope): boolean {
  return record.owner?.familyId === owner.familyId && record.owner.childId === owner.childId;
}

function claimedBy(record: CheckInQueueRecord, leaseOwner: string): boolean {
  return record.status === 'syncing' && record.leaseOwner === leaseOwner;
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

  async claimNextCheckIn(
    owner: OfflineOwnerScope,
    leaseOwner: string,
    now: Date,
    leaseMilliseconds: number,
  ): Promise<CheckInQueueRecord | null> {
    const records = [...this.checkIns.values()].filter((record) => sameOwner(record, owner));
    records.sort(compareCreatedAt);
    const first = records[0];
    if (!first || first.status === 'conflict' || first.status === 'business-failed') return null;
    const nowIso = now.toISOString();
    if (first.attempt.nextAttemptAt && first.attempt.nextAttemptAt > nowIso) return null;
    if (first.status === 'syncing' && first.leaseUntil && first.leaseUntil > nowIso) return null;
    const claimed: CheckInQueueRecord = {
      ...first,
      status: 'syncing',
      leaseOwner,
      leaseUntil: new Date(now.getTime() + leaseMilliseconds).toISOString(),
    };
    this.checkIns.set(first.id, claimed);
    return claimed;
  }

  async recordAttempt(
    id: string,
    leaseOwner: string,
    errorCode: string,
    attemptedAt: Date,
    nextAttemptAt?: Date,
  ): Promise<void> {
    const record = this.checkIns.get(id);
    if (!record || !claimedBy(record, leaseOwner)) return;
    this.checkIns.set(id, {
      ...record,
      status: 'pending',
      attempt: {
        attemptCount: record.attempt.attemptCount + 1,
        lastAttemptAt: attemptedAt.toISOString(),
        lastErrorCode: errorCode,
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
      },
      leaseOwner: null,
      leaseUntil: null,
    });
  }

  async markConflict(id: string, leaseOwner: string, failure: OfflineFailure): Promise<void> {
    this.markTerminal(id, leaseOwner, 'conflict', failure);
  }

  async markBusinessFailed(id: string, leaseOwner: string, failure: OfflineFailure): Promise<void> {
    this.markTerminal(id, leaseOwner, 'business-failed', failure);
  }

  async removeCompleted(id: string, leaseOwner: string): Promise<void> {
    const record = this.checkIns.get(id);
    if (record && claimedBy(record, leaseOwner)) this.checkIns.delete(id);
  }

  async retryCheckIn(id: string, owner: OfflineOwnerScope): Promise<void> {
    const record = this.checkIns.get(id);
    if (!record || !sameOwner(record, owner) || record.status === 'syncing') return;
    this.checkIns.set(id, {
      ...record,
      status: 'pending',
      failure: null,
      attempt: { ...record.attempt, lastErrorCode: null, nextAttemptAt: null },
    });
  }

  async deleteCheckIn(id: string, owner: OfflineOwnerScope): Promise<void> {
    const record = this.checkIns.get(id);
    if (record && sameOwner(record, owner) && record.status !== 'syncing') this.checkIns.delete(id);
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

  async markMediaUploading(intentId: string, owner: OfflineOwnerScope): Promise<void> {
    this.updateMediaIntent(intentId, owner, (record) => ({
      ...record,
      status: 'uploading',
      failure: null,
    }));
  }

  async markMediaUploaded(id: string, owner: OfflineOwnerScope, mediaId: string): Promise<void> {
    const record = this.mediaDrafts.get(id);
    if (!record || !sameOwner(record, owner)) return;
    this.mediaDrafts.set(id, { ...record, uploadedMediaId: mediaId });
  }

  async markMediaFailed(
    intentId: string,
    owner: OfflineOwnerScope,
    status: 'conflict' | 'business-failed' | 'awaiting-confirmation',
    failure: OfflineFailure,
  ): Promise<void> {
    this.updateMediaIntent(intentId, owner, (record) => ({ ...record, status, failure }));
  }

  async removeMediaDrafts(intentId: string, owner: OfflineOwnerScope): Promise<void> {
    for (const record of this.mediaDrafts.values()) {
      if (record.intentId === intentId && sameOwner(record, owner))
        this.mediaDrafts.delete(record.id);
    }
  }

  private markTerminal(
    id: string,
    leaseOwner: string,
    status: 'conflict' | 'business-failed',
    failure: OfflineFailure,
  ): void {
    const record = this.checkIns.get(id);
    if (!record || !claimedBy(record, leaseOwner)) return;
    this.checkIns.set(id, {
      ...record,
      status,
      failure,
      attempt: {
        ...record.attempt,
        attemptCount: record.attempt.attemptCount + 1,
        lastAttemptAt: new Date().toISOString(),
        lastErrorCode: failure.code,
        nextAttemptAt: null,
      },
      leaseOwner: null,
      leaseUntil: null,
    });
  }

  private updateMediaIntent(
    intentId: string,
    owner: OfflineOwnerScope,
    update: (record: MediaDraftRecord) => MediaDraftRecord,
  ): void {
    for (const record of this.mediaDrafts.values()) {
      if (record.intentId === intentId && sameOwner(record, owner)) {
        this.mediaDrafts.set(record.id, update(record));
      }
    }
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

  async claimNextCheckIn(
    owner: OfflineOwnerScope,
    leaseOwner: string,
    now: Date,
    leaseMilliseconds: number,
  ): Promise<CheckInQueueRecord | null> {
    try {
      const database = await this.database();
      const transaction = database.transaction(
        OFFLINE_CHECK_IN_DB.stores.checkInQueue,
        'readwrite',
      );
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue);
      const records = ((await requestResult(store.getAll())) as CheckInQueueRecord[])
        .filter((record) => sameOwner(record, owner))
        .sort(compareCreatedAt);
      const first = records[0];
      const nowIso = now.toISOString();
      if (
        !first ||
        first.status === 'conflict' ||
        first.status === 'business-failed' ||
        (first.attempt.nextAttemptAt && first.attempt.nextAttemptAt > nowIso) ||
        (first.status === 'syncing' && first.leaseUntil && first.leaseUntil > nowIso)
      ) {
        await transactionComplete(transaction);
        return null;
      }
      const claimed: CheckInQueueRecord = {
        ...first,
        status: 'syncing',
        leaseOwner,
        leaseUntil: new Date(now.getTime() + leaseMilliseconds).toISOString(),
      };
      store.put(claimed);
      await transactionComplete(transaction);
      return claimed;
    } catch (error) {
      throw storageError(error);
    }
  }

  async recordAttempt(
    id: string,
    leaseOwner: string,
    errorCode: string,
    attemptedAt: Date,
    nextAttemptAt?: Date,
  ): Promise<void> {
    await this.updateClaimed(id, leaseOwner, (record) => ({
      ...record,
      status: 'pending',
      attempt: {
        attemptCount: record.attempt.attemptCount + 1,
        lastAttemptAt: attemptedAt.toISOString(),
        lastErrorCode: errorCode,
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
      },
      leaseOwner: null,
      leaseUntil: null,
    }));
  }

  async markConflict(id: string, leaseOwner: string, failure: OfflineFailure): Promise<void> {
    await this.markTerminal(id, leaseOwner, 'conflict', failure);
  }

  async markBusinessFailed(id: string, leaseOwner: string, failure: OfflineFailure): Promise<void> {
    await this.markTerminal(id, leaseOwner, 'business-failed', failure);
  }

  async removeCompleted(id: string, leaseOwner: string): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction(
        OFFLINE_CHECK_IN_DB.stores.checkInQueue,
        'readwrite',
      );
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue);
      const record = (await requestResult(store.get(id))) as CheckInQueueRecord | undefined;
      if (record && claimedBy(record, leaseOwner)) store.delete(id);
      await transactionComplete(transaction);
    } catch (error) {
      throw storageError(error);
    }
  }

  async retryCheckIn(id: string, owner: OfflineOwnerScope): Promise<void> {
    await this.updateOwned(id, owner, (record) =>
      record.status === 'syncing'
        ? record
        : {
            ...record,
            status: 'pending',
            failure: null,
            attempt: { ...record.attempt, lastErrorCode: null, nextAttemptAt: null },
          },
    );
  }

  async deleteCheckIn(id: string, owner: OfflineOwnerScope): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction(
        OFFLINE_CHECK_IN_DB.stores.checkInQueue,
        'readwrite',
      );
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue);
      const record = (await requestResult(store.get(id))) as CheckInQueueRecord | undefined;
      if (record && sameOwner(record, owner) && record.status !== 'syncing') store.delete(id);
      await transactionComplete(transaction);
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

  async markMediaUploading(intentId: string, owner: OfflineOwnerScope): Promise<void> {
    await this.updateMediaIntent(intentId, owner, (record) => ({
      ...record,
      status: 'uploading',
      failure: null,
    }));
  }

  async markMediaUploaded(id: string, owner: OfflineOwnerScope, mediaId: string): Promise<void> {
    await this.updateMediaRecord(id, owner, (record) => ({ ...record, uploadedMediaId: mediaId }));
  }

  async markMediaFailed(
    intentId: string,
    owner: OfflineOwnerScope,
    status: 'conflict' | 'business-failed' | 'awaiting-confirmation',
    failure: OfflineFailure,
  ): Promise<void> {
    await this.updateMediaIntent(intentId, owner, (record) => ({ ...record, status, failure }));
  }

  async removeMediaDrafts(intentId: string, owner: OfflineOwnerScope): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction(OFFLINE_CHECK_IN_DB.stores.mediaDrafts, 'readwrite');
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.mediaDrafts);
      const records = (await requestResult(
        store.index('intentId').getAll(intentId),
      )) as MediaDraftRecord[];
      records
        .filter((record) => sameOwner(record, owner))
        .forEach((record) => store.delete(record.id));
      await transactionComplete(transaction);
    } catch (error) {
      throw storageError(error);
    }
  }

  private async markTerminal(
    id: string,
    leaseOwner: string,
    status: 'conflict' | 'business-failed',
    failure: OfflineFailure,
  ): Promise<void> {
    await this.updateClaimed(id, leaseOwner, (record) => ({
      ...record,
      status,
      failure,
      attempt: {
        ...record.attempt,
        attemptCount: record.attempt.attemptCount + 1,
        lastAttemptAt: new Date().toISOString(),
        lastErrorCode: failure.code,
        nextAttemptAt: null,
      },
      leaseOwner: null,
      leaseUntil: null,
    }));
  }

  private async updateClaimed(
    id: string,
    leaseOwner: string,
    update: (record: CheckInQueueRecord) => CheckInQueueRecord,
  ): Promise<void> {
    await this.updateQueueRecord(id, (record) =>
      claimedBy(record, leaseOwner) ? update(record) : record,
    );
  }

  private async updateOwned(
    id: string,
    owner: OfflineOwnerScope,
    update: (record: CheckInQueueRecord) => CheckInQueueRecord,
  ): Promise<void> {
    await this.updateQueueRecord(id, (record) =>
      sameOwner(record, owner) ? update(record) : record,
    );
  }

  private async updateQueueRecord(
    id: string,
    update: (record: CheckInQueueRecord) => CheckInQueueRecord,
  ): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction(
        OFFLINE_CHECK_IN_DB.stores.checkInQueue,
        'readwrite',
      );
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.checkInQueue);
      const record = (await requestResult(store.get(id))) as CheckInQueueRecord | undefined;
      if (record) store.put(update(record));
      await transactionComplete(transaction);
    } catch (error) {
      throw storageError(error);
    }
  }

  private async updateMediaRecord(
    id: string,
    owner: OfflineOwnerScope,
    update: (record: MediaDraftRecord) => MediaDraftRecord,
  ): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction(OFFLINE_CHECK_IN_DB.stores.mediaDrafts, 'readwrite');
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.mediaDrafts);
      const record = (await requestResult(store.get(id))) as MediaDraftRecord | undefined;
      if (record && sameOwner(record, owner)) store.put(update(record));
      await transactionComplete(transaction);
    } catch (error) {
      throw storageError(error);
    }
  }

  private async updateMediaIntent(
    intentId: string,
    owner: OfflineOwnerScope,
    update: (record: MediaDraftRecord) => MediaDraftRecord,
  ): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction(OFFLINE_CHECK_IN_DB.stores.mediaDrafts, 'readwrite');
      const store = transaction.objectStore(OFFLINE_CHECK_IN_DB.stores.mediaDrafts);
      const records = (await requestResult(
        store.index('intentId').getAll(intentId),
      )) as MediaDraftRecord[];
      records
        .filter((record) => sameOwner(record, owner))
        .forEach((record) => store.put(update(record)));
      await transactionComplete(transaction);
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
