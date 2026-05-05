import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppMode } from '../types';

interface AppContextValue {
  mode: AppMode | null;
  relayUrl: string;
  setMode: (mode: AppMode) => void;
  setRelayUrl: (url: string) => void;
  clearMode: () => void;
}

const AppContext = createContext<AppContextValue>({
  mode: null,
  relayUrl: 'ws://192.168.1.100:3001',
  setMode: () => {},
  setRelayUrl: () => {},
  clearMode: () => {},
});

const MODE_KEY = '@atm/mode';
const RELAY_KEY = '@atm/relay_url';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode | null>(null);
  const [relayUrl, setRelayUrlState] = useState('ws://192.168.1.100:3001');

  useEffect(() => {
    AsyncStorage.multiGet([MODE_KEY, RELAY_KEY]).then(([[, m], [, r]]) => {
      if (m) setModeState(m as AppMode);
      if (r) setRelayUrlState(r);
    });
  }, []);

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m);
  }, []);

  const setRelayUrl = useCallback((url: string) => {
    setRelayUrlState(url);
    AsyncStorage.setItem(RELAY_KEY, url);
  }, []);

  const clearMode = useCallback(() => {
    setModeState(null);
    AsyncStorage.removeItem(MODE_KEY);
  }, []);

  return (
    <AppContext.Provider value={{ mode, relayUrl, setMode, setRelayUrl, clearMode }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
