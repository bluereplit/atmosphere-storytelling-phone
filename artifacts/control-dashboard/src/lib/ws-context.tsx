import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetState } from "@workspace/api-client-react";
import { LiveState } from "@workspace/api-client-react/src/generated/api.schemas";

interface ConnectionContextType {
  state: LiveState | null;
  connected: boolean;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [wsState, setWsState] = useState<LiveState | null>(null);
  
  // Use React Query for initial state, but WS overrides it
  const { data: initialState } = useGetState({
    query: {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }
  });

  const activeState = wsState || initialState || null;

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: number;
    let isComponentMounted = true;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!isComponentMounted) return;
        setConnected(true);
      };

      ws.onclose = () => {
        if (!isComponentMounted) return;
        setConnected(false);
        reconnectTimer = window.setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        if (!isComponentMounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "state") {
            setWsState((prev) => {
              const base = prev || initialState || ({} as LiveState);
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
        } catch (err) {
          console.error("WS parse error", err);
        }
      };
    }

    connect();

    return () => {
      isComponentMounted = false;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
      }
    };
  }, [initialState]);

  return (
    <ConnectionContext.Provider value={{ state: activeState, connected }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
}
