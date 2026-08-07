import { describe, expect, it, vi } from 'vitest';

import {
  canRegisterServiceWorker,
  registerFamilyStarServiceWorker,
} from './service-worker-registration';

describe('service worker registration', () => {
  it('requires production, a secure context, and browser support', () => {
    expect(
      canRegisterServiceWorker({ production: true, secureContext: true, supported: true }),
    ).toBe(true);
    expect(
      canRegisterServiceWorker({ production: false, secureContext: true, supported: true }),
    ).toBe(false);
    expect(
      canRegisterServiceWorker({ production: true, secureContext: false, supported: true }),
    ).toBe(false);
    expect(
      canRegisterServiceWorker({ production: true, secureContext: true, supported: false }),
    ).toBe(false);
  });

  it('registers a same-origin module worker and checks for updates quietly', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const registration = {
      waiting: { postMessage },
      installing: null,
      addEventListener: vi.fn(),
      update,
    };
    const register = vi.fn().mockResolvedValue(registration);
    const serviceWorker = {
      controller: null,
      addEventListener: vi.fn(),
      register,
    } as unknown as ServiceWorkerContainer;

    await expect(registerFamilyStarServiceWorker(serviceWorker, vi.fn())).resolves.toBe(
      registration,
    );
    expect(register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      type: 'module',
      updateViaCache: 'none',
    });
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(update).toHaveBeenCalledOnce();
  });

  it('contains registration failures without console output or rejection', async () => {
    const serviceWorker = {
      controller: null,
      addEventListener: vi.fn(),
      register: vi.fn().mockRejectedValue(new Error('registration failed')),
    } as unknown as ServiceWorkerContainer;

    await expect(registerFamilyStarServiceWorker(serviceWorker, vi.fn())).resolves.toBeNull();
  });
});
