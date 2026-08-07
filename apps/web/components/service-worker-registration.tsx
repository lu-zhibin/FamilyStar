'use client';

import { useEffect } from 'react';

export function canRegisterServiceWorker(options: {
  production: boolean;
  secureContext: boolean;
  supported: boolean;
}) {
  return options.production && options.secureContext && options.supported;
}

export async function registerFamilyStarServiceWorker(
  serviceWorker: ServiceWorkerContainer,
  reload: () => void,
) {
  const hadController = Boolean(serviceWorker.controller);
  let reloading = false;

  serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      reload();
    }
  });

  try {
    const registration = await serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'module',
      updateViaCache: 'none',
    });

    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
    void registration.update().catch(() => undefined);
    return registration;
  } catch {
    return null;
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      canRegisterServiceWorker({
        production: process.env.NODE_ENV === 'production',
        secureContext: window.isSecureContext,
        supported: 'serviceWorker' in navigator,
      })
    ) {
      void registerFamilyStarServiceWorker(navigator.serviceWorker, () => window.location.reload());
    }
  }, []);

  return null;
}
