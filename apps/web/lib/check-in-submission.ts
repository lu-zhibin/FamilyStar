import {
  childApi,
  createIdempotencyKey,
  currentCalendarDate,
  normalizedMediaMimeType,
} from './child-portal';
import { uploadMediaFile, type UploadApi } from './media-upload';
import {
  OfflineStorageError,
  type NewCheckInQueueRecord,
  type NewMediaDraftRecord,
  type OfflineCheckInRepository,
  type OfflineOwnerScope,
  type QueuedSubmissionType,
} from './offline-check-in-repository';

export type CheckInSubmissionType = QueuedSubmissionType | 'PHOTO' | 'VIDEO' | 'MIXED';

export type CheckInIntent = Readonly<{
  id: string;
  idempotencyKey: string;
  createdAt: string;
  uploadIdempotencyKeys: readonly string[];
}>;

export type SubmitCheckInInput = Readonly<{
  intent: CheckInIntent;
  taskId: string;
  taskAssignmentId: string;
  submissionType: CheckInSubmissionType;
  text?: string;
  files?: readonly File[];
  checkDate?: string;
}>;

export type SubmitCheckInResult =
  | Readonly<{ status: 'submitted' }>
  | Readonly<{ status: 'queued'; queueId: string }>
  | Readonly<{ status: 'media-drafted'; draftIds: readonly string[] }>;

type SubmissionDependencies = Readonly<{
  repository: OfflineCheckInRepository | null;
  api?: UploadApi;
  upload?: typeof uploadMediaFile;
  online?: boolean;
  createId?: () => string;
  owner?: OfflineOwnerScope;
}>;

export function createCheckInIntent(
  fileCount: number,
  createId: () => string = () => crypto.randomUUID(),
  now: () => Date = () => new Date(),
): CheckInIntent {
  return {
    id: createId(),
    idempotencyKey: createIdempotencyKey('check-in', createId),
    createdAt: now().toISOString(),
    uploadIdempotencyKeys: Array.from({ length: fileCount }, () =>
      createIdempotencyKey('check-in-media', createId),
    ),
  };
}

export function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.message.startsWith('无法连接对象存储'))
  );
}

function requireRepository(repository: OfflineCheckInRepository | null): OfflineCheckInRepository {
  if (!repository) throw new OfflineStorageError('UNSUPPORTED');
  return repository;
}

async function queueCheckIn(
  input: SubmitCheckInInput,
  repository: OfflineCheckInRepository | null,
  createId: () => string,
  owner: OfflineOwnerScope | undefined,
): Promise<SubmitCheckInResult> {
  if (input.submissionType !== 'TICK' && input.submissionType !== 'TEXT') {
    throw new Error('媒体打卡无法进入请求重放队列。');
  }
  const normalizedText = input.text?.trim();
  if (input.submissionType === 'TEXT' && !normalizedText) throw new Error('请填写打卡文字。');
  if (!owner) throw new Error('无法确认当前孩子身份，请联网登录后再保存离线打卡。');
  const record: NewCheckInQueueRecord = {
    id: createId(),
    intentId: input.intent.id,
    createdAt: input.intent.createdAt,
    endpoint: '/check-ins',
    taskId: input.taskId,
    taskAssignmentId: input.taskAssignmentId,
    checkDate: input.checkDate ?? currentCalendarDate(),
    submissionType: input.submissionType,
    ...(normalizedText ? { text: normalizedText } : {}),
    idempotencyKey: input.intent.idempotencyKey,
    owner,
  };
  const queued = await requireRepository(repository).enqueueCheckIn(record);
  return { status: 'queued', queueId: queued.id };
}

async function saveMediaDraft(
  input: SubmitCheckInInput,
  repository: OfflineCheckInRepository | null,
  createId: () => string,
  owner: OfflineOwnerScope | undefined,
): Promise<SubmitCheckInResult> {
  if (
    input.submissionType !== 'PHOTO' &&
    input.submissionType !== 'VIDEO' &&
    input.submissionType !== 'MIXED'
  ) {
    throw new Error('该打卡类型无法保存媒体草稿。');
  }
  const files = input.files ?? [];
  if (files.length === 0) throw new Error('请选择要保存的图片或视频。');
  if (!owner) throw new Error('无法确认当前孩子身份，请联网登录后再保存媒体草稿。');
  const normalizedText = input.text?.trim();
  const records: NewMediaDraftRecord[] = files.map((file, index) => ({
    id: createId(),
    intentId: input.intent.id,
    createdAt: input.intent.createdAt,
    taskId: input.taskId,
    taskAssignmentId: input.taskAssignmentId,
    checkDate: input.checkDate ?? currentCalendarDate(),
    queueId: null,
    submissionType: input.submissionType as 'PHOTO' | 'VIDEO' | 'MIXED',
    ...(normalizedText ? { text: normalizedText } : {}),
    checkInIdempotencyKey: input.intent.idempotencyKey,
    uploadIdempotencyKey:
      input.intent.uploadIdempotencyKeys[index] ?? createIdempotencyKey('check-in-media', createId),
    owner,
    name: file.name,
    mimeType: normalizedMediaMimeType(file),
    size: file.size,
    blob: file,
  }));
  const drafts = await requireRepository(repository).saveMediaDrafts(records);
  return { status: 'media-drafted', draftIds: drafts.map(({ id }) => id) };
}

function requestBody(input: SubmitCheckInInput, mediaIds: readonly string[] = []): string {
  const normalizedText = input.text?.trim();
  return JSON.stringify({
    task_assignment_id: input.taskAssignmentId,
    check_date: input.checkDate ?? currentCalendarDate(),
    content: {
      ...(normalizedText ? { text: normalizedText } : {}),
      media_ids: mediaIds,
    },
  });
}

function validateMediaSelection(input: SubmitCheckInInput): void {
  const files = input.files ?? [];
  const mimeTypes = files.map(normalizedMediaMimeType);
  const images = mimeTypes.filter((mimeType) => mimeType.startsWith('image/')).length;
  const videos = mimeTypes.length - images;
  const valid =
    (input.submissionType === 'PHOTO' && images >= 1 && images <= 9 && videos === 0) ||
    (input.submissionType === 'VIDEO' && videos === 1 && images === 0) ||
    (input.submissionType === 'MIXED' && images <= 9 && videos <= 1 && files.length <= 10);
  if (!valid) throw new Error('媒体选择与任务要求不符：最多 9 张图片和 1 个视频。');
}

export async function submitChildCheckIn(
  input: SubmitCheckInInput,
  dependencies: SubmissionDependencies,
): Promise<SubmitCheckInResult> {
  const api = dependencies.api ?? childApi;
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const online = dependencies.online ?? (typeof navigator === 'undefined' || navigator.onLine);
  const files = input.files ?? [];
  const mediaSubmission = !['TICK', 'TEXT'].includes(input.submissionType);

  if (input.submissionType === 'TEXT' && !input.text?.trim()) {
    throw new Error('请填写打卡文字。');
  }
  if (mediaSubmission && files.length === 0) throw new Error('请选择打卡图片或视频。');
  if (mediaSubmission) validateMediaSelection(input);
  if (!online) {
    return mediaSubmission
      ? saveMediaDraft(input, dependencies.repository, createId, dependencies.owner)
      : queueCheckIn(input, dependencies.repository, createId, dependencies.owner);
  }

  try {
    const mediaIds: string[] = [];
    for (const [index, file] of files.entries()) {
      const uploadIdempotencyKey =
        input.intent.uploadIdempotencyKeys[index] ??
        createIdempotencyKey('check-in-media', createId);
      mediaIds.push(
        await (dependencies.upload ?? uploadMediaFile)(file, {
          api,
          idempotencyKey: uploadIdempotencyKey,
        }),
      );
    }
    await api('/check-ins', {
      method: 'POST',
      headers: { 'Idempotency-Key': input.intent.idempotencyKey },
      body: requestBody(input, mediaIds),
    });
    return { status: 'submitted' };
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    return mediaSubmission
      ? saveMediaDraft(input, dependencies.repository, createId, dependencies.owner)
      : queueCheckIn(input, dependencies.repository, createId, dependencies.owner);
  }
}
