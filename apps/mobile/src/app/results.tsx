import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Stethoscope,
  Sparkles,
  Info,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService, ScreeningResult } from '@/services/api';

export default function ResultsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [hasAnswers, setHasAnswers] = useState(ApiService.hasAnswers());

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      if (ApiService.hasAnswers()) {
        const data = await ApiService.evaluateResults();
        setResult(data);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const handleLoadDemo = async () => {
    setLoading(true);
    ApiService.loadSampleAnswers();
    setHasAnswers(true);
    const data = await ApiService.evaluateResults();
    setResult(data);
    setLoading(false);
  };

  const getTriageTheme = (level?: string) => {
    switch (level) {
      case 'URGENT_EVALUATION':
        return {
          icon: AlertTriangle,
          badgeColor: theme.emergency,
          badgeBg: theme.emergencyLight,
          label: 'PROMPT MEDICAL ATTENTION ADVISED',
          image: require('@/assets/images/medical_urgent_care_3d.jpg'),
        };
      case 'RECOMMENDED_EVALUATION':
        return {
          icon: AlertCircle,
          badgeColor: theme.warning,
          badgeBg: theme.warningLight,
          label: 'SPECIALIST CONSULTATION RECOMMENDED',
          image: require('@/assets/images/real_doctor_consultation.jpg'),
        };
      default:
        return {
          icon: CheckCircle,
          badgeColor: theme.success,
          badgeBg: theme.successLight,
          label: 'ROUTINE: LIFESTYLE OPTIMIZATION',
          image: require('@/assets/images/real_patient_peace_of_mind.jpg'),
        };
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Analyzing screening indicators against WHO benchmarks...
        </Text>
      </View>
    );
  }

  if (!hasAnswers || !result) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            source={require('@/assets/images/medical_hero_3d.jpg')}
            style={styles.resultBannerImage}
            resizeMode="cover"
          />
          <View style={styles.cardContent}>
            <Text style={[styles.resultTitle, { color: theme.text }]}>
              No Assessment Completed Yet
            </Text>
            <Text style={[styles.resultDesc, { color: theme.textSecondary }]}>
              You navigated directly to this report without completing the screening intake. Missing answers never assume low risk. You can take the assessment or load a demonstration profile to preview the report.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1, marginBottom: 12 },
              ]}
              onPress={handleLoadDemo}
            >
              <Sparkles size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.primaryButtonText}>Load Sample Demonstration Report</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1, marginBottom: 12 },
              ]}
              onPress={() => router.push('/intake')}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Start 3-Minute Assessment
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => router.push('/doctors')}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>
                Browse Doctor Directory
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  const triageMeta = getTriageTheme(result.triage_level);
  const TriageIcon = triageMeta.icon;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Mock Indicator Banner */}
      <View style={[styles.mockNotice, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Info size={16} color={theme.textSecondary} style={{ marginTop: 2 }} />
        <Text style={[styles.mockNoticeText, { color: theme.textSecondary }]}>
          This assessment is a <Text style={{ fontWeight: '700' }}>Research Prototype Simulation (Mock Data)</Text>. It does not constitute a clinical diagnosis or medical prescription.
        </Text>
      </View>

      {/* Visual Triage Status Card */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Image source={triageMeta.image} style={styles.resultBannerImage} resizeMode="cover" />

        <View style={styles.cardContent}>
          <View style={[styles.triageBadge, { backgroundColor: triageMeta.badgeBg }]}>
            <TriageIcon size={16} color={triageMeta.badgeColor} />
            <Text style={[styles.triageBadgeText, { color: triageMeta.badgeColor }]}>
              {triageMeta.label}
            </Text>
          </View>

          <Text style={[styles.resultTitle, { color: theme.text }]}>
            {result.summary_title}
          </Text>

          <Text style={[styles.resultDesc, { color: theme.textSecondary }]}>
            {result.summary_description}
          </Text>

          <Text style={[styles.dateText, { color: theme.textMuted }]}>
            Generated: {result.generated_at}
          </Text>
        </View>
      </View>

      {/* Key Findings */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Key Observations
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardContent}>
          {result.key_findings.map((item, index) => (
            <View key={index} style={[styles.listItem, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <View style={[styles.bulletPoint, { backgroundColor: theme.primary }]} />
              <Text style={[styles.listText, { color: theme.text }]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recommended Actions */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Recommended Next Steps
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardContent}>
          {result.recommended_actions.map((item, index) => (
            <View key={index} style={[styles.listItem, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <Stethoscope size={18} color={theme.primary} style={{ marginTop: 2 }} />
              <Text style={[styles.listText, { color: theme.text }]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Lifestyle Tips */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Evidence-Based Lifestyle Optimization
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardContent}>
          {result.lifestyle_tips.map((tip, index) => (
            <View key={index} style={[styles.listItem, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <Sparkles size={16} color={theme.accent} style={{ marginTop: 2 }} />
              <Text style={[styles.listText, { color: theme.textSecondary }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => router.push('/doctors')}
        >
          <Text style={styles.primaryButtonText}>Browse Specialist Care Directory</Text>
          <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push('/safety')}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.emergency }]}>
            View 24/7 Safety & Red Flags
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push('/intake')}
        >
          <RotateCcw size={16} color={theme.text} />
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            Retake Screening Assessment
          </Text>
        </Pressable>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
  },
  mockNotice: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 10,
    marginBottom: Spacing.lg,
  },
  mockNoticeText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  card: {
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
  resultBannerImage: {
    width: '100%',
    height: 148,
  },
  cardContent: {
    padding: Spacing.xl,
  },
  triageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    gap: 6,
    marginBottom: Spacing.md,
  },
  triageBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: Spacing.sm,
  },
  resultDesc: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing.md,
  },
  dateText: {
    fontSize: 12,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    gap: 12,
  },
  bulletPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  listText: {
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  actionsContainer: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  primaryButton: {
    height: 52,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
