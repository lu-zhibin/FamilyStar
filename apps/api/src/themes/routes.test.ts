import { ERROR_CODES, findTheme } from '@familystar/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { ThemeAccessError, ThemeLockedError } from './service.js';
import type { ThemeOperations, ThemeView } from './types.js';

const theme: ThemeView = {
  ...findTheme('ocean')!,
  unlocked: true,
  selected: true,
};

function operations(): ThemeOperations {
  return {
    getCatalog: vi.fn().mockResolvedValue({
      currentLevel: 3,
      selectedTheme: 'ocean',
      themes: [theme],
    }),
    select: vi.fn().mockResolvedValue({ selectedTheme: 'ocean', theme }),
  };
}

describe('theme HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns the catalog flags and controlled tokens in snake_case', async () => {
    const themeOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', themeOperations });
    const response = await app.request('/api/v1/themes', {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=child-session');
    expect(themeOperations.getCatalog).toHaveBeenCalledWith({ sessionToken: 'child-session' });
    expect(await response.json()).toMatchObject({
      data: {
        current_level: 3,
        selected_theme: 'ocean',
        themes: [
          {
            key: 'ocean',
            minimum_level: 3,
            unlocked: true,
            selected: true,
            tokens: { '--color-primary': '#0891b2' },
          },
        ],
      },
    });
  });

  it('validates and maps the selection payload', async () => {
    const themeOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', themeOperations });
    const response = await app.request('/api/v1/themes/selection', {
      method: 'PATCH',
      headers: {
        cookie: 'familystar_session=child-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ theme_key: 'ocean' }),
    });

    expect(response.status).toBe(200);
    expect(themeOperations.select).toHaveBeenCalledWith({
      sessionToken: 'child-session',
      themeKey: 'ocean',
    });
    expect(await response.json()).toMatchObject({
      data: { selected_theme: 'ocean', theme: { minimum_level: 3 } },
    });
  });

  it('rejects malformed and extra selection fields', async () => {
    const themeOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', themeOperations });
    const response = await app.request('/api/v1/themes/selection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_key: 'Ocean Theme', family_id: 'family-2' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: ERROR_CODES.INVALID_REQUEST },
    });
    expect(themeOperations.select).not.toHaveBeenCalled();
  });

  it('maps locked selections to stable conflict details', async () => {
    const themeOperations = operations();
    vi.mocked(themeOperations.select).mockRejectedValue(new ThemeLockedError('forest', 5, 3));
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', themeOperations });
    const response = await app.request('/api/v1/themes/selection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_key: 'forest' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: ERROR_CODES.CONFLICT,
        details: { theme_key: 'forest', required_level: 5, current_level: 3 },
      },
    });
  });

  it.each([
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
  ] as const)('maps %s to an exact HTTP error', async (code, status) => {
    const themeOperations = operations();
    vi.mocked(themeOperations.getCatalog).mockRejectedValue(new ThemeAccessError(code, 'Denied.'));
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', themeOperations });

    const response = await app.request('/api/v1/themes');
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
