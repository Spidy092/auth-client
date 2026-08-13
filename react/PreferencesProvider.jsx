import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  PREFERENCE_DEFAULTS,
  applyPreferences,
  getPreferences,
  resolveTheme,
  startPreferenceSync,
  subscribePreferences,
  updatePreferences,
} from '../preferences.js';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children, initialPreferences, applyToDocument = true }) {
  const [preferences, setPreferences] = useState(() => ({
    ...PREFERENCE_DEFAULTS,
    ...initialPreferences,
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribePreferences((next) => {
      setPreferences(next);
      setLoading(false);
      setError(null);
    });
    const stopSync = startPreferenceSync();
    getPreferences()
      .catch((nextError) => {
        setError(nextError);
        setLoading(false);
      });
    return () => {
      unsubscribe();
      stopSync();
    };
  }, []);

  useEffect(() => {
    if (applyToDocument) applyPreferences(preferences);
  }, [applyToDocument, preferences]);

  useEffect(() => {
    if (preferences.theme !== 'system' || typeof matchMedia !== 'function') return undefined;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => applyPreferences(preferences);
    media.addEventListener?.('change', applySystemTheme);
    return () => media.removeEventListener?.('change', applySystemTheme);
  }, [preferences]);

  const value = useMemo(() => ({
    preferences,
    resolvedTheme: resolveTheme(preferences.theme),
    loading,
    error,
    refresh: () => getPreferences({ force: true }),
    update: updatePreferences,
  }), [error, loading, preferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within a PreferencesProvider');
  return context;
}
