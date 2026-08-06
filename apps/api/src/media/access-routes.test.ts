import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import type { MediaAccessOperations } from './access-types.js';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';

function operations(): MediaAccessOperations {
  return {
    createAccessUrls: vi.fn().mockResolvedValue({
      items: [
        {
          mediaId: first,
          url: 'https://media.test/first',
          expiresAt: new Date('2026-08-05T12:15:00.000Z'),
        },
        {
          mediaId: second,
          url: 'https://media.test/second',
          expiresAt: new Date('2026-08-05T12:15:00.000Z'),
        },
      ],
    }),
  };
}

describe('media access URL routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns ordered snake_case items and renews authenticated cookies', async () => {
    const mediaAccessOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', mediaAccessOperations });
    const response = await app.request('/api/v1/media/access-urls', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=session' },
      body: JSON.stringify({ media_ids: [first, second] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=session');
    expect(mediaAccessOperations.createAccessUrls).toHaveBeenCalledWith({
      sessionToken: 'session',
      mediaIds: [first, second],
    });
    expect(await response.json()).toMatchObject({
      data: {
        items: [
          {
            media_id: first,
            url: 'https://media.test/first',
            expires_at: '2026-08-05T12:15:00.000Z',
          },
          { media_id: second },
        ],
      },
    });
  });

  it.each([
    [{ media_ids: [] }],
    [{ media_ids: [first, first] }],
    [{ media_ids: ['bad-id'] }],
    [{ media_ids: Array.from({ length: 51 }, (_, index) => `${index}`) }],
  ])('rejects invalid batch payloads', async (body) => {
    const mediaAccessOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', mediaAccessOperations });
    const response = await app.request('/api/v1/media/access-urls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(mediaAccessOperations.createAccessUrls).not.toHaveBeenCalled();
  });
});
