import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Platform, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

const TAB_COLOR = '#7aa8f0';
const INACTIVE = '#6a7a90';
const BG = '#080c18';

export default function ControllerLayout() {
  const isIOS = Platform.OS === 'ios';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_COLOR,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : BG,
          borderTopWidth: 0,
          borderTopColor: '#28354a',
          elevation: 0,
          ...(Platform.OS === 'web' ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: BG, borderTopWidth: 1, borderTopColor: '#28354a' }]} />
          ),
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Atmosphere',
          tabBarIcon: ({ color }) => <Feather name="wind" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sounds"
        options={{
          title: 'Sounds',
          tabBarIcon: ({ color }) => <Feather name="music" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="voice"
        options={{
          title: 'Voice',
          tabBarIcon: ({ color }) => <Feather name="mic" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
