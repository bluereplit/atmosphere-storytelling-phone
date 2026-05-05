import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { useAtmosphere } from '@/src/context/StateContext';
import { useNetwork } from '@/src/context/NetworkContext';
import { useApp } from '@/src/context/AppContext';
import { PhaseRenderer } from '@/src/components/visual/PhaseRenderer';
import type { AudioEngineHandle } from '@/src/components/audio/AudioEngine';
import { PHASE_LABELS, THEME_LABELS } from '@/src/themes.config';

let AudioEngine: React.ComponentType<{
  onReady?: () => void;
  ref?: React.Ref<AudioEngineHandle>;
  onVoiceMessage?: (msg: { type: string; data?: string; mimeType?: string }) => void;
}> | null = null;
if (Platform.OS !== 'web') {
  try { AudioEngine = require('@/src/components/audio/AudioEngine').AudioEngine; } catch {}
}

export default function PresentationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, onStateChange } = useAtmosphere();
  const { status, connect, disconnect, controllerCount } = useNetwork();
  const { relayUrl, clearMode } = useApp();
  const audioRef = useRef<AudioEngineHandle>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [showHUD, setShowHUD] = useState(true);
  const [localIp, setLocalIp] = useState<string>('…');

  // Detect local IP for pairing display
  useEffect(() => {
    Network.getIpAddressAsync()
      .then(ip => setLocalIp(ip || '—'))
      .catch(() => setLocalIp('—'));
  }, []);

  // Connect to relay as presentation
  useEffect(() => {
    connect(relayUrl);
    return () => disconnect();
  }, [relayUrl]);

  // Sync state changes → audio engine
  useEffect(() => {
    return onStateChange((s) => {
      audioRef.current?.sendToEngine({ type: 'SET_STATE', state: s });
    });
  }, [onStateChange]);

  // Start audio on ready
  const handleAudioReady = useCallback(() => {
    setAudioReady(true);
    audioRef.current?.startWithState(state);
  }, [state]);

  // Receive CMD_VOICE_DATA from relay → play in WebView audio engine
  const handleVoiceMessage = useCallback((msg: { type: string; data?: string; mimeType?: string }) => {
    if (msg.type === 'CMD_VOICE_DATA' && msg.data) {
      audioRef.current?.sendToEngine({
        type: 'PLAY_VOICE',
        data: msg.data,
        mimeType: msg.mimeType || 'audio/m4a',
      });
    }
  }, []);

  // Auto-hide HUD after 5 seconds
  useEffect(() => {
    const t = setTimeout(() => setShowHUD(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const toggleHUD = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowHUD(v => !v);
  };

  const relayHost = relayUrl.replace(/^ws:\/\//, '').replace(/:\d+$/, '');
  const relayPort = relayUrl.match(/:(\d+)$/)?.[1] ?? '3001';
  const statusColor =
    status === 'connected' ? '#60d890' :
    status === 'connecting' ? '#f0c060' : '#f07070';

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Full-screen visual */}
      <PhaseRenderer phase={state.phase} theme={state.theme} intensity={state.intensity} />

      {/* Tap anywhere to toggle HUD */}
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={toggleHUD} activeOpacity={1} />

      {/* HUD overlay */}
      {showHUD && (
        <View style={[styles.hud, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          {/* Top bar */}
          <View style={styles.hudTop}>
            <View style={styles.hudInfo}>
              <Text style={styles.phaseLabel}>{PHASE_LABELS[state.phase]}</Text>
              <Text style={styles.themeLabel}>{THEME_LABELS[state.theme]}</Text>
            </View>
            <View style={styles.hudRight}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={styles.statusText}>
                {status === 'connected' ? 'Relay Connected' :
                 status === 'connecting' ? 'Connecting…' : 'Offline'}
              </Text>
              <TouchableOpacity style={styles.exitBtn} onPress={() => {
                disconnect();
                audioRef.current?.sendToEngine({ type: 'STOP_ALL' });
                clearMode();
                router.replace('/');
              }}>
                <Feather name="x" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom: pairing info + controller count + mute badge */}
          <View style={styles.hudBottom}>
            {/* Pairing block — shown when no controllers connected */}
            {controllerCount === 0 && status === 'connected' && (
              <View style={styles.pairingBox}>
                <Feather name="smartphone" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.pairingText}>
                  Relay: {relayHost}:{relayPort}{'  '}|{'  '}Phone IP: {localIp}
                </Text>
                <Text style={styles.pairingHint}>
                  No controller connected — enter relay URL on controller phone
                </Text>
              </View>
            )}

            {/* Connected controller count */}
            {controllerCount > 0 && (
              <View style={styles.controllerBadge}>
                <Feather name="radio" size={12} color="#60d890" />
                <Text style={styles.controllerText}>
                  {controllerCount} controller{controllerCount !== 1 ? 's' : ''} connected
                </Text>
              </View>
            )}

            {/* Mute indicator */}
            {state.muted && (
              <View style={styles.mutedBadge}>
                <Feather name="volume-x" size={14} color="#f07070" />
                <Text style={styles.mutedText}>Muted</Text>
              </View>
            )}

            {/* Audio loading */}
            {!audioReady && Platform.OS !== 'web' && (
              <View style={styles.loadingBadge}>
                <Text style={styles.loadingText}>Loading audio…</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Hidden audio engine (native only) */}
      {AudioEngine && (
        <AudioEngine
          ref={audioRef}
          onReady={handleAudioReady}
          onVoiceMessage={handleVoiceMessage}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  hud: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    pointerEvents: 'box-none',
  },
  hudTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hudInfo: { gap: 2 },
  phaseLabel: { fontSize: 22, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.9)' },
  themeLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.6)' },
  hudRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular' },
  exitBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  hudBottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  pairingBox: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 12,
    gap: 4, maxWidth: '100%',
  },
  pairingText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_500Medium' },
  pairingHint: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter_400Regular' },
  controllerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
  },
  controllerText: { color: '#60d890', fontSize: 13, fontFamily: 'Inter_500Medium' },
  mutedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
  },
  mutedText: { color: '#f07070', fontSize: 13, fontFamily: 'Inter_500Medium' },
  loadingBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
  },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter_400Regular' },
});
