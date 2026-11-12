import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, Platform } from 'react-native';
import { Home, ClipboardList, FileText, ShieldAlert } from 'lucide-react-native';

import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Colors.dark : Colors.light;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.card,
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
          color: theme.text,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: Platform.select({ ios: 88, default: 68 }),
          paddingBottom: Platform.select({ ios: 28, default: 10 }),
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerTitle: "Sanad — Men's Health",
          tabBarIcon: ({ color, size }) => <Home size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="intake"
        options={{
          title: 'Assessment',
          tabBarLabel: 'Assessment',
          headerTitle: 'Screening Intake',
          tabBarIcon: ({ color, size }) => <ClipboardList size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarLabel: 'Results',
          headerTitle: 'Report & Guidance',
          tabBarIcon: ({ color, size }) => <FileText size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: 'Emergency',
          tabBarLabel: 'Emergency',
          headerTitle: '24/7 Medical Safety',
          tabBarIcon: ({ color, size }) => <ShieldAlert size={size || 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
