import { useEffect, useState } from 'react';
import { useToast } from './ToastProvider.jsx';

export default function AddToHomeScreen() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [toastId, setToastId] = useState(null);
  const { show, dismiss } = useToast();

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    setIsIos(ios);

    const handler = (e) => {
      try { e.preventDefault(); } catch (_e) {}
      setDeferredPrompt(e);
      // show prompt automatically when available
      if (!localStorage.getItem('a2hs-dismissed')) showA2hsToast(e, ios);
    };

    window.addEventListener('beforeinstallprompt', handler);

    if (ios && !localStorage.getItem('a2hs-dismissed')) {
      // show after short delay for iOS fallback
      const t = setTimeout(() => showA2hsToast(null, ios), 800);
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler); };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showA2hsToast = (promptEvent, ios) => {
    // avoid showing multiple toasts
    if (toastId) return;
    const id = show({
      type: 'info',
      title: '添加到主屏幕',
      message: ios
        ? '点击底部「分享」按钮，然后选择「添加到主屏幕」将 GasMap 添加到主屏幕以便离线使用并快速打开。'
        : '点击右上角蓝色圆点将 GasMap 添加到主屏幕以便离线使用并快速打开。',
      sticky: true,
      // provide actions so toast renders manual buttons
      actions: [
        // Install action (only meaningful on non-iOS where beforeinstallprompt exists)
        ...(ios ? [] : [{
          label: '安装',
          onClick: async (tid) => {
            try {
              if (promptEvent) {
                promptEvent.prompt();
                // await choice if available
                try { await promptEvent.userChoice; } catch (_e) {}
              }
            } catch (err) {
              try { console.error(err); } catch (_) {}
            }
            // mark dismissed and close toast
            try { localStorage.setItem('a2hs-dismissed', '1'); } catch (_e) {}
            try { dismiss(tid); } catch (_e) {}
            setToastId(null);
            setDeferredPrompt(null);
          },
          color: '#3b82f6'
        }]),
        // Close action
        {
          label: '关闭',
          color: '#ef4444',
          onClick: (tid) => {
            try { localStorage.setItem('a2hs-dismissed', '1'); } catch (_e) {}
            try { dismiss(tid); } catch (_e) {}
            setToastId(null);
          }
        }
      ]
    });

    setToastId(id);
  };

  return null;
}
