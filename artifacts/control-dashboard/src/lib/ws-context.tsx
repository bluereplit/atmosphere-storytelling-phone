import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetState, type LiveState } from "@workspace/api-client-react";

interface ConnectionContextType {
  state: LiveState | null;
  connected: boolean;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [wsState, setWsState] = useState<LiveState | null>(null);

  const { data: initialState } = useGetState();

  const activeState = wsState ?? initialState ?? null;

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let mounted = true;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => { if (mounted) setConnected(true); };
      ws.onclose = () => {
        if (!mounted) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(event.data as string) as Partial<LiveState> & { type?: string };
          if (data.type === "state") {
            setWsState(prev => {
              const base: LiveState = prev ?? (initialState as LiveState) ?? ({} as LiveState);
              return {
                ...base,
                ...data,
                timestamp: data.timestamp ?? base.timestamp ?? Date.now(),
                currentPhase: data.currentPhase ?? base.currentPhase ?? "daytime",
                environmentTheme: data.environmentTheme ?? base.environmentTheme ?? "forest",
                intensity: data.intensity ?? base.intensity ?? 0,
                phaseParams: data.phaseParams ?? base.phaseParams ?? { reverb: 0, lpfFreq: 20000, masterPitch: 0 },
                attributes: data.attributes ?? base.attributes ?? {},
                muted: data.muted ?? base.muted ?? false,
                scReady: data.scReady ?? base.scReady ?? false,
              };
            });
          }
        } catch {
          // ignore malformed WS messages
        }
      };
    }

    connect();
    return () => {
      mounted = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConnectionContext.Provider value={{ state: activeState, connected }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextType {
  const context = useContext(ConnectionContext);
  if (!context) throw new Error("useConnection must be used within a ConnectionProvider");
  return context;
}
