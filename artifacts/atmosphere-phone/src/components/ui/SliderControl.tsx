import React, { useCallback } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onValueChange: (v: number) => void;
  onSlidingComplete?: (v: number) => void;
  formatValue?: (v: number) => string;
  color?: string;
}

export function SliderControl({ label, value, min = 0, max = 1, onValueChange, onSlidingComplete, formatValue, color }: Props) {
  const colors = useColors();
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const trackRef = React.useRef<View>(null);
  const trackWidthRef = React.useRef(1);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const v = Math.max(min, Math.min(max, min + (x / trackWidthRef.current) * (max - min)));
        onValueChange(v);
      },
      onPanResponderMove: (e, gs) => {
        const x = Math.max(0, Math.min(trackWidthRef.current, e.nativeEvent.locationX));
        const v = Math.max(min, Math.min(max, min + (x / trackWidthRef.current) * (max - min)));
        onValueChange(v);
      },
      onPanResponderRelease: (e) => {
        const x = Math.max(0, Math.min(trackWidthRef.current, e.nativeEvent.locationX));
        const v = Math.max(min, Math.min(max, min + (x / trackWidthRef.current) * (max - min)));
        onSlidingComplete?.(v);
      },
    })
  ).current;

  const accentColor = color || colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.textSecondary }]}>
          {formatValue ? formatValue(value) : Math.round(value * 100) + '%'}
        </Text>
      </View>
      <View
        ref={trackRef}
        style={[styles.track, { backgroundColor: colors.surfaceElevated || colors.border }]}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: accentColor }]} />
        <View style={[styles.thumb, { left: `${pct * 100}%`, backgroundColor: accentColor, shadowColor: accentColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  value: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  track: {
    height: 4, borderRadius: 2, position: 'relative', justifyContent: 'center',
  },
  fill: {
    position: 'absolute', left: 0, top: 0, height: 4, borderRadius: 2,
  },
  thumb: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9,
    marginLeft: -9, top: -7, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4,
  },
});
