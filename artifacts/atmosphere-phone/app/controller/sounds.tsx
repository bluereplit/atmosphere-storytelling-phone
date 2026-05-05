import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAtmosphere } from '@/src/context/StateContext';
import { SliderControl } from '@/src/components/ui/SliderControl';
import { ATTRIBUTE_LABELS, ATTRIBUTE_CATEGORIES } from '@/src/themes.config';
import type { AttributeName } from '@/src/types';
import { useColors } from '@/hooks/useColors';

const CATEGORY_ICONS: Record<string, string> = {
  Nature: 'cloud', Water: 'droplet', Wildlife: 'feather',
  Fire: 'zap', Urban: 'map', Mystical: 'star', Dramatic: 'activity',
};

export default function SoundsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, toggleAttribute, setAttributeVolume } = useAtmosphere();
  const [expandedCat, setExpandedCat] = useState<string | null>('Nature');
  const [expandedAttr, setExpandedAttr] = useState<AttributeName | null>(null);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  const toggleCat = (cat: string) => setExpandedCat(v => v === cat ? null : cat);
  const toggleAttrExpand = (name: AttributeName) => setExpandedAttr(v => v === name ? null : name);

  const handleToggle = useCallback((name: AttributeName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleAttribute(name);
  }, [toggleAttribute]);

  const enabledCount = Object.values(state.attributes).filter(a => a.enabled).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Sounds</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primaryMuted || colors.muted }]}>
          <Text style={[styles.countText, { color: colors.primary }]}>{enabledCount} active</Text>
        </View>
      </View>

      {Object.entries(ATTRIBUTE_CATEGORIES).map(([cat, attrs]) => {
        const isOpen = expandedCat === cat;
        const activeInCat = attrs.filter(n => state.attributes[n]?.enabled).length;

        return (
          <View key={cat} style={[styles.categoryBlock, { borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.catHeader, { backgroundColor: isOpen ? colors.surfaceElevated || colors.surface : colors.surface }]}
              onPress={() => toggleCat(cat)}
              activeOpacity={0.8}
            >
              <View style={styles.catLeft}>
                <Feather name={CATEGORY_ICONS[cat] as any} size={16} color={isOpen ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.catTitle, { color: isOpen ? colors.text : colors.textSecondary }]}>{cat}</Text>
                {activeInCat > 0 && (
                  <View style={[styles.activeBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.activeBadgeText}>{activeInCat}</Text>
                  </View>
                )}
              </View>
              <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            {isOpen && (
              <View style={[styles.attrList, { backgroundColor: colors.surface }]}>
                {attrs.map((name) => {
                  const attr = state.attributes[name];
                  const isEnabled = attr?.enabled ?? false;
                  const isExpanded = expandedAttr === name;

                  return (
                    <View key={name}>
                      <TouchableOpacity
                        style={[styles.attrRow, { borderColor: colors.borderSubtle || colors.border }]}
                        onPress={() => handleToggle(name)}
                        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleAttrExpand(name); }}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.attrToggle, {
                          backgroundColor: isEnabled ? colors.primary : 'transparent',
                          borderColor: isEnabled ? colors.primary : colors.border,
                        }]}>
                          {isEnabled && <Feather name="check" size={10} color={colors.background} />}
                        </View>
                        <Text style={[styles.attrName, { color: isEnabled ? colors.text : colors.textSecondary }]}>
                          {ATTRIBUTE_LABELS[name]}
                        </Text>
                        {isEnabled && (
                          <View style={[styles.volBar, { backgroundColor: colors.border }]}>
                            <View style={[styles.volFill, { width: `${(attr?.volume ?? 0.7) * 100}%`, backgroundColor: colors.primary }]} />
                          </View>
                        )}
                        <TouchableOpacity style={styles.expandBtn} onPress={() => toggleAttrExpand(name)}>
                          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={[styles.attrDetail, { backgroundColor: colors.surfaceElevated || colors.muted, borderColor: colors.borderSubtle || colors.border }]}>
                          <SliderControl
                            label="Volume"
                            value={attr?.volume ?? 0.7}
                            onValueChange={(v) => setAttributeVolume(name, v)}
                            color={colors.primary}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  categoryBlock: { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  activeBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  activeBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  attrList: { paddingHorizontal: 14, paddingBottom: 6 },
  attrRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10,
    borderBottomWidth: 1,
  },
  attrToggle: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  attrName: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  volBar: { width: 40, height: 3, borderRadius: 2 },
  volFill: { height: 3, borderRadius: 2 },
  expandBtn: { padding: 4 },
  attrDetail: { paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4, borderRadius: 8, borderWidth: 1 },
});
