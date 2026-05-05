import React, {
  createContext, useContext, useState, useEffect,
  useRef, useCallback,
} from 'react';
import type { AtmosphereState, AppMode, NetworkMessage, CmdMessage } from '../types';
import { useApp } from './AppContext';
import { useAtmosphere } from './StateContext';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface NetworkContextValue {
  status: ConnectionStatus;
  error: string | null;
  controllerCount: number;
  connect: (url: string) => void;
  disconnect: () => void;
  sendCommand: (cmd: CmdMessage) => void;
  sendMessage: (msg: NetworkMessage) => void;
}

const NetworkContext = createContext<NetworkContextValue>({} as NetworkContextValue);

const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 10000;

/**
 * Architecture:
 *
 * PRESENTATION (authoritative):
 *   - Registers as 'presentation' with relay
 *   - Receives CMD_* messages from controllers → applyCommand() → state changes
 *   - Broadcasts STATE to all controllers on every state change
 *   - Tracks how many controllers are connected
 *
 * CONTROLLER (view + command client):
 *   - Registers as 'controller' with relay
 *   - Sends CMD_* messages when user interacts (may also update local state optimistically)
 *   - Receives STATE messages from presentation → applyFullState()
 */
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { mode, relayUrl } = useApp();
  const { applyFullState, applyCommand, onStateChange, state } = useAtmosphere();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [controllerCount, setControllerCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReconnectRef = useRef(false);
  const currentRelayUrlRef = useRef(relayUrl);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
  }, []);

  const sendRaw = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const sendMessage = useCallback((msg: NetworkMessage) => {
    sendRaw(JSON.stringify(msg));
  }, [sendRaw]);

  // CMD: only controller sends commands; ignored on presentation
  const sendCommand = useCallback((cmd: CmdMessage) => {
    if (mode === 'controller') {
      sendRaw(JSON.stringify({ ...cmd, role: 'controller' }));
    }
  }, [mode, sendRaw]);

  const handleMessage = useCallback((msg: NetworkMessage) => {
    if (msg.type === 'PING') {
      sendRaw(JSON.stringify({ type: 'PONG' }));
      return;
    }
    if (msg.type === 'PONG') return;

    if (mode === 'presentation') {
      // Presentation receives commands from controllers
      if (msg.type.startsWith('CMD_')) {
        applyCommand(msg as unknown as CmdMessage);
        return;
      }
      if (msg.type === 'CONTROLLER_CONNECTED') {
        setControllerCount(n => n + 1);
        return;
      }
      if (msg.type === 'CONTROLLER_DISCONNECTED') {
        setControllerCount(n => Math.max(0, n - 1));
        return;
      }
      if (msg.type === 'REQUEST_STATE') {
        // Relay asks us to re-send current state (new controller joined)
        sendRaw(JSON.stringify({ type: 'STATE', state }));
        return;
      }
    } else if (mode === 'controller') {
      // Controller receives authoritative state from presentation
      if (msg.type === 'STATE' && msg.state) {
        applyFullState(msg.state as AtmosphereState);
        return;
      }
    }
  }, [mode, applyCommand, applyFullState, sendRaw, state]);

  const connect = useCallback((url: string) => {
    if (wsRef.current) wsRef.current.close();
    clearTimers();
    shouldReconnectRef.current = true;
    currentRelayUrlRef.current = url;
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
        // Ping keepalive
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, PING_INTERVAL);
        // Presentation: send initial state to any waiting controllers
        if (mode === 'presentation') {
          setTimeout(() => {
            ws.send(JSON.stringify({ type: 'STATE', state }));
          }, 200);
        }
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
            if (shouldReconnectRef.current) connect(currentRelayUrlRef.current);
          }, RECONNECT_DELAY);
        }
      };
    } catch {
      setStatus('error');
      setError('Invalid relay URL');
    }
  }, [mode, clearTimers, handleMessage, state]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
    setControllerCount(0);
  }, [clearTimers]);

  // Presentation: broadcast state to all controllers on every state change
  useEffect(() => {
    if (mode !== 'presentation') return;
    return onStateChange((s) => {
      sendRaw(JSON.stringify({ type: 'STATE', state: s }));
    });
  }, [mode, onStateChange, sendRaw]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearTimers();
      wsRef.current?.close();
    };
  }, []);

  return (
    <NetworkContext.Provider value={{
      status, error, controllerCount,
      connect, disconnect, sendCommand, sendMessage,
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
