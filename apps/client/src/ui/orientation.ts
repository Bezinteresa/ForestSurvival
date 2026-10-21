// The game is played in landscape on phones and tablets, as in the reference game.

const TOUCH_PORTRAIT = '(any-pointer: coarse) and (orientation: portrait)';

/** Calls back with true while a touch device is held in portrait. Returns the cleanup. */
export function watchTouchPortrait(onChange: (portrait: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') { onChange(false); return () => {}; }
  const query = window.matchMedia(TOUCH_PORTRAIT);
  let last: boolean | undefined;
  const listener = () => { if (query.matches !== last) { last = query.matches; onChange(last); } };
  // Some browsers (and device emulation) skip the media change event on rotation; resize catches it.
  query.addEventListener('change', listener);
  window.addEventListener('resize', listener);
  window.addEventListener('orientationchange', listener);
  listener();
  return () => {
    query.removeEventListener('change', listener);
    window.removeEventListener('resize', listener);
    window.removeEventListener('orientationchange', listener);
  };
}

/**
 * On touch devices, asks for fullscreen and a landscape lock. Must run inside a user gesture.
 * Browsers that refuse (iOS Safari, desktop) keep working; the portrait overlay covers them.
 */
export async function requestLandscape(): Promise<void> {
  if (typeof window === 'undefined' || !window.matchMedia('(any-pointer: coarse)').matches) return;
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* fullscreen is optional */ }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
    await orientation.lock?.('landscape');
  } catch { /* lock is not supported everywhere */ }
}
