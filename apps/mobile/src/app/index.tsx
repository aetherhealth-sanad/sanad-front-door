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
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import {
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  HeartPulse,
  Sparkles,
  RotateCcw,
  Compass,
  ChevronDown,
  Activity,
  Flame,
  Stethoscope,
  UserCheck,
  ClipboardList,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService } from '@/services/api';
import { IntroModal } from '@/components/intro-modal';

export default function HomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const [session, setSession] = useState(ApiService.getCurrentSession());
  const [loading, setLoading] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [reportScope, setReportScope] = useState<'full' | 'overview'>('full');

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

      {/* Top Header Row with User Avatar & Greeting */}
      <View style={styles.headerRow}>
        <View style={styles.headerGreeting}>
          <Text style={[styles.greetingSub, { color: theme.textSecondary }]}>
            Hello Aliza 👋
          </Text>
          <Text style={[styles.greetingTitle, { color: theme.text }]}>
            Check Your Health
          </Text>
        </View>

        {/* Actions & Avatar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            style={({ pressed }) => [
              {
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: Radius.full,
                backgroundColor: '#E0EDFF',
                borderWidth: 1,
                borderColor: '#BFDBFE',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => router.push('/loading-demo')}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#0066EE' }}>
              Loading UI
            </Text>
          </Pressable>

          {/* User Portrait Avatar */}
          <Pressable
            style={styles.avatarWrapper}
            onPress={() => setIntroVisible(true)}
          >
            <Image
              source={require('@/assets/images/real_patient_peace_of_mind.jpg')}
              style={styles.avatarImage}
              resizeMode="cover"
            />
            <View style={styles.avatarStatusBadge} />
          </Pressable>
        </View>
      </View>

      {/* Atmospheric AI Assistant Hero Card (Mesh Gradient Aesthetic) */}
      <View style={[styles.atmosphericCard, { borderColor: theme.border }]}>
        {/* Soft background visual backdrop */}
        <Image
          source={require('@/assets/images/medical_hero_3d.jpg')}
          style={styles.atmosphericImageBackdrop}
          resizeMode="cover"
        />

        {/* Frosted Mesh Overlay */}
        <View style={styles.atmosphericGlowOverlay}>
          {/* Mock research indicator tag */}
          <View style={styles.prototypeTag}>
            <View style={styles.prototypeDot} />
            <Text style={styles.prototypeTagText}>SIMULATED AI HEALTH PROTOCOL</Text>
          </View>

          {/* Floating Pill: AI Assistant -> */}
          <Pressable
            style={({ pressed }) => [
              styles.aiAssistantPill,
              { opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={handleStartAssessment}
          >
            <View style={styles.aiSparkleCircle}>
              <Sparkles size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.aiAssistantText}>
              {session ? 'Resume AI Guide' : 'AI Health Assistant'}
            </Text>
            <View style={styles.aiArrowCircle}>
              <ArrowRight size={15} color="#072254" />
            </View>
          </Pressable>
        </View>
      </View>

      {/* Your Report Section Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Your Report
        </Text>

        <Pressable
          style={[styles.dropdownPill, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => setReportScope(prev => (prev === 'full' ? 'overview' : 'full'))}
        >
          <Text style={[styles.dropdownPillText, { color: theme.textSecondary }]}>
            {reportScope === 'full' ? 'Full Body' : 'Overview'}
          </Text>
          <ChevronDown size={14} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* 2x2 Visual Metric Cards with Micro-Charts */}
      <View style={styles.metricsGrid}>
        {/* Metric 1: Blood Pressure */}
        <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metricHeader}>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
              Blood Pressure
            </Text>
            <View style={[styles.metricIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Activity size={14} color="#0066EE" />
            </View>
          </View>

          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValueNumber, { color: theme.text }]}>120</Text>
            <Text style={[styles.metricUnit, { color: theme.textSecondary }]}>mmHg</Text>
          </View>

          {/* Micro-Curve Chart */}
          <View style={styles.chartContainer}>
            <View style={styles.chartLabelsCol}>
              <Text style={styles.chartLabel}>200</Text>
              <Text style={styles.chartLabel}>120</Text>
            </View>
            <View style={styles.chartSvgArea}>
              <Svg width="100%" height={46} viewBox="0 0 120 46">
                <Defs>
                  <SvgLinearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#0066EE" stopOpacity="0.4" />
                    <Stop offset="100%" stopColor="#0066EE" stopOpacity="0.02" />
                  </SvgLinearGradient>
                </Defs>
                <Path
                  d="M0,28 Q20,12 40,24 T80,18 T120,22 L120,46 L0,46 Z"
                  fill="url(#blueGradient)"
                />
                <Path
                  d="M0,28 Q20,12 40,24 T80,18 T120,22"
                  fill="none"
                  stroke="#0066EE"
                  strokeWidth="2.2"
                />
              </Svg>
            </View>
          </View>
        </View>

        {/* Metric 2: Heart Rate / Reproductive Vitality */}
        <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metricHeader}>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
              Heart Rate
            </Text>
            <View style={[styles.metricIconBox, { backgroundColor: '#FEF2F2' }]}>
              <HeartPulse size={14} color="#D92D20" />
            </View>
          </View>

          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValueNumber, { color: theme.text }]}>78</Text>
            <Text style={[styles.metricUnit, { color: theme.textSecondary }]}>bpm</Text>
          </View>

          {/* Micro Sine Wave with Active Crest Indicator */}
          <View style={styles.chartContainer}>
            <View style={styles.chartLabelsCol}>
              <Text style={styles.chartLabel}>110</Text>
              <Text style={styles.chartLabel}>60</Text>
            </View>
            <View style={styles.chartSvgArea}>
              <Svg width="100%" height={46} viewBox="0 0 120 46">
                <Path
                  d="M0,32 Q25,6 50,30 T100,24 T120,30"
                  fill="none"
                  stroke="#0066EE"
                  strokeWidth="2.5"
                />
                <SvgCircle cx="50" cy="12" r="4.5" fill="#0066EE" />
                <SvgCircle cx="50" cy="12" r="2" fill="#FFFFFF" />
              </Svg>
            </View>
          </View>
        </View>

        {/* Metric 3: Thermal & Lifestyle Exposure */}
        <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metricHeader}>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
              Thermal Exposure
            </Text>
            <View style={[styles.metricIconBox, { backgroundColor: '#FEF9C3' }]}>
              <Flame size={14} color="#CA8A04" />
            </View>
          </View>

          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValueNumber, { color: theme.text }]}>Optimal</Text>
          </View>

          {/* Micro Step/Bar Indicator */}
          <View style={styles.barIndicatorRow}>
            <View style={[styles.barSegment, { backgroundColor: '#0066EE', height: 16 }]} />
            <View style={[styles.barSegment, { backgroundColor: '#0066EE', height: 26 }]} />
            <View style={[styles.barSegment, { backgroundColor: '#93C5FD', height: 12 }]} />
            <View style={[styles.barSegment, { backgroundColor: '#E2E8F0', height: 8 }]} />
          </View>
        </View>

        {/* Metric 4: Hormone & Lab Readiness */}
        <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metricHeader}>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
              Hormone Status
            </Text>
            <View style={[styles.metricIconBox, { backgroundColor: '#FDF2F8' }]}>
              <Stethoscope size={14} color="#DB2777" />
            </View>
          </View>

          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValueNumber, { color: theme.text }]}>Safe</Text>
            <Text style={[styles.metricUnit, { color: theme.textSecondary }]}>WHO'21</Text>
          </View>

          {/* Micro Smooth Sparkline */}
          <View style={styles.chartContainer}>
            <View style={styles.chartSvgArea}>
              <Svg width="100%" height={32} viewBox="0 0 100 32">
                <Path
                  d="M0,20 Q25,8 45,18 T80,12 T100,16"
                  fill="none"
                  stroke="#DB2777"
                  strokeWidth="2.2"
                />
              </Svg>
            </View>
          </View>
        </View>
      </View>

      {/* Sequential Journey Section */}
      <Text style={[styles.journeySectionTitle, { color: theme.text }]}>
        Sequential Clinical Flow
      </Text>

      <View style={styles.journeyCardsList}>
        {/* Step 1: Screening Intake */}
        <Pressable
          style={({ pressed }) => [
            styles.journeyCard,
            { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
          ]}
          onPress={handleStartAssessment}
        >
          <View style={styles.journeyNumberPill}>
            <Text style={styles.journeyNumberText}>1</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.journeyCardTitle, { color: theme.text }]}>
              Discreet Clinical Intake
            </Text>
            <Text style={[styles.journeyCardDesc, { color: theme.textSecondary }]}>
              Conversational assessment of thermal habits, history, and timeline.
            </Text>
          </View>
          <ArrowRight size={18} color={theme.primary} />
        </Pressable>

        {/* Step 2: Doctor Care Directory */}
        <Pressable
          style={({ pressed }) => [
            styles.journeyCard,
            { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
          ]}
          onPress={() => router.push('/doctors')}
        >
          <View style={[styles.journeyNumberPill, { backgroundColor: '#072254' }]}>
            <Text style={styles.journeyNumberText}>2</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.journeyCardTitle, { color: theme.text }]}>
              Specialist Doctor Directory
            </Text>
            <Text style={[styles.journeyCardDesc, { color: theme.textSecondary }]}>
              Explore verified reproductive urologists and book simulated consultations.
            </Text>
          </View>
          <ArrowRight size={18} color={theme.primary} />
        </Pressable>

        {/* Step 3: Stratified Report */}
        <Pressable
          style={({ pressed }) => [
            styles.journeyCard,
            { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
          ]}
          onPress={() => router.push('/results')}
        >
          <View style={[styles.journeyNumberPill, { backgroundColor: '#475569' }]}>
            <Text style={styles.journeyNumberText}>3</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.journeyCardTitle, { color: theme.text }]}>
              Health Report & Stratification
            </Text>
            <Text style={[styles.journeyCardDesc, { color: theme.textSecondary }]}>
              Review evidence-grounded risk indicators mapped against WHO 2021 manual.
            </Text>
          </View>
          <ArrowRight size={18} color={theme.primary} />
        </Pressable>
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
        <View style={styles.emergencyRow}>
          <AlertTriangle size={20} color={theme.emergency} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.emergencyTitle, { color: theme.emergency }]}>
              Sudden Testicular Pain or Acute Swelling?
            </Text>
            <Text style={[styles.emergencyDesc, { color: theme.text }]}>
              Immediate 24/7 emergency care is required. Tap to view hospital hotlines.
            </Text>
          </View>
          <ArrowRight size={16} color={theme.emergency} />
        </View>
      </Pressable>

      {/* Reset Session Option if active */}
      {session && (
        <Pressable style={styles.resetButton} onPress={handleResetSession}>
          <RotateCcw size={14} color={theme.textMuted} />
          <Text style={[styles.resetButtonText, { color: theme.textMuted }]}>
            Active Case: {session.case_id} • Tap to purge
          </Text>
        </Pressable>
      )}

      {/* Footer Disclaimer */}
      <View style={styles.footer}>
        <ShieldCheck size={14} color={theme.textMuted} />
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          Sanad by AetherHealth • Research Prototype 2026. Non-diagnostic.
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
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: Spacing.xxl + 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerGreeting: {
    flex: 1,
  },
  greetingSub: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  avatarWrapper: {
    position: 'relative',
    marginLeft: 16,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarStatusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  atmosphericCard: {
    height: 175,
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    marginBottom: Spacing.xl,
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  atmosphericImageBackdrop: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  atmosphericGlowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(238, 242, 255, 0.45)',
    justifyContent: 'space-between',
    padding: 16,
  },
  prototypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 34, 84, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    gap: 6,
  },
  prototypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
  },
  prototypeTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  aiAssistantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: Radius.full,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  aiSparkleCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0066EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiAssistantText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#072254',
    flex: 1,
  },
  aiArrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: 4,
  },
  dropdownPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: Spacing.xl,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 6,
  },
  metricValueNumber: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '500',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  chartLabelsCol: {
    justifyContent: 'space-between',
    height: 40,
    marginRight: 6,
  },
  chartLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '500',
  },
  chartSvgArea: {
    flex: 1,
  },
  barIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 38,
    marginTop: 6,
  },
  barSegment: {
    width: 14,
    borderRadius: 4,
  },
  journeySectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  journeyCardsList: {
    gap: 10,
    marginBottom: Spacing.xl,
  },
  journeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  journeyNumberPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0066EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  journeyCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  journeyCardDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  emergencyCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  emergencyDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: Spacing.md,
  },
  resetButtonText: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  footerText: {
    fontSize: 11,
  },
});
