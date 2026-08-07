'use client';

import { useEffect, useRef, useState } from 'react';

import {
  createOfflineCheckInRunner,
  startOfflineCheckInRecovery,
} from '../lib/offline-check-in-runner';
import {
  getOfflineCheckInRepository,
  type CheckInQueueRecord,
  type MediaDraftRecord,
  type OfflineOwnerScope,
} from '../lib/offline-check-in-repository';

type StatusViewProps = Readonly<{
  queue: readonly CheckInQueueRecord[];
  drafts: readonly MediaDraftRecord[];
  busyIntentId: string | null;
  onRetry: (id: string) => void;
  onDeleteQueue: (id: string) => void;
  onConfirmMedia: (intentId: string) => void;
  onDeleteMedia: (intentId: string) => void;
}>;

function statusLabel(record: CheckInQueueRecord): string {
  if (record.status === 'syncing') return '同步中';
  if (record.status === 'conflict') return '冲突';
  if (record.status === 'business-failed') return '业务失败';
  if (record.attempt.lastErrorCode === 'NETWORK_ERROR') return '网络失败';
  if (['AUTH_REQUIRED', 'IDENTITY_FORBIDDEN'].includes(record.attempt.lastErrorCode ?? '')) {
    return '等待当前身份重新登录';
  }
  return '待同步';
}

export function OfflineCheckInStatusView({
  queue,
  drafts,
  busyIntentId,
  onRetry,
  onDeleteQueue,
  onConfirmMedia,
  onDeleteMedia,
}: StatusViewProps) {
  const draftGroups = drafts.reduce<Map<string, MediaDraftRecord[]>>((groups, draft) => {
    const group = groups.get(draft.intentId) ?? [];
    group.push(draft);
    groups.set(draft.intentId, group);
    return groups;
  }, new Map());
  if (queue.length === 0 && draftGroups.size === 0) return null;

  return (
    <section className="child-card space-y-3" aria-label="离线打卡同步状态">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-subtitle">设备同步队列</h2>
        <span className="tag">
          待同步 {queue.filter(({ status }) => status === 'pending').length}
        </span>
      </div>
      {queue.map((record) => (
        <article className="notice" key={record.id}>
          <div className="flex-1">
            <strong>{statusLabel(record)}</strong>
            <p className="text-label">
              {record.text ?? '勾选打卡'} · {record.createdAt}
            </p>
            {record.failure && <p role="alert">{record.failure.message}</p>}
            {record.failure?.authoritativeState && (
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-label">
                {JSON.stringify(record.failure.authoritativeState, null, 2)}
              </pre>
            )}
          </div>
          {record.status !== 'syncing' && (
            <div className="flex gap-2">
              <button className="text-button" type="button" onClick={() => onRetry(record.id)}>
                重试
              </button>
              <button
                className="text-button text-red"
                type="button"
                onClick={() => onDeleteQueue(record.id)}
              >
                删除
              </button>
            </div>
          )}
        </article>
      ))}
      {[...draftGroups.entries()].map(([intentId, group]) => {
        const first = group[0]!;
        const busy = busyIntentId === intentId || first.status === 'uploading';
        return (
          <article className="notice" key={intentId}>
            <div className="flex-1">
              <strong>{busy ? '媒体上传中' : '待确认媒体'}</strong>
              <p>{group.length} 个本地文件，确认后依次上传。</p>
              {first.failure && <p role="alert">{first.failure.message}</p>}
            </div>
            <div className="flex gap-2">
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => onConfirmMedia(intentId)}
              >
                确认上传
              </button>
              <button
                className="text-button text-red"
                type="button"
                disabled={busy}
                onClick={() => onDeleteMedia(intentId)}
              >
                删除草稿
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function OfflineCheckInStatus({
  owner,
  replayAuthorized,
  visible,
}: Readonly<{
  owner: OfflineOwnerScope | null;
  replayAuthorized: boolean;
  visible: boolean;
}>) {
  const [queue, setQueue] = useState<readonly CheckInQueueRecord[]>([]);
  const [drafts, setDrafts] = useState<readonly MediaDraftRecord[]>([]);
  const [busyIntentId, setBusyIntentId] = useState<string | null>(null);
  const runnerRef = useRef<ReturnType<typeof createOfflineCheckInRunner> | null>(null);
  const repository = getOfflineCheckInRepository();

  useEffect(() => {
    if (!repository || !owner) return;
    let active = true;
    const refresh = () => {
      void Promise.all([repository.listCheckIns(), repository.listMediaDrafts()])
        .then(([allQueue, allDrafts]) => {
          if (!active) return;
          setQueue(
            allQueue.filter(
              (record) =>
                record.owner?.familyId === owner.familyId && record.owner.childId === owner.childId,
            ),
          );
          setDrafts(
            allDrafts.filter(
              (record) =>
                record.owner?.familyId === owner.familyId && record.owner.childId === owner.childId,
            ),
          );
        })
        .catch(() => undefined);
    };
    refresh();
    if (!replayAuthorized) {
      runnerRef.current = null;
      return () => {
        active = false;
      };
    }
    const runner = createOfflineCheckInRunner({ repository, owner, onChange: refresh });
    runnerRef.current = runner;
    const stop = startOfflineCheckInRecovery(runner);
    return () => {
      active = false;
      runnerRef.current = null;
      stop();
    };
  }, [owner, replayAuthorized, repository]);

  if (!visible || !repository || !owner) return null;

  async function retry(id: string) {
    try {
      await repository!.retryCheckIn(id, owner!);
      await runnerRef.current?.run();
    } catch {
      return;
    }
  }

  async function deleteQueue(id: string) {
    if (!window.confirm('仅删除当前设备上的这条离线记录？')) return;
    await repository!.deleteCheckIn(id, owner!);
    setQueue((current) => current.filter((record) => record.id !== id));
  }

  async function confirmMedia(intentId: string) {
    if (!replayAuthorized || !runnerRef.current) return;
    setBusyIntentId(intentId);
    try {
      await runnerRef.current.confirmMediaDrafts(intentId);
    } catch {
      return;
    } finally {
      setBusyIntentId(null);
    }
  }

  async function deleteMedia(intentId: string) {
    if (!window.confirm('仅删除当前设备上的这组媒体草稿？')) return;
    await repository!.removeMediaDrafts(intentId, owner!);
    setDrafts((current) => current.filter((record) => record.intentId !== intentId));
  }

  return (
    <OfflineCheckInStatusView
      queue={queue}
      drafts={drafts}
      busyIntentId={busyIntentId}
      onRetry={(id) => void retry(id)}
      onDeleteQueue={(id) => void deleteQueue(id)}
      onConfirmMedia={(intentId) => void confirmMedia(intentId)}
      onDeleteMedia={(intentId) => void deleteMedia(intentId)}
    />
  );
}
