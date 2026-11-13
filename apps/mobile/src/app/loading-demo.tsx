import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LoadingView } from '@/components/loading-view';
import { Colors } from '@/constants/theme';

export default function LoadingDemoScreen() {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<'illustrated' | 'skeleton'>('illustrated');

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Demo Mode Switcher Bar */}
      <View style={styles.switcherBar}>
        <Pressable
          style={[
            styles.modeButton,
            activeMode === 'illustrated' && styles.modeButtonActive,
          ]}
          onPress={() => setActiveMode('illustrated')}
        >
          <Text
            style={[
              styles.modeButtonText,
              activeMode === 'illustrated' && styles.modeButtonTextActive,
            ]}
          >
            Screen A (Star Pedestal)
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.modeButton,
            activeMode === 'skeleton' && styles.modeButtonActive,
          ]}
          onPress={() => setActiveMode('skeleton')}
        >
          <Text
            style={[
              styles.modeButtonText,
              activeMode === 'skeleton' && styles.modeButtonTextActive,
            ]}
          >
            Screen B (Skeleton Shimmer)
          </Text>
        </Pressable>
      </View>

      {/* Render the selected loading view */}
      {activeMode === 'illustrated' ? (
        <LoadingView
          mode="illustrated"
          title="Finding Newsletters..."
          subtitle="Curated Newsletters, Just for You"
          onBack={() => router.back()}
        />
      ) : (
        <LoadingView
          mode="skeleton"
          searchPlaceholder="Search a Newsletter"
          categories={['Latest', 'Marketing', 'Design', 'Lifestyle']}
          activeCategory="Latest"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  switcherBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modeButtonActive: {
    backgroundColor: '#0066EE',
    borderColor: '#0066EE',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
});
