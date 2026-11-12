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
    // Hide splash screen after initialization
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
          title: 'Trang chủ',
          tabBarLabel: 'Trang chủ',
          headerTitle: 'Sanad - Sức khỏe Nam giới',
          tabBarIcon: ({ color, size }) => <Home size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="intake"
        options={{
          title: 'Đánh giá',
          tabBarLabel: 'Đánh giá',
          headerTitle: 'Khảo sát Sàng lọc',
          tabBarIcon: ({ color, size }) => <ClipboardList size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Kết quả',
          tabBarLabel: 'Kết quả',
          headerTitle: 'Báo cáo & Hướng dẫn',
          tabBarIcon: ({ color, size }) => <FileText size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: 'Khẩn cấp',
          tabBarLabel: 'Khẩn cấp',
          headerTitle: 'Hỗ trợ Y tế 24/7',
          tabBarIcon: ({ color, size }) => <ShieldAlert size={size || 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
