import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ShieldCheck,
  Clock,
  Lock,
  ArrowRight,
  AlertTriangle,
  HeartPulse,
  Sparkles,
  RotateCcw,
  Compass,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService } from '@/services/api';
import { IntroModal } from '@/components/intro-modal';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const [session, setSession] = useState(ApiService.getCurrentSession());
  const [loading, setLoading] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);

  const handleStartAssessment = async () => {
    setLoading(true);
    try {
      const newSession = await ApiService.startSession();
      setSession(newSession);
      router.push('/intake');
    } catch {
      Alert.alert('Error', 'Unable to initialize a new session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSession = () => {
    Alert.alert(
      'Purge Session Data',
      'Are you sure you want to delete all local answers and start over fresh?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purge Now',
          style: 'destructive',
          onPress: () => {
            ApiService.clearSession();
            setSession(null);
            Alert.alert('Purged', 'All local session answers have been erased.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Onboarding Introduction Modal */}
      <IntroModal visible={introVisible} onClose={() => setIntroVisible(false)} />

      {/* Top Header Row with Mock Badge & Intro Tour Trigger */}
      <View style={styles.topHeaderRow}>
        <View style={[styles.mockBadge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.mockDot} />
          <Text style={[styles.mockBadgeText, { color: theme.textSecondary }]}>
            RESEARCH PROTOTYPE (MOCK DATA)
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.tourButton,
            { backgroundColor: theme.primaryLight, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => setIntroVisible(true)}
        >
          <Compass size={14} color={theme.primary} />
          <Text style={[styles.tourButtonText, { color: theme.primaryDark }]}>Intro Tour</Text>
        </Pressable>
      </View>

      {/* Main Hero Card with Visual Header */}
      <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Visual Banner from Web Assets */}
        <View style={styles.heroImageWrapper}>
          <Image
            source={require('@/assets/images/medical_hero_3d.jpg')}
            style={styles.heroBannerImage}
            resizeMode="cover"
          />
          <View style={styles.heroOverlayBadge}>
            <HeartPulse size={16} color="#FFFFFF" />
            <Text style={styles.heroOverlayBadgeText}>Confidential Front Door</Text>
          </View>
        </View>

        <View style={styles.heroBody}>
          <Text style={[styles.heroTitle, { color: theme.text }]}>
            Men's Reproductive Health Screening
          </Text>

          <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            A discreet, evidence-grounded assessment to help you understand personal health signals, thermal exposures, and guided clinical recommendations.
          </Text>

          {/* Feature Pills */}
          <View style={styles.pillsContainer}>
            <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
              <ShieldCheck size={14} color={theme.primary} />
              <Text style={[styles.pillText, { color: theme.textSecondary }]}>100% Anonymous</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
              <Clock size={14} color={theme.primary} />
              <Text style={[styles.pillText, { color: theme.textSecondary }]}>3-Minute Flow</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
              <Lock size={14} color={theme.primary} />
              <Text style={[styles.pillText, { color: theme.textSecondary }]}>Ephemeral Session</Text>
            </View>
          </View>

          {/* Action Button */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={handleStartAssessment}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'Starting...' : session ? 'Continue Assessment' : 'Start Assessment'}
            </Text>
            <ArrowRight size={18} color="#FFFFFF" style={styles.buttonIcon} />
          </Pressable>

          {session && (
            <Pressable style={styles.resetButton} onPress={handleResetSession}>
              <RotateCcw size={14} color={theme.textMuted} />
              <Text style={[styles.resetButtonText, { color: theme.textMuted }]}>
                Session: {session.case_id} • Tap to purge
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 3-Step Screening Pathway */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        3-Step Screening Pathway
      </Text>

      <View style={styles.stepsList}>
        <View style={[styles.stepItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            source={require('@/assets/images/medical_lab_3d.jpg')}
            style={styles.stepThumbnail}
            resizeMode="cover"
          />
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>1. Discreet Screening Questions</Text>
            <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
              6 questions covering timeline, thermal habits, lifestyle, and symptoms.
            </Text>
          </View>
        </View>

        <View style={[styles.stepItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            source={require('@/assets/images/real_patient_peace_of_mind.jpg')}
            style={styles.stepThumbnail}
            resizeMode="cover"
          />
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>2. Stratification & Report</Text>
            <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
              Transparent risk stratification mapped against WHO 2021 manual standards.
            </Text>
          </View>
        </View>

        <View style={[styles.stepItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            source={require('@/assets/images/real_doctor_consultation.jpg')}
            style={styles.stepThumbnail}
            resizeMode="cover"
          />
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>3. Next Steps & Consultation</Text>
            <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
              Practical lifestyle measures and guided specialist referral navigation.
            </Text>
          </View>
        </View>
      </View>

      {/* Emergency Notice Card with Urgent Visual */}
      <Pressable
        style={({ pressed }) => [
          styles.emergencyCard,
          {
            backgroundColor: theme.emergencyLight,
            borderColor: theme.emergency,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        onPress={() => router.push('/safety')}
      >
        <View style={styles.emergencyRow}>
          <Image
            source={require('@/assets/images/medical_urgent_care_3d.jpg')}
            style={styles.emergencyThumbnail}
            resizeMode="cover"
          />
          <View style={{ flex: 1 }}>
            <View style={styles.emergencyHeader}>
              <AlertTriangle size={18} color={theme.emergency} />
              <Text style={[styles.emergencyTitle, { color: theme.emergency }]}>
                Experiencing Acute Pain?
              </Text>
            </View>
            <Text style={[styles.emergencyDesc, { color: theme.text }]}>
              Sudden severe testicular pain or trauma requires 24/7 immediate medical care.
            </Text>
            <View style={styles.emergencyLinkRow}>
              <Text style={[styles.emergencyLinkText, { color: theme.emergency }]}>
                View Emergency Hotlines & Red Flags
              </Text>
              <ArrowRight size={14} color={theme.emergency} />
            </View>
          </View>
        </View>
      </Pressable>

      {/* Footer Disclaimer */}
      <View style={styles.footer}>
        <Sparkles size={14} color={theme.textMuted} />
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          Sanad by AetherHealth • Future Health Challenge 2026. This prototype does not provide medical diagnoses or prescriptions.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
  },
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  mockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  mockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E11D48',
    marginRight: 6,
  },
  mockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tourButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    gap: 4,
  },
  tourButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroImageWrapper: {
    width: '100%',
    height: 160,
    position: 'relative',
  },
  heroBannerImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlayBadge: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 6,
  },
  heroOverlayBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  heroBody: {
    padding: Spacing.xl,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing.lg,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    gap: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    height: 52,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonIcon: {
    marginLeft: 8,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    gap: 6,
    paddingVertical: 4,
  },
  resetButtonText: {
    fontSize: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  stepsList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  stepThumbnail: {
    width: 60,
    height: 60,
    borderRadius: Radius.md,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  emergencyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emergencyThumbnail: {
    width: 68,
    height: 68,
    borderRadius: Radius.md,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  emergencyDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  emergencyLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emergencyLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
  },
  footerText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    flex: 1,
  },
});
