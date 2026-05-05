import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { AtmosphereState, Phase, Theme, AttributeName, PhaseParams } from '../types';
import { DEFAULT_STATE } from '../defaultState';
import { THEME_DEFAULT_ATTRIBUTES, PHASE_DEFAULT_PARAMS, ALL_ATTRIBUTES } from '../themes.config';

interface StateContextValue {
  state: AtmosphereState;
  setPhase: (phase: Phase) => void;
  setTheme: (theme: Theme) => void;
  setIntensity: (v: number) => void;
  setMasterVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
  toggleAttribute: (name: AttributeName) => void;
  setAttributeEnabled: (name: AttributeName, enabled: boolean) => void;
  setAttributeVolume: (name: AttributeName, v: number) => void;
  setPhaseParams: (p: Partial<PhaseParams>) => void;
  applyFullState: (s: AtmosphereState) => void;
  onStateChange: (cb: (s: AtmosphereState) => void) => () => void;
}

const StateContext = createContext<StateContextValue>({} as StateContextValue);

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AtmosphereState>(DEFAULT_STATE);
  const listenersRef = useRef<Set<(s: AtmosphereState) => void>>(new Set());

  const notify = useCallback((s: AtmosphereState) => {
    listenersRef.current.forEach(cb => cb(s));
  }, []);

  const update = useCallback((updater: (prev: AtmosphereState) => AtmosphereState) => {
    setState(prev => {
      const next = updater(prev);
      notify(next);
      return next;
    });
  }, [notify]);

  const setPhase = useCallback((phase: Phase) => {
    update(prev => ({
      ...prev,
      phase,
      phaseParams: PHASE_DEFAULT_PARAMS[phase],
    }));
  }, [update]);

  const setTheme = useCallback((theme: Theme) => {
    update(prev => {
      const defaults = THEME_DEFAULT_ATTRIBUTES[theme];
      const attributes = { ...prev.attributes };
      for (const name of ALL_ATTRIBUTES) {
        attributes[name] = { ...attributes[name], enabled: defaults.includes(name) };
      }
      return { ...prev, theme, attributes };
    });
  }, [update]);

  const setIntensity = useCallback((intensity: number) => {
    update(prev => ({ ...prev, intensity }));
  }, [update]);

  const setMasterVolume = useCallback((masterVolume: number) => {
    update(prev => ({ ...prev, masterVolume }));
  }, [update]);

  const setMuted = useCallback((muted: boolean) => {
    update(prev => ({ ...prev, muted }));
  }, [update]);

  const toggleAttribute = useCallback((name: AttributeName) => {
    update(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [name]: { ...prev.attributes[name], enabled: !prev.attributes[name].enabled },
      },
    }));
  }, [update]);

  const setAttributeEnabled = useCallback((name: AttributeName, enabled: boolean) => {
    update(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [name]: { ...prev.attributes[name], enabled },
      },
    }));
  }, [update]);

  const setAttributeVolume = useCallback((name: AttributeName, volume: number) => {
    update(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [name]: { ...prev.attributes[name], volume },
      },
    }));
  }, [update]);

  const setPhaseParams = useCallback((p: Partial<PhaseParams>) => {
    update(prev => ({
      ...prev,
      phaseParams: { ...prev.phaseParams, ...p },
    }));
  }, [update]);

  const applyFullState = useCallback((s: AtmosphereState) => {
    setState(s);
    notify(s);
  }, [notify]);

  const onStateChange = useCallback((cb: (s: AtmosphereState) => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  return (
    <StateContext.Provider value={{
      state, setPhase, setTheme, setIntensity, setMasterVolume,
      setMuted, toggleAttribute, setAttributeEnabled, setAttributeVolume,
      setPhaseParams, applyFullState, onStateChange,
    }}>
      {children}
    </StateContext.Provider>
  );
}

export function useAtmosphere() {
  return useContext(StateContext);
}
