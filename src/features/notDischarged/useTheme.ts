import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'nd-theme';

/** The user's own choice, if they made one (it can be unavailable, e.g. blocked storage). */
function storedTheme(): Theme | undefined {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : undefined;
  } catch {
    return undefined;
  }
}

const systemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme; // native date pickers, scrollbars
}

// Applied as soon as the app loads, so the first paint already has the right colours.
if (typeof document !== 'undefined') applyTheme(storedTheme() ?? systemTheme());

/**
 * Light / dark mode. Follows the device until the user picks one; their pick is remembered.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  // Without a saved choice, follow the device when it switches.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = () => {
      if (storedTheme()) return;
      const next = systemTheme();
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // not saved; it still applies for this visit
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
