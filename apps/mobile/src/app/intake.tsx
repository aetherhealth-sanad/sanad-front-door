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
  CheckCircle2,
  Circle,
  HelpCircle,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService, Question } from '@/services/api';

export default function IntakeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const questions: Question[] = ApiService.getQuestions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  const currentQuestion = questions[currentIndex];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleSelectOption = (value: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const handleNext = () => {
    if (!selectedAnswers[currentQuestion.id]) {
      Alert.alert('Selection Required', 'Please choose the option that most accurately describes your situation.');
      return;
    }

    if (isLastQuestion) {
      const submission: Record<string, any> = {};
      if (selectedAnswers['q_prior_test']) submission.prior_sperm_test = selectedAnswers['q_prior_test'];
      if (selectedAnswers['q_scrotal_discomfort']) submission.scrotal_discomfort = selectedAnswers['q_scrotal_discomfort'];
      if (selectedAnswers['q_duration'] === 'over_1y') submission.trying_duration_months = 14;

      ApiService.saveAnswers(submission);
      router.push('/results');
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else {
      router.back();
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Progress Bar & Counter */}
      <View style={styles.progressHeader}>
        <View style={styles.counterRow}>
          <Text style={[styles.categoryBadge, { color: theme.primary, backgroundColor: theme.primaryLight }]}>
            {currentQuestion.category}
          </Text>
          <Text style={[styles.counterText, { color: theme.textSecondary }]}>
            Question {currentIndex + 1} of {questions.length}
          </Text>
        </View>

        <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressBarFill,
              { backgroundColor: theme.primary, width: `${progressPercent}%` },
            ]}
          />
        </View>
      </View>

      {/* Main Question Card */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.questionText, { color: theme.text }]}>
          {currentQuestion.text}
        </Text>

        {/* Explanation / Why we ask */}
        <View style={[styles.explanationBox, { backgroundColor: theme.backgroundElement }]}>
          <HelpCircle size={16} color={theme.textSecondary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.explanationLabel, { color: theme.textSecondary }]}>
              Why do we ask this?
            </Text>
            <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
              {currentQuestion.explanation}
            </Text>
          </View>
        </View>

        {/* Options List */}
        <View style={styles.optionsList}>
          {currentQuestion.options?.map((option) => {
            const isSelected = selectedAnswers[currentQuestion.id] === option.value;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.optionItem,
                  {
                    backgroundColor: isSelected ? theme.primaryLight : theme.card,
                    borderColor: isSelected ? theme.primary : theme.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
                onPress={() => handleSelectOption(option.value)}
              >
                <View style={styles.optionContent}>
                  {isSelected ? (
                    <CheckCircle2 size={20} color={theme.primary} />
                  ) : (
                    <Circle size={20} color={theme.textMuted} />
                  )}
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: isSelected ? theme.primaryDark : theme.text,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Navigation Buttons */}
      <View style={styles.navigationRow}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleBack}
        >
          <ArrowLeft size={18} color={theme.text} />
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            {currentIndex === 0 ? 'Exit' : 'Back'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.nextButton,
            {
              backgroundColor: theme.primary,
              opacity: pressed || !selectedAnswers[currentQuestion.id] ? 0.8 : 1,
            },
          ]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {isLastQuestion ? 'View Results' : 'Continue'}
          </Text>
          {isLastQuestion ? (
            <Sparkles size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
          ) : (
            <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
          )}
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
  progressHeader: {
    marginBottom: Spacing.lg,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  card: {
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
  questionText: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: Spacing.md,
  },
  explanationBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: 8,
    marginBottom: Spacing.xl,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  explanationText: {
    fontSize: 12,
    lineHeight: 18,
  },
  optionsList: {
    gap: Spacing.md,
  },
  optionItem: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionLabel: {
    fontSize: 15,
    flex: 1,
    lineHeight: 21,
  },
  navigationRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    height: 52,
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
