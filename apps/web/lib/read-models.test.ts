import { describe, expect, it } from 'vitest';

import {
  buildFamilyAnalyticsPath,
  buildFamilyDashboardPath,
  buildPointsLogsPath,
  buildRankingsPath,
} from './read-models';

describe('read model paths', () => {
  it('builds a dashboard path for the selected natural date', () => {
    expect(buildFamilyDashboardPath('2026-08-06')).toBe('/family/dashboard?date=2026-08-06');
  });

  it('builds analytics filters in a stable order and omits empty filters', () => {
    expect(buildFamilyAnalyticsPath({ startDate: '2026-08-01', endDate: '2026-08-06' })).toBe(
      '/family/analytics?start_date=2026-08-01&end_date=2026-08-06',
    );
    expect(
      buildFamilyAnalyticsPath({
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        childId: 'child/id',
        taskId: 'task id',
      }),
    ).toBe(
      '/family/analytics?start_date=2026-08-01&end_date=2026-08-06&child_id=child%2Fid&task_id=task+id',
    );
  });

  it('preserves an opaque points cursor and page limit', () => {
    expect(buildPointsLogsPath()).toBe('/points/me/logs?limit=20');
    expect(buildPointsLogsPath('created/id+token', 50)).toBe(
      '/points/me/logs?limit=50&cursor=created%2Fid%2Btoken',
    );
  });

  it('builds an explicit family ranking scope', () => {
    expect(buildRankingsPath('level', 'week')).toBe(
      '/rankings?metric=level&period=week&family_scope=family',
    );
  });
});
