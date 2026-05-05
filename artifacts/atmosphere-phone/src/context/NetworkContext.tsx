import React, {
  createContext, useContext, useState, useEffect,
  useRef, useCallback,
} from 'react';
import type { AtmosphereState, AppMode, NetworkMessage } from '../types';
import { useApp } from './AppContext';
import { useAtmosphere } from './StateContext';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface NetworkContextValue {
  status: ConnectionStatus;
  error: string | null;
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (msg: NetworkMessage) => void;
  sendStateSync: (state: AtmosphereState) => void;
  sendCommand: (msg: NetworkMessage) => void;
}

const NetworkContext = createContext<NetworkContextValue>({} as NetworkContextValue);

const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 10000;

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { mode, relayUrl } = useApp();
  const { applyFullState } = useAtmosphere();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReconnectRef = useRef(false);

  const clearTimers = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
  };

  const connect = useCallback((url: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    clearTimers();
    shouldReconnectRef.current = true;
    setStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setError(null);
        // Register role with relay
        ws.send(JSON.stringify({ role: mode, type: 'HELLO' }));
        // Start ping
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as NetworkMessage;
          handleMessage(msg);
        } catch {}
      };

      ws.onerror = () => {
        setStatus('error');
        setError('Connection failed');
      };

      ws.onclose = () => {
        clearTimers();
        if (shouldReconnectRef.current) {
          setStatus('disconnected');
          reconnectTimerRef.current = setTimeout(() => {
            if (shouldReconnectRef.current) connect(url);
          }, RECONNECT_DELAY);
        }
      };
    } catch (e) {
      setStatus('error');
      setError('Invalid URL');
    }
  }, [mode]);

  const handleMessage = useCallback((msg: NetworkMessage) => {
    if (msg.type === 'STATE_SYNC' && mode === 'controller') {
      applyFullState(msg.state as AtmosphereState);
    } else if (msg.type === 'PING') {
      wsRef.current?.send(JSON.stringify({ type: 'PONG' }));
    }
  }, [mode, applyFullState]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const sendMessage = useCallback((msg: NetworkMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendStateSync = useCallback((state: AtmosphereState) => {
    sendMessage({ type: 'STATE_SYNC', state });
  }, [sendMessage]);

  const sendCommand = useCallback((msg: NetworkMessage) => {
    sendMessage(msg);
  }, [sendMessage]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearTimers();
      wsRef.current?.close();
    };
  }, []);

  return (
    <NetworkContext.Provider value={{
      status, error, connect, disconnect, sendMessage, sendStateSync, sendCommand,
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
