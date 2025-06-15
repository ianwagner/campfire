import { useState, useEffect } from 'react';

// Cache reference to matchMedia if available. In test environments like
// Jest's jsdom it may be undefined.
const matchMediaRef =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : null;

const getPreference = () => {
  if (typeof localStorage === 'undefined') return 'system';
  return localStorage.getItem('theme') || 'system';
};

const getResolved = (pref) => {
  if (pref === 'system') {
    if (matchMediaRef) {
      return matchMediaRef('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    // Default to light when matchMedia isn't available
    return 'light';
  }
  return pref;
};

const useTheme = () => {
  const [preference, setPreference] = useState(getPreference());
  const [resolved, setResolved] = useState(() => getResolved(getPreference()));

  useEffect(() => {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const updateMeta = (mode) => {
      if (!themeMeta) return;
      themeMeta.setAttribute('content', mode === 'dark' ? '#0d1116' : '#ffffff');
    };
    const apply = (pref) => {
      const mode = getResolved(pref);
      setResolved(mode);
      document.documentElement.classList.toggle('dark', mode === 'dark');
      updateMeta(mode);
    };

    apply(preference);

    const media = matchMediaRef ? matchMediaRef('(prefers-color-scheme: dark)') : null;
    const handleChange = () => {
      if (preference === 'system') apply('system');
    };
    if (preference === 'system' && media) media.addEventListener('change', handleChange);
    return () => {
      if (media) media.removeEventListener('change', handleChange);
    };
  }, [preference]);

  const setTheme = (pref) => {
    setPreference(pref);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', pref);
    }
  };

  const toggleTheme = () => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  };

  return { theme: preference, resolvedTheme: resolved, setTheme, toggleTheme };
};

export default useTheme;
