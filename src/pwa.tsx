import { useEffect, useState } from 'react';
import { useI18n, type Locale } from './i18n';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const pwaMessages: Record<Locale, { offline: string; installNotice: string; install: string; updateNotice: string; update: string }> = {
  'zh-CN': { offline: '当前处于离线状态；已打开的内容仍可继续浏览。', installNotice: '将 Git MD Viewer 安装到此设备。', install: '安装应用', updateNotice: '已有新版本可用。', update: '立即更新' },
  'ja-JP': { offline: '現在オフラインです。すでに開いた内容は引き続き閲覧できます。', installNotice: 'Git MD Viewer をこのデバイスにインストールします。', install: 'アプリをインストール', updateNotice: '新しいバージョンを利用できます。', update: '今すぐ更新' },
  'en-US': { offline: 'You are offline. Previously opened content remains available.', installNotice: 'Install Git MD Viewer on this device.', install: 'Install app', updateNotice: 'A new version is available.', update: 'Update now' },
};

function canUseServiceWorker(): boolean {
  return 'serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost');
}

function cacheCurrentAppResources(registration: ServiceWorkerRegistration): void {
  const urls = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((element) => urls.add(element.src));
  document.querySelectorAll<HTMLLinkElement>('link[href]').forEach((element) => urls.add(element.href));
  performance.getEntriesByType('resource').forEach((entry) => urls.add(entry.name));
  const sameOriginUrls = [...urls].filter((url) => {
    try { return new URL(url).origin === location.origin; } catch { return false; }
  });
  registration.active?.postMessage({ type: 'CACHE_URLS', urls: sameOriginUrls });
}

export function PwaControls() {
  const { locale } = useI18n();
  const copy = pwaMessages[locale];
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!canUseServiceWorker()) return;
    let reloading = false;
    const onControllerChange = () => { if (!reloading) { reloading = true; window.location.reload(); } };
    const onBeforeInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    const onAppInstalled = () => setInstallPrompt(null);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?version=${__PWA_BUILD_ID__}`, { updateViaCache: 'none' }).then((registration) => {
      if (registration.waiting) setUpdateWorker(registration.waiting);
      navigator.serviceWorker.ready.then(cacheCurrentAppResources);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateWorker(worker);
        });
      });
    }).catch(() => { /* The page remains usable when service workers are unavailable. */ });

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return <aside className="pwa-controls" aria-live="polite">
    {!online && <div className="pwa-notice pwa-offline">{copy.offline}</div>}
    {installPrompt && <div className="pwa-notice"><span>{copy.installNotice}</span><button type="button" onClick={install}>{copy.install}</button></div>}
    {updateWorker && <div className="pwa-notice"><span>{copy.updateNotice}</span><button type="button" onClick={() => updateWorker.postMessage({ type: 'SKIP_WAITING' })}>{copy.update}</button></div>}
  </aside>;
}
