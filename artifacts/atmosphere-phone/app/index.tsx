import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function ModePickerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setMode, relayUrl, setRelayUrl } = useApp();
  const router = useRouter();
  const [url, setUrl] = useState(relayUrl);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleMode = async (mode: 'presentation' | 'controller') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode(mode);
    if (url !== relayUrl) setRelayUrl(url);
    if (mode === 'presentation') {
      router.replace('/presentation');
    } else {
      router.replace('/controller');
    }
  };

  return (
    <LinearGradient colors={['#080c18', '#101525', '#182030']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          {/* Logo area */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <LinearGradient colors={['#9070c8', '#4090c8', '#30b0b0']} style={styles.logoGradient} />
              <Feather name="wind" size={36} color="rgba(255,255,255,0.9)" style={styles.logoIcon} />
            </View>
            <Text style={styles.title}>Atmosphere</Text>
            <Text style={styles.subtitle}>Storytelling System</Text>
          </View>

          {/* Mode cards */}
          <View style={styles.cards}>
            <TouchableOpacity style={styles.card} onPress={() => handleMode('presentation')} activeOpacity={0.8}>
              <LinearGradient colors={['#1e2535', '#141928']} style={styles.cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={[styles.cardIcon, { backgroundColor: '#9070c820' }]}>
                  <Feather name="monitor" size={28} color="#9070c8" />
                </View>
                <Text style={styles.cardTitle}>Presentation</Text>
                <Text style={styles.cardDesc}>Full-screen visuals and audio. Place this phone facing your players.</Text>
                <View style={styles.cardArrow}>
                  <Feather name="arrow-right" size={18} color="#9070c8" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} onPress={() => handleMode('controller')} activeOpacity={0.8}>
              <LinearGradient colors={['#1e2535', '#141928']} style={styles.cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={[styles.cardIcon, { backgroundColor: '#7aa8f020' }]}>
                  <Feather name="sliders" size={28} color="#7aa8f0" />
                </View>
                <Text style={styles.cardTitle}>Controller</Text>
                <Text style={styles.cardDesc}>Control phase, theme, sounds, and voice from behind the screen.</Text>
                <View style={styles.cardArrow}>
                  <Feather name="arrow-right" size={18} color="#7aa8f0" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Relay URL config */}
          <TouchableOpacity style={styles.settingsRow} onPress={() => setShowUrlInput(v => !v)}>
            <Feather name="wifi" size={14} color="#6a7a90" />
            <Text style={styles.settingsText}>Relay server URL</Text>
            <Feather name={showUrlInput ? 'chevron-up' : 'chevron-down'} size={14} color="#6a7a90" />
          </TouchableOpacity>

          {showUrlInput && (
            <View style={styles.urlInputWrapper}>
              <TextInput
                style={styles.urlInput}
                value={url}
                onChangeText={setUrl}
                onEndEditing={() => setRelayUrl(url)}
                placeholder="ws://192.168.1.100:3001"
                placeholderTextColor="#6a7a90"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.urlHint}>
                Run relay-server/index.js on any computer on your WiFi network.
                Both phones connect to the same relay URL.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, alignItems: 'center' },
  logoArea: { alignItems: 'center', marginBottom: 48 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50, marginBottom: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#9070c8', shadowRadius: 30, shadowOpacity: 0.5, elevation: 10,
    overflow: 'hidden',
  },
  logoGradient: { ...StyleSheet.absoluteFillObject },
  logoIcon: { position: 'absolute' },
  title: { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#e8edf8', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#a0aec0', marginTop: 4 },
  cards: { width: '100%', gap: 16, marginBottom: 32 },
  card: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowRadius: 20, shadowOpacity: 0.5, elevation: 8 },
  cardGradient: { padding: 24, borderRadius: 20, borderWidth: 1, borderColor: '#28354a' },
  cardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold', color: '#e8edf8', marginBottom: 8 },
  cardDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#a0aec0', lineHeight: 20 },
  cardArrow: { position: 'absolute', right: 24, top: 24 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  settingsText: { fontSize: 13, color: '#6a7a90', fontFamily: 'Inter_400Regular' },
  urlInputWrapper: { width: '100%', marginTop: 8 },
  urlInput: {
    backgroundColor: '#101525', borderWidth: 1, borderColor: '#28354a', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: '#e8edf8', fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  urlHint: { fontSize: 12, color: '#6a7a90', marginTop: 8, lineHeight: 17 },
});
