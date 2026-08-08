import { ChildApiError, childApi } from './child-portal';
import { isNetworkFailure } from './check-in-submission';
import { uploadMediaFile, type UploadApi } from './media-upload';
import type {
  CheckInQueueRecord,
  MediaDraftRecord,
  OfflineCheckInRepository,
  OfflineFailure,
  OfflineOwnerScope,
} from './offline-check-in-repository';

const LEASE_MILLISECONDS = 30_000;
const MAX_BACKOFF_MILLISECONDS = 5 * 60_000;

export type OfflineCheckInRunner = Readonly<{
  run: () => Promise<void>;
  confirmMediaDrafts: (intentId: string) => Promise<void>;
}>;

type RunnerDependencies = Readonly<{
  repository: OfflineCheckInRepository;
  owner: OfflineOwnerScope;
  api?: UploadApi;
  upload?: typeof uploadMediaFile;
  now?: () => Date;
  createRunnerId?: () => string;
  onChange?: () => void;
}>;

function requestBody(record: CheckInQueueRecord): string {
  return JSON.stringify({
    task_assignment_id: record.taskAssignmentId,
    check_date: record.checkDate,
    content: {
      ...(record.text ? { text: record.text } : {}),
      media_ids: [],
    },
  });
}

function failure(error: unknown, fallbackCode: string): OfflineFailure {
  if (error instanceof ChildApiError) {
    return {
      code: error.code ?? fallbackCode,
      message: error.message,
      authoritativeState: error.details ?? null,
    };
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : '同步失败，请稍后重试。',
    authoritativeState: null,
  };
}

function backoffMilliseconds(attemptCount: number): number {
  return Math.min(1_000 * 2 ** Math.min(attemptCount, 8), MAX_BACKOFF_MILLISECONDS);
}

function mediaFile(record: MediaDraftRecord): File {
  return new File([record.blob], record.name, { type: record.mimeType });
}

export function createOfflineCheckInRunner(dependencies: RunnerDependencies): OfflineCheckInRunner {
  const api = dependencies.api ?? childApi;
  const upload = dependencies.upload ?? uploadMediaFile;
  const now = dependencies.now ?? (() => new Date());
  const runnerId =
    dependencies.createRunnerId?.() ??
    `offline-runner-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  let activeRun: Promise<void> | null = null;
  let identityPaused = false;

  async function execute(): Promise<void> {
    if (identityPaused) return;
    let record = await dependencies.repository.claimNextCheckIn(
      dependencies.owner,
      runnerId,
      now(),
      LEASE_MILLISECONDS,
    );
    while (record) {
      dependencies.onChange?.();
      try {
        await api(record.endpoint, {
          method: 'POST',
          headers: { 'Idempotency-Key': record.idempotencyKey },
          body: requestBody(record),
        });
        await dependencies.repository.removeCompleted(record.id, runnerId);
        dependencies.onChange?.();
      } catch (error) {
        const attemptedAt = now();
        if (isNetworkFailure(error)) {
          await dependencies.repository.recordAttempt(
            record.id,
            runnerId,
            'NETWORK_ERROR',
            attemptedAt,
            new Date(attemptedAt.getTime() + backoffMilliseconds(record.attempt.attemptCount)),
          );
        } else if (error instanceof ChildApiError && error.status === 409) {
          await dependencies.repository.markConflict(
            record.id,
            runnerId,
            failure(error, 'CONFLICT'),
          );
        } else if (
          error instanceof ChildApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          identityPaused = true;
          await dependencies.repository.recordAttempt(
            record.id,
            runnerId,
            error.status === 401 ? 'AUTH_REQUIRED' : 'IDENTITY_FORBIDDEN',
            attemptedAt,
          );
        } else if (error instanceof ChildApiError && error.status >= 500) {
          await dependencies.repository.recordAttempt(
            record.id,
            runnerId,
            error.code ?? 'SERVER_ERROR',
            attemptedAt,
            new Date(attemptedAt.getTime() + backoffMilliseconds(record.attempt.attemptCount)),
          );
        } else {
          await dependencies.repository.markBusinessFailed(
            record.id,
            runnerId,
            failure(error, 'BUSINESS_ERROR'),
          );
        }
        dependencies.onChange?.();
        return;
      }
      record = await dependencies.repository.claimNextCheckIn(
        dependencies.owner,
        runnerId,
        now(),
        LEASE_MILLISECONDS,
      );
    }
    dependencies.onChange?.();
  }

  async function run(): Promise<void> {
    if (activeRun) return activeRun;
    activeRun = execute().finally(() => {
      activeRun = null;
    });
    return activeRun;
  }

  async function confirmMediaDrafts(intentId: string): Promise<void> {
    if (identityPaused) throw new ChildApiError('当前身份需要重新验证。', 401, 'UNAUTHORIZED');
    const drafts = (await dependencies.repository.listMediaDrafts())
      .filter(
        (record) =>
          record.intentId === intentId &&
          record.owner?.familyId === dependencies.owner.familyId &&
          record.owner.childId === dependencies.owner.childId,
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
    if (drafts.length === 0) return;
    await dependencies.repository.markMediaUploading(intentId, dependencies.owner);
    dependencies.onChange?.();
    try {
      const mediaIds: string[] = [];
      for (const draft of drafts) {
        const mediaId =
          draft.uploadedMediaId ??
          (await upload(mediaFile(draft), {
            api,
            idempotencyKey: draft.uploadIdempotencyKey,
          }));
        if (!draft.uploadedMediaId) {
          await dependencies.repository.markMediaUploaded(draft.id, dependencies.owner, mediaId);
        }
        mediaIds.push(mediaId);
      }
      const first = drafts[0]!;
      await api('/check-ins', {
        method: 'POST',
        headers: { 'Idempotency-Key': first.checkInIdempotencyKey },
        body: JSON.stringify({
          task_assignment_id: first.taskAssignmentId,
          check_date: first.checkDate,
          content: { ...(first.text ? { text: first.text } : {}), media_ids: mediaIds },
        }),
      });
      await dependencies.repository.removeMediaDrafts(intentId, dependencies.owner);
    } catch (error) {
      if (error instanceof ChildApiError && (error.status === 401 || error.status === 403)) {
        identityPaused = true;
      }
      const status =
        error instanceof ChildApiError && error.status === 409
          ? 'conflict'
          : error instanceof ChildApiError && error.status >= 400 && error.status < 500
            ? 'business-failed'
            : 'awaiting-confirmation';
      await dependencies.repository.markMediaFailed(
        intentId,
        dependencies.owner,
        status,
        failure(error, isNetworkFailure(error) ? 'NETWORK_ERROR' : 'MEDIA_UPLOAD_ERROR'),
      );
      throw error;
    } finally {
      dependencies.onChange?.();
    }
  }

  return { run, confirmMediaDrafts };
}

export function startOfflineCheckInRecovery(
  runner: Pick<OfflineCheckInRunner, 'run'>,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  isOnline: () => boolean = () => navigator.onLine,
): () => void {
  const recover = () => {
    if (isOnline()) void runner.run().catch(() => undefined);
  };
  target.addEventListener('online', recover);
  recover();
  return () => target.removeEventListener('online', recover);
}
