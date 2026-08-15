import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  canRegisterServiceWorker,
  InstallAppPrompt,
  registerFamilyStarServiceWorker,
  requestAppInstall,
  type BeforeInstallPromptEvent,
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

  it('renders an accessible install entry with busy and dismiss states', () => {
    const available = renderToStaticMarkup(
      <InstallAppPrompt installing={false} onDismiss={vi.fn()} onInstall={vi.fn()} />,
    );
    const installing = renderToStaticMarkup(
      <InstallAppPrompt installing onDismiss={vi.fn()} onInstall={vi.fn()} />,
    );

    expect(available).toContain('aria-label="安装 FamilyStar"');
    expect(available).toContain('>安装</button>');
    expect(available).toContain('aria-label="暂不安装"');
    expect(installing).toContain('>正在打开</button>');
    expect(installing.match(/disabled=""/g)).toHaveLength(2);
  });

  it('opens the browser install prompt and returns the user choice', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    await expect(requestAppInstall(event)).resolves.toEqual({
      outcome: 'accepted',
      platform: 'web',
    });
    expect(prompt).toHaveBeenCalledOnce();
  });
});
