import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'guestseat.theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // True only while the print dialog is open. Every dark colour in the app comes from a `dark:`
  // utility under the `dark` class, so there is no CSS way to undo them inside `@media print` —
  // dropping the class for the duration prints the light theme instead of a page of black ink.
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark' && !printing);
    document.documentElement.style.colorScheme = printing ? 'light' : theme;
  }, [theme, printing]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    // Safari fires neither beforeprint nor afterprint, but does change the print media query;
    // Chrome and Firefox do both, and setting the same value twice is harmless.
    const query = window.matchMedia('print');
    const onChange = (e: MediaQueryListEvent) => setPrinting(e.matches);
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    query.addEventListener('change', onChange);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      query.removeEventListener('change', onChange);
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
