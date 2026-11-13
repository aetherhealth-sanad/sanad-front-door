import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  useColorScheme,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Sparkles,
  X,
  ArrowUp,
  CheckCircle2,
  Circle,
  HelpCircle,
  Plus,
  ArrowRight,
  ShieldCheck,
  UserCheck,
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
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleSelectOption = (value: string, label: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));

    // Auto advance or submit after brief visual feedback
    setTimeout(() => {
      if (isLastQuestion) {
        const submission: Record<string, any> = {};
        if (selectedAnswers['q_prior_test']) submission.prior_sperm_test = selectedAnswers['q_prior_test'];
        if (selectedAnswers['q_scrotal_discomfort']) submission.scrotal_discomfort = selectedAnswers['q_scrotal_discomfort'];
        if (selectedAnswers['q_duration'] === 'over_1y' || value === 'over_1y') submission.trying_duration_months = 14;

        ApiService.saveAnswers(submission);
        router.push('/results');
      } else {
        setCurrentIndex((prev) => prev + 1);
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    }, 280);
  };

  const handleSkipQuestion = () => {
    if (isLastQuestion) {
      if (!ApiService.hasAnswers()) {
        ApiService.loadSampleAnswers();
      }
      router.push('/results');
    } else {
      setCurrentIndex((prev) => prev + 1);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleSkipToDemo = () => {
    ApiService.loadSampleAnswers();
    router.push('/results');
  };

  const handleCustomSend = () => {
    if (!inputText.trim()) return;

    const query = inputText.trim();
    setInputText('');

    if (query.toLowerCase().includes('doctor') || query.toLowerCase().includes('urologist')) {
      router.push('/doctors');
    } else if (query.toLowerCase().includes('skip') || query.toLowerCase().includes('next')) {
      handleSkipQuestion();
    } else if (query.toLowerCase().includes('report') || query.toLowerCase().includes('result')) {
      handleSkipToDemo();
    } else {
      Alert.alert(
        'Vital AI Assistant',
        `I noted: "${query}". You can continue the question above, skip it, or explore specialists freely.`,
        [
          { text: 'Skip Question', onPress: handleSkipQuestion },
          { text: 'Browse Doctors', onPress: () => router.push('/doctors') },
          { text: 'OK' },
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Header Bar */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <View style={styles.aiSparkleIconBox}>
            <Sparkles size={16} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Vital AI Assistant</Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>Sanad Health Guide (Mock)</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <X size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Atmospheric Chat Flow Area */}
      <View style={styles.chatWrapper}>
        {/* Soft Background Stipple Texture */}
        <Image
          source={require('@/assets/images/medical_hero_3d.jpg')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
        <View style={styles.frostedOverlay} />

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Mock Research Badge */}
          <View style={[styles.mockNoticePill, { backgroundColor: 'rgba(7, 34, 84, 0.75)' }]}>
            <ShieldCheck size={12} color="#38BDF8" />
            <Text style={styles.mockNoticeText}>CONFIDENTIAL CONVERSATIONAL SCREENING (MOCK)</Text>
          </View>

          {/* User Initial Bubble (Matching Reference Design: "Find Cardiologist Available" -> Here: "Review My Reproductive Health Signals") */}
          <View style={styles.userBubbleContainer}>
            <View style={styles.userBubblePill}>
              <Text style={styles.userBubbleText}>Review My Reproductive Health Signals</Text>
            </View>
          </View>

          {/* AI Guide Response Greeting */}
          <View style={styles.aiBubbleContainer}>
            <View style={[styles.aiBubbleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.aiGreetingText, { color: theme.text }]}>
                Hello! I am your confidential health guide. I will walk you through a brief 6-step assessment based on WHO 2021 reproductive guidelines.
              </Text>
            </View>
          </View>

          {/* Current Question Interactive Card */}
          <View style={styles.questionCardContainer}>
            <View style={[styles.questionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Question Category & Step Counter */}
              <View style={styles.stepHeaderRow}>
                <View style={[styles.categoryTag, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.categoryTagText, { color: theme.primaryDark }]}>
                    {currentQuestion.category}
                  </Text>
                </View>
                <Text style={[styles.stepCountText, { color: theme.textSecondary }]}>
                  Step {currentIndex + 1} of {questions.length}
                </Text>
              </View>

              {/* Question Text */}
              <Text style={[styles.questionText, { color: theme.text }]}>
                {currentQuestion.text}
              </Text>

              {/* Clinical Context Hint */}
              <View style={[styles.hintBox, { backgroundColor: theme.backgroundElement }]}>
                <HelpCircle size={14} color={theme.textSecondary} style={{ marginTop: 2 }} />
                <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                  {currentQuestion.explanation}
                </Text>
              </View>

              {/* Interactive Choice Bubbles */}
              <View style={styles.optionsList}>
                {currentQuestion.options?.map((option) => {
                  const isSelected = selectedAnswers[currentQuestion.id] === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={({ pressed }) => [
                        styles.optionPill,
                        {
                          backgroundColor: isSelected ? theme.primaryLight : theme.card,
                          borderColor: isSelected ? theme.primary : theme.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      onPress={() => handleSelectOption(option.value, option.label)}
                    >
                      <View style={styles.optionContentRow}>
                        {isSelected ? (
                          <CheckCircle2 size={18} color={theme.primary} />
                        ) : (
                          <Circle size={18} color={theme.textMuted} />
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

              {/* Skip Controls (Freedom to skip without being trapped) */}
              <View style={styles.skipActionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.skipButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={handleSkipQuestion}
                >
                  <Text style={[styles.skipButtonText, { color: theme.textSecondary }]}>
                    Skip this question
                  </Text>
                  <ArrowRight size={13} color={theme.textSecondary} />
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.skipDemoButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={handleSkipToDemo}
                >
                  <Text style={[styles.skipDemoText, { color: theme.primary }]}>
                    Skip all & view sample report
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Quick Doctor Link Pill */}
          <Pressable
            style={({ pressed }) => [
              styles.doctorQuickPill,
              { backgroundColor: 'rgba(255, 255, 255, 0.92)', opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => router.push('/doctors')}
          >
            <UserCheck size={16} color="#0066EE" />
            <Text style={styles.doctorQuickText}>Need a specialist? Browse Doctor Directory</Text>
            <ArrowRight size={14} color="#0066EE" />
          </Pressable>
        </ScrollView>

        {/* Bottom Interactive Input Bar (Matching Reference Screen 2) */}
        <View style={[styles.bottomInputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={[styles.inputPillContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Pressable
              style={styles.plusIconBox}
              onPress={() => router.push('/doctors')}
            >
              <Plus size={18} color={theme.textSecondary} />
            </Pressable>

            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Write your message or ask a question..."
              placeholderTextColor={theme.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleCustomSend}
              returnKeyType="send"
            />

            <Pressable
              style={({ pressed }) => [
                styles.sendButtonCircle,
                { opacity: pressed || !inputText.trim() ? 0.7 : 1 },
              ]}
              onPress={handleCustomSend}
            >
              <ArrowUp size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiSparkleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatWrapper: {
    flex: 1,
    position: 'relative',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.25,
  },
  frostedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 250, 252, 0.75)',
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 110,
  },
  mockNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    alignSelf: 'center',
    gap: 6,
    marginBottom: 16,
  },
  mockNoticeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  userBubbleContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 14,
  },
  userBubblePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    maxWidth: '85%',
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  userBubbleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#072254',
  },
  aiBubbleContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  aiBubbleCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    maxWidth: '90%',
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  aiGreetingText: {
    fontSize: 13,
    lineHeight: 19,
  },
  questionCardContainer: {
    marginBottom: 18,
  },
  questionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  categoryTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  stepCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  questionText: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 10,
  },
  hintBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: Radius.md,
    gap: 8,
    marginBottom: 16,
  },
  hintText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  optionsList: {
    gap: 10,
  },
  optionPill: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  optionContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionLabel: {
    fontSize: 14,
    flex: 1,
  },
  doctorQuickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  doctorQuickText: {
    color: '#0066EE',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  skipActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.6)',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  skipDemoButton: {
    paddingVertical: 6,
  },
  skipDemoText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomInputBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  inputPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  plusIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  sendButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0066EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
