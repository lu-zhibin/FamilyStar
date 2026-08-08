'use client';

import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

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

export async function requestAppInstall(event: BeforeInstallPromptEvent) {
  await event.prompt();
  return event.userChoice;
}

export function InstallAppPrompt({
  installing,
  onDismiss,
  onInstall,
}: {
  installing: boolean;
  onDismiss(): void;
  onInstall(): void;
}) {
  return (
    <aside
      aria-label="安装 FamilyStar"
      className="fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-lg items-center gap-3 rounded-card-lg border border-wood bg-white/95 p-4 shadow-warm-lg backdrop-blur-xl"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-card bg-leaf-light text-leaf-dark">
        <Download aria-hidden="true" size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <strong className="block font-display text-body text-brown">安装 FamilyStar</strong>
        <p className="text-caption font-bold text-brown-light">
          添加到设备，随时打开家庭成长空间。
        </p>
      </div>
      <button className="primary-button shrink-0" disabled={installing} onClick={onInstall}>
        {installing ? '正在打开' : '安装'}
      </button>
      <button
        aria-label="暂不安装"
        className="icon-button shrink-0"
        disabled={installing}
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={20} />
      </button>
    </aside>
  );
}

export function ServiceWorkerRegistration() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

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

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setInstallEvent(null);

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!installEvent) return null;

  const install = async () => {
    setInstalling(true);
    try {
      await requestAppInstall(installEvent);
      setInstallEvent(null);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <InstallAppPrompt
      installing={installing}
      onDismiss={() => setInstallEvent(null)}
      onInstall={() => void install()}
    />
  );
}
