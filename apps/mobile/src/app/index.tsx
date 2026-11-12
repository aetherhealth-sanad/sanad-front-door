import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Alert,
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
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService } from '@/services/api';

export default function HomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const [session, setSession] = useState(ApiService.getCurrentSession());
  const [loading, setLoading] = useState(false);

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
      {/* Research Prototype Pill */}
      <View style={[styles.mockBadge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.mockDot} />
        <Text style={[styles.mockBadgeText, { color: theme.textSecondary }]}>
          RESEARCH PROTOTYPE (MOCK DATA)
        </Text>
      </View>

      {/* Main Hero Card */}
      <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.heroIconBox, { backgroundColor: theme.primaryLight }]}>
          <HeartPulse size={30} color={theme.primary} />
        </View>

        <Text style={[styles.heroTitle, { color: theme.text }]}>
          Men's Reproductive Health Screening
        </Text>

        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
          A private, evidence-grounded assessment to help you understand personal health signals, thermal exposures, and guided clinical recommendations.
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

      {/* Quick Flow Overview */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        3-Step Screening Pathway
      </Text>

      <View style={styles.stepsList}>
        <View style={[styles.stepItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.stepNumberBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.stepNumberText, { color: theme.primary }]}>1</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>6 Discreet Questions</Text>
            <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
              Covering demographics, conception timeline, thermal exposures, and symptoms.
            </Text>
          </View>
        </View>

        <View style={[styles.stepItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.stepNumberBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.stepNumberText, { color: theme.primary }]}>2</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>Stratification & Report</Text>
            <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
              Transparent risk stratification mapped against WHO 2021 manual standards.
            </Text>
          </View>
        </View>

        <View style={[styles.stepItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.stepNumberBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.stepNumberText, { color: theme.primary }]}>3</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>Next Steps & Consultation</Text>
            <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
              Practical lifestyle measures and guided specialist referral navigation.
            </Text>
          </View>
        </View>
      </View>

      {/* Emergency Notice Card */}
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
        <View style={styles.emergencyHeader}>
          <AlertTriangle size={20} color={theme.emergency} />
          <Text style={[styles.emergencyTitle, { color: theme.emergency }]}>
            Experiencing Acute Pain or Swelling?
          </Text>
        </View>
        <Text style={[styles.emergencyDesc, { color: theme.text }]}>
          If you have severe sudden scrotal pain, suspected torsion, or direct trauma, access immediate 24/7 emergency medical guidance.
        </Text>
        <View style={styles.emergencyLinkRow}>
          <Text style={[styles.emergencyLinkText, { color: theme.emergency }]}>
            View Emergency Hotlines & Red Flags
          </Text>
          <ArrowRight size={14} color={theme.emergency} />
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
  mockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginBottom: Spacing.md,
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
  heroCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    marginBottom: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroIconBox: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
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
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  emergencyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  emergencyDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  emergencyLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emergencyLinkText: {
    fontSize: 13,
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
