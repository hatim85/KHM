import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'khm-theme';

const applyTheme = (theme) => {
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
  root.style.colorScheme = theme;
};

export const initTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    applyTheme(stored === 'light' ? 'light' : 'dark');
  } catch {
    applyTheme('dark');
  }
};

/**
 * Dark-first theme toggle persisted to localStorage.
 * Default is dark (preserves the existing ERP look).
 */
export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage unavailable — theme still applies for the session
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
};
