import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, interpolateColor, useDerivedValue, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { Phase, Theme } from '../../types';
import { PHASE_GRADIENT_COLORS, THEME_GRADIENT_TINTS } from '../../themes.config';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  phase: Phase;
  theme: Theme;
  intensity: number;
}

// Blend two hex colors
function blendHex(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`;
}

function getGradientColors(phase: Phase, theme: Theme): [string, string, string] {
  const base = PHASE_GRADIENT_COLORS[phase];
  const tint = THEME_GRADIENT_TINTS[theme];
  return base.map(c => blendHex(c, tint, 0.25)) as [string, string, string];
}

// Star component for night phase
function Star({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: delay }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: '#ffffff' }, style]} />
  );
}

// Particle for daytime (bird/mote)
function FloatingMote({ x, y, color, duration }: { x: number; y: number; color: string; duration: number }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-30, { duration: duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: duration * 0.5 }),
        withTiming(0.3, { duration: duration * 0.5 }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }], opacity: opacity.value }));

  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }, style]} />
  );
}

// Pulse ring for mystical/cosmic
function PulseRing({ cx, cy, maxR, color, duration }: { cx: number; cy: number; maxR: number; color: string; duration: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.cubic) }), -1, false);
    opacity.value = withRepeat(
      withSequence(withTiming(0.6, { duration: duration * 0.2 }), withTiming(0, { duration: duration * 0.8 })),
      -1, false,
    );
  }, [duration]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
    borderColor: color,
  }));

  return (
    <Animated.View style={[{
      position: 'absolute',
      left: cx - maxR, top: cy - maxR,
      width: maxR * 2, height: maxR * 2,
      borderRadius: maxR, borderWidth: 1.5,
    }, style]} />
  );
}

// Ember for campfire/evening
function Ember({ startX, startY }: { startX: number; startY: number }) {
  const x = useSharedValue(startX);
  const y = useSharedValue(startY);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 60;
    const dur = 3000 + Math.random() * 3000;
    x.value = withRepeat(withSequence(withTiming(startX + drift, { duration: dur }), withTiming(startX, { duration: dur })), -1, false);
    y.value = withRepeat(withTiming(startY - 200 - Math.random() * 100, { duration: dur * 1.5 }), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: dur })), -1, false);
  }, []);

  const style = useAnimatedStyle(() => ({
    left: x.value, top: y.value, opacity: opacity.value,
  }));

  return <Animated.View style={[{ position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#ffaa40' }, style]} />;
}

// Mist layer
function MistLayer({ y, opacity: initOpacity }: { y: number; opacity: number }) {
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(withTiming(W * 0.3, { duration: 15000, easing: Easing.inOut(Easing.sin) }), withTiming(-W * 0.3, { duration: 15000, easing: Easing.inOut(Easing.sin) })),
      -1, false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <Animated.View style={[{ position: 'absolute', top: y, left: -W * 0.5, width: W * 2, height: 80, opacity: initOpacity }, style]}>
      <LinearGradient colors={['transparent', 'rgba(200,180,220,0.15)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const STARS = Array.from({ length: 60 }, (_, i) => ({
  x: (i * 73.7) % W, y: (i * 43.1) % (H * 0.7),
  size: Math.random() * 2.5 + 0.5, delay: (i * 317) % 3000,
}));

const MOTES = Array.from({ length: 15 }, (_, i) => ({
  x: (i * 67.3) % W, y: H * 0.2 + (i * 41.7) % (H * 0.5),
  color: ['#ffe080', '#fff0a0', '#a0d0ff'][i % 3],
  duration: 2000 + (i * 317) % 3000,
}));

const EMBERS = Array.from({ length: 12 }, (_, i) => ({
  x: W * 0.3 + (i * 47.3) % (W * 0.4),
  y: H * 0.7 + (i * 31.1) % (H * 0.2),
}));

export function PhaseRenderer({ phase, theme, intensity }: Props) {
  const gradColors = getGradientColors(phase, theme);

  const renderOverlay = () => {
    switch (phase) {
      case 'night':
        return (
          <>
            {STARS.map((s, i) => <Star key={i} {...s} />)}
            {/* Moon */}
            <View style={{ position: 'absolute', top: H * 0.08, right: W * 0.15, width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0f0c0', shadowColor: '#f0f0c0', shadowRadius: 20, shadowOpacity: 0.6, elevation: 8 }} />
          </>
        );
      case 'daytime':
        return (
          <>
            {MOTES.map((m, i) => <FloatingMote key={i} {...m} />)}
            {/* Sun glow */}
            <View style={{ position: 'absolute', top: H * 0.06, left: W * 0.15, width: 70, height: 70, borderRadius: 35, backgroundColor: '#ffe060', shadowColor: '#ffe060', shadowRadius: 30, shadowOpacity: 0.7, elevation: 8 }} />
          </>
        );
      case 'evening':
        return (
          <>
            {EMBERS.map((e, i) => <Ember key={i} startX={e.x} startY={e.y} />)}
            {/* Setting sun */}
            <View style={{ position: 'absolute', bottom: H * 0.28, left: W / 2 - 40, width: 80, height: 80, borderRadius: 40, backgroundColor: '#ff6020', shadowColor: '#ff6020', shadowRadius: 40, shadowOpacity: 0.5, elevation: 8 }} />
          </>
        );
      case 'dawn':
        return (
          <>
            <MistLayer y={H * 0.4} opacity={0.7} />
            <MistLayer y={H * 0.55} opacity={0.5} />
            <MistLayer y={H * 0.65} opacity={0.4} />
            {/* Dawn glow */}
            <View style={{ position: 'absolute', bottom: H * 0.15, left: W / 2 - 60, width: 120, height: 120, borderRadius: 60, backgroundColor: '#f070a0', shadowColor: '#f070a0', shadowRadius: 50, shadowOpacity: 0.4, elevation: 8 }} />
          </>
        );
    }
  };

  // Mystical overlay for specific themes
  const renderThemeOverlay = () => {
    if (theme === 'mystical' || theme === 'cosmic' || theme === 'underwater') {
      return (
        <>
          <PulseRing cx={W * 0.5} cy={H * 0.5} maxR={W * 0.6} color="rgba(180,120,255,0.3)" duration={4000} />
          <PulseRing cx={W * 0.5} cy={H * 0.5} maxR={W * 0.4} color="rgba(120,160,255,0.25)" duration={6000} />
        </>
      );
    }
    return null;
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      {/* Intensity overlay */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${(1 - intensity) * 0.4})` }]} />
      {renderOverlay()}
      {renderThemeOverlay()}
    </View>
  );
}
