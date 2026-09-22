/**
 * Sovereign Loader Controller
 * Triggers the exact 5-second branded loading screen requested by user
 */

export function triggerLoader(durationMs: number = 5000, text: string = 'Loading'): Promise<void> {
  return new Promise((resolve) => {
    const win = window as any;
    if (typeof win.Loader?.showFor === 'function') {
      win.Loader.showFor(durationMs, text, resolve);
    } else if (typeof win.Loader?.show === 'function') {
      win.Loader.show(text);
      setTimeout(() => {
        if (typeof win.Loader?.done === 'function') {
          win.Loader.done();
        }
        resolve();
      }, durationMs);
    } else {
      setTimeout(resolve, durationMs);
    }
  });
}

export function showLoaderImmediate(text: string = 'Loading'): void {
  const win = window as any;
  if (typeof win.Loader?.show === 'function') {
    win.Loader.show(text);
  }
}

export function hideLoaderImmediate(): void {
  const win = window as any;
  if (typeof win.Loader?.done === 'function') {
    win.Loader.done();
  }
}
