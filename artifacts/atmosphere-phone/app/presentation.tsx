import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAtmosphere } from '@/src/context/StateContext';
import { useNetwork } from '@/src/context/NetworkContext';
import { useApp } from '@/src/context/AppContext';
import { PhaseRenderer } from '@/src/components/visual/PhaseRenderer';
import type { AudioEngineHandle } from '@/src/components/audio/AudioEngine';
import { PHASE_LABELS, THEME_LABELS } from '@/src/themes.config';

let AudioEngine: React.ComponentType<{ onReady?: () => void; ref?: React.Ref<AudioEngineHandle> }> | null = null;
if (Platform.OS !== 'web') {
  try { AudioEngine = require('@/src/components/audio/AudioEngine').AudioEngine; } catch {}
}

export default function PresentationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, onStateChange } = useAtmosphere();
  const { status, connect, disconnect } = useNetwork();
  const { relayUrl } = useApp();
  const audioRef = useRef<AudioEngineHandle>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [showHUD, setShowHUD] = useState(true);

  // Connect to relay as presentation
  useEffect(() => {
    connect(relayUrl);
    return () => disconnect();
  }, [relayUrl]);

  // Sync state changes to audio engine
  useEffect(() => {
    const unsub = onStateChange((s) => {
      audioRef.current?.sendToEngine({ type: 'SET_STATE', state: s });
    });
    return unsub;
  }, [onStateChange]);

  // Start audio on ready
  const handleAudioReady = useCallback(() => {
    setAudioReady(true);
    audioRef.current?.startWithState(state);
  }, [state]);

  // Auto-hide HUD
  useEffect(() => {
    const t = setTimeout(() => setShowHUD(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const toggleHUD = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowHUD(v => !v);
  };

  const statusColor = status === 'connected' ? '#60d890' : status === 'connecting' ? '#f0c060' : '#f07070';

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Visual layer */}
      <PhaseRenderer phase={state.phase} theme={state.theme} intensity={state.intensity} />

      {/* Tap to toggle HUD */}
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
                {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
              </Text>
              <TouchableOpacity style={styles.exitBtn} onPress={() => {
                disconnect();
                audioRef.current?.sendToEngine({ type: 'STOP_ALL' });
                router.replace('/');
              }}>
                <Feather name="x" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom: mute and audio status */}
          <View style={styles.hudBottom}>
            {state.muted && (
              <View style={styles.mutedBadge}>
                <Feather name="volume-x" size={14} color="#f07070" />
                <Text style={styles.mutedText}>Muted</Text>
              </View>
            )}
            {!audioReady && Platform.OS !== 'web' && (
              <View style={styles.loadingBadge}>
                <Text style={styles.loadingText}>Loading audio…</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Hidden audio engine */}
      {AudioEngine && (
        <AudioEngine ref={audioRef} onReady={handleAudioReady} />
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
  hudBottom: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  mutedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
  },
  mutedText: { color: '#f07070', fontSize: 13, fontFamily: 'Inter_500Medium' },
  loadingBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter_400Regular' },
});
