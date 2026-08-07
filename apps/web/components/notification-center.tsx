'use client';

import { Bell, CheckCheck, ChevronRight, CloudOff, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { childApi } from '../lib/child-portal';
import {
  appendNotificationPage,
  formatNotificationTime,
  isSafeNotificationTarget,
  notificationListPath,
  notificationTypeLabels,
  notificationTypes,
  notificationUnreadChangedEvent,
  replaceNotification,
  type NotificationItem,
  type NotificationPage,
  type NotificationPreference,
} from '../lib/notifications';
import { parentApi } from '../lib/parent-portal';
import { ChildShell } from './child-shell';
import { ParentShell } from './parent-shell';

type NotificationApi = <T>(path: string, init?: RequestInit) => Promise<T>;
type LoadState = 'loading' | 'live' | 'empty' | 'error';

const emptyPage: NotificationPage = { has_more: false, next_cursor: null };

export function NotificationCenter({
  api,
  canEditPreferences,
}: Readonly<{ api: NotificationApi; canEditPreferences: boolean }>) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState<NotificationPage>(emptyPage);
  const [state, setState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [preference, setPreference] = useState<NotificationPreference | null>(null);
  const [preferenceState, setPreferenceState] = useState<LoadState>(
    canEditPreferences ? 'loading' : 'empty',
  );

  async function loadNotifications(cursor: string | null = null) {
    if (!cursor) setState('loading');
    if (cursor) setLoadingMore(true);
    setFeedback('');
    try {
      const result = await api<{ notifications: NotificationItem[]; page: NotificationPage }>(
        notificationListPath(cursor),
      );
      setNotifications((current) =>
        cursor ? appendNotificationPage(current, result.notifications) : result.notifications,
      );
      setPage(result.page);
      setState(result.notifications.length === 0 && !cursor ? 'empty' : 'live');
    } catch {
      if (cursor) setFeedback('加载更多失败，请重试。');
      else setState('error');
    } finally {
      if (cursor) setLoadingMore(false);
    }
  }

  async function loadPreference() {
    if (!canEditPreferences) return;
    setPreferenceState('loading');
    try {
      const result = await api<{ preference: NotificationPreference }>('/notification-preferences');
      setPreference(result.preference);
      setPreferenceState('live');
    } catch {
      setPreferenceState('error');
    }
  }

  useEffect(() => {
    void loadNotifications();
    void loadPreference();
    // Both portals pass stable module-level API functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, canEditPreferences]);

  function publishUnreadChange() {
    window.dispatchEvent(new Event(notificationUnreadChangedEvent));
  }

  async function markRead(notification: NotificationItem, navigate: boolean) {
    if (busy) return;
    if (notification.read_at) {
      if (navigate && isSafeNotificationTarget(notification.target_url))
        window.location.assign(notification.target_url);
      return;
    }
    setBusy(notification.id);
    setFeedback('');
    try {
      const result = await api<{ notification: NotificationItem }>(
        `/notifications/${notification.id}/read`,
        { method: 'PATCH' },
      );
      setNotifications((current) => replaceNotification(current, result.notification));
      publishUnreadChange();
      if (navigate && isSafeNotificationTarget(result.notification.target_url))
        window.location.assign(result.notification.target_url);
    } catch {
      setFeedback('标记已读失败，请重试。');
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead() {
    if (busy) return;
    setBusy('all');
    setFeedback('');
    try {
      await api<{ updated_count: number }>('/notifications/read-all', { method: 'PATCH' });
      await loadNotifications();
      publishUnreadChange();
    } catch {
      setFeedback('全部已读失败，请重试。');
    } finally {
      setBusy(null);
    }
  }

  async function savePreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preference || busy) return;
    setBusy('preferences');
    setFeedback('');
    try {
      const result = await api<{ preference: NotificationPreference }>(
        '/notification-preferences',
        {
          method: 'PATCH',
          body: JSON.stringify(preference),
        },
      );
      setPreference(result.preference);
      setPreferenceState('live');
      setFeedback('通知偏好已保存并刷新。');
    } catch {
      setFeedback('通知偏好保存失败，请重试。');
    } finally {
      setBusy(null);
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  return (
    <div className="space-y-5" aria-busy={busy ? 'true' : undefined}>
      <header className="flex items-end justify-between gap-4 mobile:items-start mobile:flex-col">
        <div>
          <p className="eyebrow">消息中心</p>
          <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] text-brown">通知</h1>
          <p className="mt-1 font-semibold text-brown-light">
            及时查看家庭里的新进展和待处理事项。
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={Boolean(busy) || unreadCount === 0}
          onClick={markAllRead}
        >
          <CheckCheck aria-hidden="true" size={17} />
          {busy === 'all' ? '正在更新...' : '全部已读'}
        </button>
      </header>

      {feedback && (
        <p
          className={`notice ${feedback.includes('失败') ? 'border-red text-red' : 'border-leaf text-leaf-dark'}`}
          role={feedback.includes('失败') ? 'alert' : 'status'}
        >
          {feedback}
        </p>
      )}

      <section
        className={
          canEditPreferences
            ? 'grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]'
            : ''
        }
      >
        <div className="panel min-w-0">
          {state === 'loading' && (
            <NotificationBoundary title="正在读取通知" detail="消息同步完成后会显示在这里。" />
          )}
          {state === 'error' && (
            <NotificationBoundary
              title="通知读取失败"
              detail="网络恢复后可以重新加载。"
              error
              onRetry={() => loadNotifications()}
            />
          )}
          {state === 'empty' && (
            <NotificationBoundary title="暂无通知" detail="新的家庭动态会出现在这里。" />
          )}
          {state === 'live' && (
            <div className="divide-y divide-wood">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`flex min-w-0 items-start gap-3 py-4 first:pt-0 last:pb-0 ${notification.read_at ? 'opacity-70' : ''}`}
                >
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${notification.read_at ? 'bg-wood' : 'bg-coral'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="w-full min-w-0 text-left"
                      disabled={Boolean(busy)}
                      onClick={() => markRead(notification, true)}
                      aria-label={`打开通知：${notification.title}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <strong className="break-words text-brown">{notification.title}</strong>
                        <ChevronRight
                          className="shrink-0 text-brown-light"
                          aria-hidden="true"
                          size={18}
                        />
                      </span>
                      <span className="mt-1 block break-words text-caption font-semibold text-brown-light">
                        {notification.content}
                      </span>
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-label font-bold text-brown-light">
                      <span className="tag">{notificationTypeLabels[notification.type]}</span>
                      <time dateTime={notification.created_at}>
                        {formatNotificationTime(notification.created_at)}
                      </time>
                      {!notification.read_at && (
                        <button
                          className="text-button"
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => markRead(notification, false)}
                        >
                          {busy === notification.id ? '正在更新...' : '标为已读'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {state === 'live' && page.has_more && (
            <button
              className="secondary-button mt-5 w-full"
              type="button"
              disabled={Boolean(busy) || loadingMore}
              onClick={() => loadNotifications(page.next_cursor)}
            >
              {loadingMore ? '正在加载...' : '加载更多'}
            </button>
          )}
        </div>

        {canEditPreferences && (
          <NotificationPreferencePanel
            preference={preference}
            state={preferenceState}
            busy={Boolean(busy)}
            onChange={setPreference}
            onRetry={loadPreference}
            onSubmit={savePreference}
          />
        )}
      </section>
    </div>
  );
}

export function NotificationBoundary({
  title,
  detail,
  error = false,
  onRetry,
}: Readonly<{ title: string; detail: string; error?: boolean; onRetry?: () => void }>) {
  return (
    <div className="empty-state" role={error ? 'alert' : 'status'}>
      {error ? <CloudOff aria-hidden="true" size={30} /> : <Bell aria-hidden="true" size={30} />}
      <strong>{title}</strong>
      <p>{detail}</p>
      {onRetry && (
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" size={16} /> 重新加载
        </button>
      )}
    </div>
  );
}

export function NotificationPreferencePanel({
  preference,
  state,
  busy,
  onChange,
  onRetry,
  onSubmit,
}: Readonly<{
  preference: NotificationPreference | null;
  state: LoadState;
  busy: boolean;
  onChange: (value: NotificationPreference) => void;
  onRetry: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  if (state === 'error')
    return (
      <div className="panel">
        <NotificationBoundary
          title="偏好读取失败"
          detail="重新加载后再调整通知设置。"
          error
          onRetry={onRetry}
        />
      </div>
    );
  if (!preference)
    return (
      <div className="panel">
        <NotificationBoundary title="正在读取偏好" detail="设置同步完成后即可编辑。" />
      </div>
    );

  return (
    <form className="panel space-y-5" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">家长偏好</p>
        <h2 className="font-display text-title text-brown">接收设置</h2>
      </div>
      <SwitchRow
        label="站内通知总开关"
        checked={preference.in_app_enabled}
        disabled={busy}
        onChange={(checked) => onChange({ ...preference, in_app_enabled: checked })}
      />
      <SwitchRow
        label="浏览器通知总开关"
        checked={preference.browser_enabled}
        disabled={busy}
        onChange={(checked) => onChange({ ...preference, browser_enabled: checked })}
      />
      <fieldset className="space-y-3 border-t border-wood pt-4">
        <legend className="font-display text-body text-brown">通知类型</legend>
        {notificationTypes.map((type) => (
          <SwitchRow
            key={type}
            label={notificationTypeLabels[type]}
            checked={preference.type_settings[type]}
            disabled={busy}
            onChange={(checked) =>
              onChange({
                ...preference,
                type_settings: { ...preference.type_settings, [type]: checked },
              })
            }
          />
        ))}
      </fieldset>
      <fieldset className="space-y-3 border-t border-wood pt-4">
        <legend className="font-display text-body text-brown">免打扰</legend>
        <SwitchRow
          label="启用免打扰时段"
          checked={preference.quiet_hours_enabled}
          disabled={busy}
          onChange={(checked) => onChange({ ...preference, quiet_hours_enabled: checked })}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">
            开始时间
            <input
              className="field"
              type="time"
              required={preference.quiet_hours_enabled}
              disabled={busy || !preference.quiet_hours_enabled}
              value={preference.quiet_hours_start ?? '22:00'}
              onChange={(event) =>
                onChange({ ...preference, quiet_hours_start: event.target.value })
              }
            />
          </label>
          <label className="field-label">
            结束时间
            <input
              className="field"
              type="time"
              required={preference.quiet_hours_enabled}
              disabled={busy || !preference.quiet_hours_enabled}
              value={preference.quiet_hours_end ?? '07:00'}
              onChange={(event) => onChange({ ...preference, quiet_hours_end: event.target.value })}
            />
          </label>
        </div>
      </fieldset>
      <button className="primary-button w-full" type="submit" disabled={busy}>
        <Save aria-hidden="true" size={17} /> {busy ? '正在保存...' : '保存通知偏好'}
      </button>
    </form>
  );
}

function SwitchRow({
  label,
  checked,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 font-bold text-brown">
      <span>{label}</span>
      <input
        className="size-5 accent-leaf"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function ParentNotificationsPortal() {
  return (
    <ParentShell section="notifications">
      <NotificationCenter api={parentApi} canEditPreferences />
    </ParentShell>
  );
}

export function ChildNotificationsPortal() {
  return (
    <ChildShell
      section="notifications"
      child={undefined}
      onSwitch={() => window.location.assign('/child')}
    >
      <NotificationCenter api={childApi} canEditPreferences={false} />
    </ChildShell>
  );
}
