import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { ArrowLeft, Search } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

interface LoadingViewProps {
  mode?: 'illustrated' | 'skeleton';
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  categories?: string[];
  activeCategory?: string;
  onBack?: () => void;
  showBack?: boolean;
}

export function LoadingView({
  mode = 'illustrated',
  title = 'Analyzing Health Indicators...',
  subtitle = 'Evaluated against WHO 2021 Reference Standards, Just for You',
  searchPlaceholder = 'Search a Specialist or Lab...',
  categories = ['Latest', 'Marketing', 'Design', 'Lifestyle'],
  activeCategory = 'Latest',
  onBack,
  showBack = true,
}: LoadingViewProps) {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  // Floating bob animation for the star illustration
  const floatAnim = useRef(new Animated.Value(0)).current;
  // Shimmer pulse animation for skeletons
  const shimmerAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    // Floating star animation (smooth bobbing)
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();

    // Shimmer pulse animation for skeletons
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    return () => {
      floatLoop.stop();
      shimmerLoop.stop();
    };
  }, [floatAnim, shimmerAnim]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  // ══════════════════════════════════════════════════════════════
  // SCREEN A: Illustrated Loading State (Pedestal + Floating Star)
  // ══════════════════════════════════════════════════════════════
  if (mode === 'illustrated') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Top Header Row with Back Button */}
        {showBack && (
          <View style={styles.headerRow}>
            <Pressable
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
              onPress={handleBack}
            >
              <ArrowLeft size={22} color={theme.text} />
            </Pressable>
          </View>
        )}

        {/* Center Visual Content */}
        <View style={styles.centerIllustrationContainer}>
          {/* Animated 3-Tiered Pedestal with Floating Star */}
          <View style={styles.svgWrapper}>
            <Animated.View
              style={[
                styles.floatingStarWrapper,
                { transform: [{ translateY: floatAnim }] },
              ]}
            >
              <Svg width={96} height={96} viewBox="0 0 100 100">
                {/* 5-Pointed Rounded Friendly Star matching reference image */}
                <Path
                  d="M50 12
                     C51.5 12 53 13 53.8 14.5
                     L62.4 32.5
                     L81.8 35.2
                     C84.5 35.6 85.6 38.9 83.6 40.8
                     L69.5 54.3
                     L73 73.5
                     C73.5 76.2 70.6 78.3 68.2 76.9
                     L50.8 67.5
                     L33.4 76.9
                     C31 78.3 28.1 76.2 28.6 73.5
                     L32.1 54.3
                     L18 40.8
                     C16 38.9 17.1 35.6 19.8 35.2
                     L39.2 32.5
                     L47.8 14.5
                     C48.6 13 50.1 12 50 12
                     Z"
                  fill="#5B9CF6"
                  stroke="#4080E8"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </Svg>
            </Animated.View>

            {/* 3-Tiered Pedestal Base matching reference image */}
            <Svg width={180} height={84} viewBox="0 0 180 84">
              {/* Step 1 (Top Tier - Soft Ice Blue) */}
              <Rect x="44" y="6" width="92" height="20" rx="7" fill="#D4E6FE" />
              <Rect x="66" y="6" width="48" height="20" fill="#BFDBFE" opacity={0.6} />

              {/* Step 2 (Middle Tier - Medium Periwinkle) */}
              <Rect x="26" y="30" width="128" height="22" rx="8" fill="#93C5FD" />
              <Rect x="52" y="30" width="76" height="22" fill="#60A5FA" opacity={0.5} />

              {/* Step 3 (Bottom Tier Base - Vibrant Solid Blue) */}
              <Rect x="10" y="56" width="160" height="24" rx="9" fill="#0066EE" />
              <Rect x="38" y="56" width="104" height="24" fill="#0050D0" opacity={0.3} />
            </Svg>
          </View>

          {/* Heading Title */}
          <Text style={[styles.illustratedTitle, { color: theme.text }]}>
            {title}
          </Text>

          {/* Reassuring Subtitle */}
          <Text style={[styles.illustratedSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SCREEN B: Skeleton Shimmer Loading State (Search + Category + Cards)
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search Bar Skeleton matching reference image */}
      <View style={styles.skeletonHeader}>
        <View
          style={[
            styles.searchBarSkeleton,
            { backgroundColor: scheme === 'dark' ? theme.card : '#F8FAFC', borderColor: theme.border },
          ]}
        >
          <Search size={18} color="#94A3B8" style={styles.searchIcon} />
          <Text style={[styles.searchPlaceholder, { color: '#94A3B8' }]}>
            {searchPlaceholder}
          </Text>
        </View>

        {/* Filter Category Chips Skeleton */}
        <View style={styles.filterRow}>
          {categories.map((cat, idx) => {
            const isActive = cat === activeCategory || idx === 0;
            return (
              <View
                key={cat}
                style={[
                  styles.filterChip,
                  isActive
                    ? { backgroundColor: '#E0EDFF' }
                    : {
                        backgroundColor: scheme === 'dark' ? theme.card : 'transparent',
                        borderColor: 'transparent',
                      },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isActive ? '#0066EE' : theme.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  {cat}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Repeating Shimmer Skeleton Rows matching reference image */}
      <View style={styles.skeletonList}>
        {[1, 2, 3, 4, 5].map((item) => (
          <Animated.View
            key={item}
            style={[
              styles.skeletonCard,
              { opacity: shimmerAnim },
            ]}
          >
            {/* Circular Avatar Skeleton */}
            <View
              style={[
                styles.skeletonCircle,
                { backgroundColor: scheme === 'dark' ? '#1E293B' : '#E2E8F0' },
              ]}
            />

            {/* Dual Line Bars */}
            <View style={styles.skeletonLinesCol}>
              <View
                style={[
                  styles.skeletonLineShort,
                  { backgroundColor: scheme === 'dark' ? '#1E293B' : '#E2E8F0' },
                ]}
              />
              <View
                style={[
                  styles.skeletonLineLong,
                  { backgroundColor: scheme === 'dark' ? '#1E293B' : '#E2E8F0' },
                ]}
              />
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  headerRow: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerIllustrationContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    position: 'relative',
    height: 160,
  },
  floatingStarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -16,
    zIndex: 2,
  },
  illustratedTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  illustratedSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  // Skeleton Screen Styles
  skeletonHeader: {
    paddingTop: 16,
    marginBottom: 20,
  },
  searchBarSkeleton: {
    height: 46,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchPlaceholder: {
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  filterChipText: {
    fontSize: 12,
  },
  skeletonList: {
    gap: 16,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 14,
  },
  skeletonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  skeletonLinesCol: {
    flex: 1,
    gap: 8,
  },
  skeletonLineShort: {
    width: '45%',
    height: 14,
    borderRadius: 7,
  },
  skeletonLineLong: {
    width: '85%',
    height: 12,
    borderRadius: 6,
  },
});
