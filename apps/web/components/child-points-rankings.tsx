'use client';

import { Medal, RefreshCw, Star, TrendingUp, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type ApiLoadState } from '../lib/api-resource';
import { childApi } from '../lib/child-portal';
import {
  buildPointsLogsPath,
  buildRankingsPath,
  type ChildPointsLogsResponse,
  type ChildPointsResponse,
  type FamilyRankingsResponse,
  type PointsLog,
  type RankingMetric,
  type RankingPeriod,
} from '../lib/read-models';

function PointsState({ state, onRetry }: Readonly<{ state: ApiLoadState; onRetry: () => void }>) {
  if (state === 'loading') {
    return (
      <div className="empty-state min-h-40" role="status">
        <span className="loading-dot" />
        <strong>正在读取积分明细</strong>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="empty-state min-h-40" role="alert">
        <RefreshCw aria-hidden="true" size={30} />
        <strong>积分明细暂时无法读取</strong>
        <button type="button" className="child-action-button" onClick={onRetry}>
          重新加载
        </button>
      </div>
    );
  }
  return null;
}

function pointsLogLabel(log: PointsLog): string {
  if (log.remark) return log.remark;
  if (log.type === 'EARN') return '完成成长任务';
  if (log.type === 'REDEEM') return '兑换家庭奖励';
  if (log.type === 'REFUND') return '奖励积分退回';
  return log.delta >= 0 ? '家庭手动加分' : '家庭手动调整';
}

export type ChildPointsViewProps = Readonly<{
  points: ChildPointsResponse | null;
  logs: ReadonlyArray<PointsLog>;
  page: ChildPointsLogsResponse['page'];
  state: ApiLoadState;
  loadingMore?: boolean;
  pageError?: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}>;

export function ChildPointsView({
  points,
  logs,
  page,
  state,
  loadingMore = false,
  pageError = false,
  onRetry,
  onLoadMore,
}: ChildPointsViewProps) {
  if (state === 'loading' || state === 'error' || !points) {
    return <PointsState state={state} onRetry={onRetry} />;
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <article className="rounded-card bg-yellow/30 p-4 text-center">
          <span className="text-label font-extrabold text-brown-light">当前余额</span>
          <strong className="mt-1 block font-display text-page text-orange">
            {points.points_balance}
          </strong>
        </article>
        <article className="rounded-card bg-sky/30 p-4 text-center">
          <span className="text-label font-extrabold text-brown-light">累计获得</span>
          <strong className="mt-1 block font-display text-page text-blue">
            {points.points_earned_total}
          </strong>
        </article>
      </div>
      {logs.length === 0 ? (
        <div className="empty-state min-h-40">
          <Star aria-hidden="true" size={32} />
          <strong>还没有积分流水</strong>
          <p>完成任务获得积分后，明细会出现在这里。</p>
        </div>
      ) : (
        <div className="divide-y divide-sand">
          {logs.map((log) => (
            <article key={log.id} className="list-row">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-card ${log.delta >= 0 ? 'bg-leaf/20 text-leaf-dark' : 'bg-pink/30 text-pink-dark'}`}
              >
                <TrendingUp aria-hidden="true" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <strong>{pointsLogLabel(log)}</strong>
                <p className="text-label font-bold text-brown-light">
                  {log.created_at.slice(0, 10)} · 余额 {log.balance_after}
                </p>
              </div>
              <strong className={log.delta >= 0 ? 'text-leaf-dark' : 'text-pink-dark'}>
                {log.delta > 0 ? '+' : ''}
                {log.delta} 星
              </strong>
            </article>
          ))}
        </div>
      )}
      {pageError && (
        <div className="notice mt-3" role="alert">
          <span className="flex-1">后续流水加载失败，现有记录已保留。</span>
          <button type="button" className="font-extrabold text-blue" onClick={onLoadMore}>
            重试加载更多
          </button>
        </div>
      )}
      {page.has_more && page.next_cursor && !pageError && (
        <button
          type="button"
          className="child-dashed-button mt-4"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          <RefreshCw aria-hidden="true" size={18} />
          {loadingMore ? '正在加载' : '加载更多'}
        </button>
      )}
    </>
  );
}

export function ChildPointsPanel() {
  const [points, setPoints] = useState<ChildPointsResponse | null>(null);
  const [logs, setLogs] = useState<ReadonlyArray<PointsLog>>([]);
  const [page, setPage] = useState<ChildPointsLogsResponse['page']>({
    next_cursor: null,
    has_more: false,
  });
  const [state, setState] = useState<ApiLoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);

  async function loadInitial(): Promise<void> {
    setState('loading');
    try {
      const [pointsData, logsData] = await Promise.all([
        childApi<{ points: ChildPointsResponse }>('/points/me'),
        childApi<ChildPointsLogsResponse>(buildPointsLogsPath()),
      ]);
      setPoints(pointsData.points);
      setLogs(logsData.logs);
      setPage(logsData.page);
      setPageError(false);
      setState(logsData.logs.length === 0 ? 'empty' : 'live');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void loadInitial();
  }, []);

  async function loadMore(): Promise<void> {
    if (!page.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setPageError(false);
    try {
      const result = await childApi<ChildPointsLogsResponse>(buildPointsLogsPath(page.next_cursor));
      setLogs((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...result.logs.filter((item) => !ids.has(item.id))];
      });
      setPage(result.page);
    } catch {
      setPageError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="child-card child-animate-in child-delay-3">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-subtitle">积分明细</h2>
        {state === 'live' || state === 'empty' ? (
          <span className="tag bg-leaf/20 text-leaf-dark">实时积分</span>
        ) : null}
      </div>
      <ChildPointsView
        points={points}
        logs={logs}
        page={page}
        state={state}
        loadingMore={loadingMore}
        pageError={pageError}
        onRetry={() => void loadInitial()}
        onLoadMore={() => void loadMore()}
      />
    </section>
  );
}

export function ChildPointsBalance() {
  const [points, setPoints] = useState<ChildPointsResponse | null>(null);
  const [state, setState] = useState<ApiLoadState>('loading');

  useEffect(() => {
    let active = true;
    childApi<{ points: ChildPointsResponse }>('/points/me')
      .then((data) => {
        if (active) {
          setPoints(data.points);
          setState('live');
        }
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') return <strong className="text-subtitle">正在读取余额</strong>;
  if (state === 'error' || !points)
    return <strong className="text-subtitle">余额暂时不可用</strong>;
  return (
    <>
      <strong className="font-display text-page">{points.points_balance} 星</strong>
      <p className="text-label font-bold">累计星星 {points.points_earned_total}</p>
    </>
  );
}

const metricLabels: Readonly<Record<RankingMetric, string>> = {
  balance: '当前余额',
  earned: '累计获得',
  level: '当前等级',
};
const periodLabels: Readonly<Record<RankingPeriod, string>> = {
  week: '本周',
  month: '本月',
  all: '总榜',
};

export type ChildRankingsViewProps = Readonly<{
  rankings: FamilyRankingsResponse | null;
  state: ApiLoadState;
  onRetry: () => void;
}>;

export function ChildRankingsView({ rankings, state, onRetry }: ChildRankingsViewProps) {
  if (state === 'loading') {
    return (
      <div className="empty-state min-h-40" role="status">
        <span className="loading-dot" />
        <strong>正在读取家庭排行</strong>
      </div>
    );
  }
  if (state === 'error' || !rankings) {
    return (
      <div className="empty-state min-h-40" role="alert">
        <RefreshCw aria-hidden="true" size={30} />
        <strong>家庭排行暂时无法读取</strong>
        <button type="button" className="child-action-button" onClick={onRetry}>
          重新加载
        </button>
      </div>
    );
  }
  if (rankings.items.length === 0) {
    return (
      <div className="empty-state min-h-40">
        <Trophy aria-hidden="true" size={32} />
        <strong>家庭排行还是空的</strong>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rankings.items.map((item) => (
        <article
          key={item.child_id}
          className={`list-row rounded-card ${item.is_current_user ? 'bg-yellow/25 ring-2 ring-orange/40' : 'bg-sand/50'}`}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white font-display text-subtitle text-orange">
            {item.rank}
          </span>
          <div className="min-w-0 flex-1">
            <strong>
              {item.nickname}
              {item.is_current_user ? '（我）' : ''}
            </strong>
            {item.period_earned !== undefined && (
              <p className="text-label font-bold text-brown-light">
                本周期新增 {item.period_earned} 星
              </p>
            )}
          </div>
          <strong className="text-orange">
            {rankings.metric === 'level' ? `Lv.${item.value}` : `${item.value} 星`}
          </strong>
        </article>
      ))}
    </div>
  );
}

export function ChildRankingsPanel() {
  const [metric, setMetric] = useState<RankingMetric>('balance');
  const [period, setPeriod] = useState<RankingPeriod>('week');
  const [rankings, setRankings] = useState<FamilyRankingsResponse | null>(null);
  const [state, setState] = useState<ApiLoadState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    childApi<FamilyRankingsResponse>(buildRankingsPath(metric, period))
      .then((data) => {
        if (active) {
          setRankings(data);
          setState(data.items.length === 0 ? 'empty' : 'live');
        }
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [metric, period]);

  function retry(): void {
    setState('loading');
    childApi<FamilyRankingsResponse>(buildRankingsPath(metric, period))
      .then((data) => {
        setRankings(data);
        setState(data.items.length === 0 ? 'empty' : 'live');
      })
      .catch(() => setState('error'));
  }

  return (
    <section className="child-card child-animate-in child-delay-1">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-subtitle">家庭排行</h2>
        <Medal aria-hidden="true" className="text-orange" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="排行指标">
        {(Object.keys(metricLabels) as RankingMetric[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`tag ${metric === value ? 'bg-orange text-white' : 'bg-sand text-brown'}`}
            aria-pressed={metric === value}
            onClick={() => setMetric(value)}
          >
            {metricLabels[value]}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="排行周期">
        {(Object.keys(periodLabels) as RankingPeriod[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`tag ${period === value ? 'bg-blue text-white' : 'bg-sky/30 text-blue'}`}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {periodLabels[value]}
          </button>
        ))}
      </div>
      <ChildRankingsView rankings={rankings} state={state} onRetry={retry} />
    </section>
  );
}
