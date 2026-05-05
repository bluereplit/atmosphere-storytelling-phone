import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

interface VoiceLine {
  id: string;
  label: string;
  text: string;
}

const PRESET_LINES: VoiceLine[] = [
  { id: '1', label: 'Scene Open', text: 'The world shifts around you...' },
  { id: '2', label: 'Tension', text: 'Something stirs in the darkness.' },
  { id: '3', label: 'Discovery', text: 'Your eyes adjust to reveal...' },
  { id: '4', label: 'Transition', text: 'Time passes. The atmosphere changes.' },
  { id: '5', label: 'Danger', text: 'A chill runs down your spine.' },
  { id: '6', label: 'Mystery', text: 'You cannot shake the feeling you are being watched.' },
  { id: '7', label: 'Peace', text: 'A moment of calm washes over the party.' },
  { id: '8', label: 'Epic', text: 'The fate of the realm rests in your hands.' },
];

export default function VoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useSharedValue(1);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  const startPulse = useCallback(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
  }, []);

  const stopPulse = useCallback(() => {
    pulseAnim.value = withTiming(1, { duration: 200 });
  }, []);

  const handleRecord = useCallback(() => {
    if (Platform.OS === 'web') {
      Alert.alert('Audio Recording', 'Voice recording requires a native device (iOS or Android).');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      stopPulse();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRecordingTime(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      setIsRecording(true);
      startPulse();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setRecordingTime(0);
      intervalRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }
  }, [isRecording, startPulse, stopPulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.headerTitle, { color: colors.text }]}>Voice</Text>
      <Text style={[styles.headerSub, { color: colors.textSecondary }]}>Narrate scenes or use quick-fire preset lines.</Text>

      {/* Record button */}
      <View style={styles.recordSection}>
        <Animated.View style={[styles.recordOuter, { borderColor: isRecording ? '#f07070' : colors.border }, pulseStyle]}>
          <TouchableOpacity
            style={[styles.recordInner, { backgroundColor: isRecording ? '#f07070' : colors.primary }]}
            onPress={handleRecord}
            activeOpacity={0.8}
          >
            <Feather name={isRecording ? 'square' : 'mic'} size={28} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
        {isRecording ? (
          <Text style={[styles.recordTime, { color: '#f07070' }]}>{formatTime(recordingTime)}</Text>
        ) : (
          <Text style={[styles.recordHint, { color: colors.textSecondary }]}>Hold to narrate</Text>
        )}
      </View>

      {/* Preset lines */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NARRATOR LINES</Text>
      <View style={styles.presetList}>
        {PRESET_LINES.map((line) => (
          <TouchableOpacity
            key={line.id}
            style={[styles.presetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (Platform.OS === 'web') {
                Alert.alert(line.label, line.text);
              } else {
                Alert.alert(line.label, line.text, [{ text: 'OK' }]);
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.presetContent}>
              <Text style={[styles.presetLabel, { color: colors.primary }]}>{line.label}</Text>
              <Text style={[styles.presetText, { color: colors.textSecondary }]} numberOfLines={2}>{line.text}</Text>
            </View>
            <Feather name="play" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Tip */}
      <View style={[styles.tipBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="info" size={14} color={colors.mutedForeground} />
        <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
          Tap a preset to read the narration. Use the record button to capture live narration for playback.
          Full audio routing requires native build.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 32 },
  recordSection: { alignItems: 'center', marginBottom: 36 },
  recordOuter: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  recordInner: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  recordTime: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  recordHint: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginBottom: 10 },
  presetList: { gap: 8, marginBottom: 24 },
  presetCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1,
  },
  presetContent: { flex: 1 },
  presetLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  presetText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  tipBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  tipText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
});
