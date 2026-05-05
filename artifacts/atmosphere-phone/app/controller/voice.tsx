import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useNetwork } from '@/src/context/NetworkContext';

// expo-audio is the SDK 54 replacement for the deprecated expo-av
let AudioModule: typeof import('expo-audio') | null = null;
if (Platform.OS !== 'web') {
  try { AudioModule = require('expo-audio'); } catch {}
}

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
  const { sendMessage, status } = useNetwork();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const recorderRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useSharedValue(1);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  // Request microphone permission
  useEffect(() => {
    if (Platform.OS === 'web' || !AudioModule) return;
    AudioModule.requestRecordingPermissionsAsync().then(({ status: s }) => {
      setPermissionStatus(s === 'granted' ? 'granted' : 'denied');
    }).catch(() => setPermissionStatus('denied'));
    return () => {
      if (recorderRef.current) {
        try { recorderRef.current.stopAndUnloadAsync?.(); } catch {}
      }
    };
  }, []);

  const startPulse = useCallback(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.value = withTiming(1, { duration: 200 });
  }, [pulseAnim]);

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web' || !AudioModule) {
      Alert.alert('Native Only', 'Voice recording requires a standalone app build (iOS or Android).');
      return;
    }
    if (permissionStatus === 'denied') {
      const { status: s } = await AudioModule.requestRecordingPermissionsAsync();
      if (s !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record voice narration.');
        return;
      }
      setPermissionStatus('granted');
    }

    try {
      // expo-audio uses AudioRecorder class
      const recorder = new AudioModule.AudioRecorder(AudioModule.RecordingPresets.HIGH_QUALITY);
      recorderRef.current = recorder;
      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      setRecordingTime(0);
      startPulse();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      intervalRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Recording Error', 'Could not start microphone recording. Make sure microphone permission is granted.');
    }
  }, [permissionStatus, startPulse]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    setIsRecording(false);
    stopPulse();
    if (intervalRef.current) clearInterval(intervalRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await recorder.stop();
      const uri = recorder.uri;
      recorderRef.current = null;

      if (uri && status === 'connected') {
        // Read file and send as base64 over WebSocket to presentation phone
        const response = await fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          if (base64) {
            sendMessage({
              type: 'CMD_VOICE_DATA',
              data: base64,
              mimeType: 'audio/m4a',
            });
            setLastSentAt(new Date());
          }
        };
        reader.readAsDataURL(blob);
      } else if (!status || status !== 'connected') {
        Alert.alert('Not Connected', 'Connect to the relay server to send voice to the Presentation phone.');
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  }, [stopPulse, sendMessage, status]);

  const handleRecordPress = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const isWebOrNoAudio = Platform.OS === 'web' || !AudioModule;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.headerTitle, { color: colors.text }]}>Voice</Text>
      <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
        Narrate scenes live or fire off preset narrator lines.
      </Text>

      {/* Record button */}
      <View style={styles.recordSection}>
        <Animated.View style={[
          styles.recordOuter,
          { borderColor: isRecording ? '#f07070' : colors.border },
          pulseStyle,
        ]}>
          <TouchableOpacity
            style={[styles.recordInner, {
              backgroundColor: isRecording ? '#f07070'
                : isWebOrNoAudio ? colors.muted
                : colors.primary,
            }]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
          >
            <Feather name={isRecording ? 'square' : 'mic'} size={28} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {isRecording ? (
          <>
            <Text style={[styles.recordTime, { color: '#f07070' }]}>{formatTime(recordingTime)}</Text>
            <Text style={[styles.recordHint, { color: '#f07070' }]}>Recording — tap to send to Presentation</Text>
          </>
        ) : isWebOrNoAudio ? (
          <Text style={[styles.recordHint, { color: colors.textSecondary }]}>
            Voice recording requires a native build (EAS Build)
          </Text>
        ) : permissionStatus === 'denied' ? (
          <Text style={[styles.recordHint, { color: '#f07070' }]}>
            Microphone permission denied — check device settings
          </Text>
        ) : (
          <Text style={[styles.recordHint, { color: colors.textSecondary }]}>
            Tap to start narrating
          </Text>
        )}

        {lastSentAt && !isRecording && (
          <Text style={[styles.sentBadge, { color: '#60d890' }]}>
            ✓ Clip sent at {lastSentAt.toLocaleTimeString()}
          </Text>
        )}

        {/* Connection status */}
        <View style={[styles.connRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.connDot, { backgroundColor: status === 'connected' ? '#60d890' : '#f07070' }]} />
          <Text style={[styles.connText, { color: colors.textSecondary }]}>
            {status === 'connected'
              ? 'Audio will play on Presentation phone'
              : 'Not connected — enter relay URL on the Atmosphere tab'}
          </Text>
        </View>
      </View>

      {/* Preset narrator lines */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NARRATOR LINES</Text>
      <View style={styles.presetList}>
        {PRESET_LINES.map((line) => (
          <TouchableOpacity
            key={line.id}
            style={[styles.presetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert(line.label, `"${line.text}"\n\nRead this aloud.`, [{ text: 'Got it' }]);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.presetContent}>
              <Text style={[styles.presetLabel, { color: colors.primary }]}>{line.label}</Text>
              <Text style={[styles.presetText, { color: colors.textSecondary }]} numberOfLines={2}>
                {line.text}
              </Text>
            </View>
            <Feather name="book-open" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Info tip */}
      <View style={[styles.tipBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="info" size={14} color={colors.mutedForeground} />
        <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
          Hold the mic button to record live narration. When you release, the clip is sent over WiFi to the
          Presentation phone and plays automatically. Preset lines are prompts for you to read aloud during play.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 32 },
  recordSection: { alignItems: 'center', marginBottom: 36, gap: 12 },
  recordOuter: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  recordInner: {
    width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center',
  },
  recordTime: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  recordHint: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 20 },
  sentBadge: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  connRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, maxWidth: '100%',
  },
  connDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  connText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
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
