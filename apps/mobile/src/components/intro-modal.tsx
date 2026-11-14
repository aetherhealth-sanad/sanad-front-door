import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  useColorScheme,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import {
  ShieldCheck,
  ArrowRight,
  Sparkles,
  HeartPulse,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

const { width } = Dimensions.get('window');

interface IntroModalProps {
  visible: boolean;
  onClose: () => void;
}

const SLIDES = [
  {
    id: 'welcome',
    image: require('@/assets/images/medical_hero_3d.jpg'),
    badge: 'PRIVATE & EVIDENCE-BASED',
    title: 'A New Standard in Men’s Health',
    description:
      'Sanad provides a discreet, judgment-free gateway to understand your reproductive wellness, biological timelines, and clinical options.',
  },
  {
    id: 'privacy',
    image: require('@/assets/images/medical_shield_3d.jpg'),
    badge: 'ZERO IDENTIFIERS STORED',
    title: '100% Confidential by Design',
    description:
      'No names, phone numbers, or account registrations required. Your session is temporary and can be erased instantly at any time.',
  },
  {
    id: 'clinical',
    image: require('@/assets/images/real_doctor_consultation.jpg'),
    badge: 'WHO 2021 BENCHMARKS',
    title: 'Science, Not Guesses',
    description:
      'Receive structured guidance aligned with international andrology manuals to prepare you for informed discussions with clinical specialists.',
  },
];

export function IntroModal({ visible, onClose }: IntroModalProps) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const [isLoading, setIsLoading] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleNext = () => {
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const currentSlide = SLIDES[slideIndex];

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {isLoading ? (
          // Initial Loading Splash Phase
          <View style={styles.loadingScreen}>
            <View style={[styles.pulseIconBox, { backgroundColor: theme.primaryLight }]}>
              <HeartPulse size={48} color={theme.primary} />
            </View>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>Sanad Health</Text>
            <Text style={[styles.loadingSub, { color: theme.textSecondary }]}>
              Initializing encrypted private session...
            </Text>
            <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 24 }} />
          </View>
        ) : (
          // Onboarding Introduction Slides
          <View style={styles.content}>
            {/* Top Bar with Skip */}
            <View style={styles.topBar}>
              <View style={[styles.miniBadge, { backgroundColor: theme.backgroundElement }]}>
                <Sparkles size={12} color={theme.primary} />
                <Text style={[styles.miniBadgeText, { color: theme.primary }]}>
                  {currentSlide.badge}
                </Text>
              </View>

              <Pressable onPress={onClose} style={styles.skipButton}>
                <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
              </Pressable>
            </View>

            {/* Slide Hero Image */}
            <View style={[styles.imageWrapper, { borderColor: theme.border }]}>
              <Image
                source={currentSlide.image}
                style={styles.slideImage}
                resizeMode="cover"
              />
            </View>

            {/* Text Information */}
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: theme.text }]}>{currentSlide.title}</Text>
              <Text style={[styles.desc, { color: theme.textSecondary }]}>
                {currentSlide.description}
              </Text>
            </View>

            {/* Dots Indicator & Navigation */}
            <View style={styles.footer}>
              <View style={styles.dotsRow}>
                {SLIDES.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === slideIndex ? theme.primary : theme.border,
                        width: i === slideIndex ? 22 : 7,
                      },
                    ]}
                  />
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.nextButton,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
                ]}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>
                  {slideIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
                </Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  pulseIconBox: {
    width: 88,
    height: 88,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  loadingSub: {
    fontSize: 14,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 54,
    paddingBottom: Spacing.xxl,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    gap: 6,
  },
  miniBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipButton: {
    padding: 6,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imageWrapper: {
    width: '100%',
    height: width * 0.72,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    marginVertical: Spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
    marginBottom: Spacing.sm,
  },
  desc: {
    fontSize: 15,
    lineHeight: 23,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  nextButton: {
    height: 52,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
