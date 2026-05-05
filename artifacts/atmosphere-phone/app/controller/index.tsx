import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useAtmosphere } from '@/src/context/StateContext';
import { useNetwork } from '@/src/context/NetworkContext';
import { useApp } from '@/src/context/AppContext';
import { SliderControl } from '@/src/components/ui/SliderControl';
import {
  ALL_PHASES, ALL_THEMES, PHASE_LABELS, THEME_LABELS, THEME_ICONS,
  PHASE_GRADIENT_COLORS,
} from '@/src/themes.config';
import type { Phase, Theme } from '@/src/types';
import { useColors } from '@/hooks/useColors';

const PHASE_COLORS: Record<Phase, string> = {
  daytime: '#f5d070',
  evening: '#f08040',
  night: '#5080e0',
  dawn: '#d060e0',
};

const THEME_ACCENT: Record<Theme, string> = {
  forest: '#50a870', ocean: '#4090c8', mountain: '#809aaa', desert: '#c89840',
  city: '#8090a0', mystical: '#9070c8', medieval: '#9a7050', underwater: '#30b0b0',
  cosmic: '#7050c0', cave: '#806860', arctic: '#90c8e0', jungle: '#308870', tavern: '#b08050',
};

export default function AtmosphereScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, setPhase, setTheme, setIntensity, setMasterVolume, setMuted, setPhaseParams, onStateChange } = useAtmosphere();
  const { status, connect, disconnect, sendStateSync } = useNetwork();
  const { relayUrl, clearMode } = useApp();

  // Connect to relay as controller
  useEffect(() => {
    connect(relayUrl);
    return () => disconnect();
  }, [relayUrl]);

  // Broadcast state changes
  useEffect(() => {
    const unsub = onStateChange((s) => sendStateSync(s));
    return unsub;
  }, [onStateChange, sendStateSync]);

  const handlePhase = useCallback((p: Phase) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase(p);
  }, [setPhase]);

  const handleTheme = useCallback((t: Theme) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTheme(t);
  }, [setTheme]);

  const statusColor = status === 'connected' ? '#60d890' : status === 'connecting' ? '#f0c060' : '#f07070';
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Atmosphere</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {status === 'connected' ? 'Connected to Presentation' : status === 'connecting' ? 'Connecting…' : 'Not connected'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.muteBtn, { backgroundColor: state.muted ? '#f0707020' : colors.surfaceElevated || colors.muted }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMuted(!state.muted); }}
        >
          <Feather name={state.muted ? 'volume-x' : 'volume-2'} size={20} color={state.muted ? '#f07070' : colors.text} />
        </TouchableOpacity>
      </View>

      {/* Phases */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PHASE</Text>
      <View style={styles.phaseGrid}>
        {ALL_PHASES.map((p) => {
          const active = state.phase === p;
          const pc = PHASE_COLORS[p];
          return (
            <TouchableOpacity key={p} style={[styles.phaseCard, { borderColor: active ? pc : colors.border, backgroundColor: active ? pc + '20' : colors.surface }]} onPress={() => handlePhase(p)} activeOpacity={0.8}>
              <Text style={[styles.phaseLabel, { color: active ? pc : colors.text }]}>{PHASE_LABELS[p]}</Text>
              {active && <View style={[styles.phaseActiveDot, { backgroundColor: pc }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Themes */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ENVIRONMENT</Text>
      <View style={styles.themeGrid}>
        {ALL_THEMES.map((t) => {
          const active = state.theme === t;
          const tc = THEME_ACCENT[t];
          return (
            <TouchableOpacity key={t} style={[styles.themeChip, { borderColor: active ? tc : colors.border, backgroundColor: active ? tc + '20' : colors.surface }]} onPress={() => handleTheme(t)} activeOpacity={0.8}>
              <Feather name={THEME_ICONS[t] as any} size={14} color={active ? tc : colors.mutedForeground} />
              <Text style={[styles.themeLabel, { color: active ? tc : colors.text }]}>{THEME_LABELS[t]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Sliders */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>LEVELS</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SliderControl
          label="Intensity"
          value={state.intensity}
          onValueChange={setIntensity}
          color="#d4a96a"
        />
        <View style={styles.divider} />
        <SliderControl
          label="Master Volume"
          value={state.masterVolume}
          onValueChange={setMasterVolume}
          color="#7aa8f0"
        />
      </View>

      {/* Phase params */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SYNTHESIS</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SliderControl
          label="Reverb"
          value={state.phaseParams.reverb}
          onValueChange={(v) => setPhaseParams({ reverb: v })}
          color="#9070c8"
        />
        <View style={styles.divider} />
        <SliderControl
          label="Filter"
          value={state.phaseParams.lpfFreq}
          min={500}
          max={20000}
          onValueChange={(v) => setPhaseParams({ lpfFreq: v })}
          formatValue={(v) => `${Math.round(v)} Hz`}
          color="#4090c8"
        />
        <View style={styles.divider} />
        <SliderControl
          label="Pitch"
          value={state.phaseParams.masterPitch}
          min={-12}
          max={12}
          onValueChange={(v) => setPhaseParams({ masterPitch: v })}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st`}
          color="#50a870"
        />
      </View>

      {/* Exit */}
      <TouchableOpacity style={[styles.exitBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => { disconnect(); clearMode(); router.replace('/'); }}>
        <Feather name="log-out" size={16} color={colors.mutedForeground} />
        <Text style={[styles.exitText, { color: colors.mutedForeground }]}>Exit to Mode Select</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  muteBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginBottom: 10, marginTop: 20 },
  phaseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phaseCard: {
    flex: 1, minWidth: '45%', paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1.5, alignItems: 'center', position: 'relative',
  },
  phaseLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  phaseActiveDot: { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: 3 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1,
  },
  themeLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 4 },
  divider: { height: 1, backgroundColor: '#28354a', marginVertical: 8 },
  exitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14,
    borderRadius: 12, borderWidth: 1, marginTop: 24, justifyContent: 'center',
  },
  exitText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
