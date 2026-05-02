// Service Worker registration for NYG Time Tracker
// Drop this file into src/ and call registerSW() from main.jsx

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[SW] Registered, scope:', registration.scope);

      // ── Update detection ──────────────────────────────────────────────────
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // A new version is ready. You can show a toast here.
            console.log('[SW] New version available. Reload to update.');
            dispatchUpdateEvent(newWorker);
          }
        });
      });

      // ── Periodic update check (every 60 minutes while app is open) ────────
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });

  // Reload the page when the new SW takes control so users get the fresh build
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// Sends a custom DOM event so your UI layer can show a "Update available" banner
function dispatchUpdateEvent(worker) {
  const event = new CustomEvent('swUpdate', { detail: { worker } });
  window.dispatchEvent(event);
}

// Call this from your "Update now" banner button
export function applyUpdate(worker) {
  if (!worker) return;
  worker.postMessage({ type: 'SKIP_WAITING' });
}
