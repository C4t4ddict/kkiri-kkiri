import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

type ThemePreference = 'system' | 'light' | 'dark';
declare global {
  interface Window {
    kkiriTheme: {
      getSnapshot: () => string;
      setPreference: (preference: ThemePreference) => void;
      subscribe: (listener: () => void) => () => void;
    };
  }
}

export function ThemeToggle() {
  const snapshot = useSyncExternalStore(window.kkiriTheme.subscribe, window.kkiriTheme.getSnapshot);
  const dark = snapshot.split(':')[1] === 'dark';
  const Icon = dark ? Moon : Sun;
  return <button type="button" className="theme-toggle" role="switch" aria-checked={dark} aria-label="다크 모드" title={dark ? '다크 모드 끄기' : '다크 모드 켜기'} onClick={() => window.kkiriTheme.setPreference(dark ? 'light' : 'dark')}>
    <Icon size={17} aria-hidden="true" />
    <span className="theme-toggle-label">다크 모드</span>
    <span className="theme-toggle-track" aria-hidden="true"><span /></span>
  </button>;
}

export function StandaloneThemeToggle() {
  const { pathname } = useLocation();
  if (!/^\/(register|forgot-password|join|portfolio\/shared)(\/|$)/.test(pathname)) return null;
  return <div className="standalone-theme-controls"><ThemeToggle /></div>;
}
