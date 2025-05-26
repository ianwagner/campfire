import { useState, useEffect } from 'react';

const getPreference = () => {
  if (typeof localStorage === 'undefined') return 'system';
  return localStorage.getItem('theme') || 'system';
};

const getResolved = (pref) => {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return pref;
};

const useTheme = () => {
  const [preference, setPreference] = useState(getPreference());
  const [resolved, setResolved] = useState(() => getResolved(getPreference()));

  useEffect(() => {
    const apply = (pref) => {
      const mode = getResolved(pref);
      setResolved(mode);
      document.documentElement.classList.toggle('dark', mode === 'dark');
    };

    apply(preference);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (preference === 'system') apply('system');
    };
    if (preference === 'system') media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
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
