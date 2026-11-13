import { Platform } from 'react-native';

const DEFAULT_API_URL = Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://localhost:8000',
});

export interface CaseSession {
  case_id: string;
  session_token: string;
  expires_at: string;
  state: {
    state: string;
    allowed_actions: string[];
    route: string;
  };
}

export interface Question {
  id: string;
  category: string;
  text: string;
  explanation: string;
  type: 'choice' | 'boolean' | 'number';
  options?: { label: string; value: string }[];
}

export interface IntakeSubmission {
  age?: string;
  trying_duration_months?: number;
  prior_sperm_test?: 'never' | 'normal' | 'abnormal' | 'not_sure';
  scrotal_discomfort?: 'never' | 'occasional' | 'frequent' | 'severe';
  lifestyle_heat_exposure?: boolean;
  lifestyle_smoking?: 'none' | 'moderate' | 'heavy';
  stress_level?: 'low' | 'moderate' | 'high';
}

export interface ScreeningResult {
  is_mock: boolean;
  triage_level: 'ROUTINE' | 'RECOMMENDED_EVALUATION' | 'URGENT_EVALUATION';
  summary_title: string;
  summary_description: string;
  key_findings: string[];
  recommended_actions: string[];
  lifestyle_tips: string[];
  generated_at: string;
}

// In-memory session holder for patient privacy
let currentSession: CaseSession | null = null;
let currentAnswers: IntakeSubmission = {};

export const ApiService = {
  getBaseUrl(): string {
    return DEFAULT_API_URL;
  },

  getCurrentSession(): CaseSession | null {
    return currentSession;
  },

  clearSession(): void {
    currentSession = null;
    currentAnswers = {};
  },

  async startSession(): Promise<CaseSession> {
    try {
      const response = await fetch(`${DEFAULT_API_URL}/api/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'mobile_app', client: 'sanad_react_native' }),
      });
      if (response.ok) {
        const data = await response.json();
        currentSession = data;
        return data;
      }
    } catch {
      // Graceful offline fallback
    }

    currentSession = {
      case_id: `SANAD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      session_token: `mock-token-${Date.now()}`,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      state: {
        state: 'CASE_OPENED',
        allowed_actions: ['INTAKE_SUBMIT', 'VIEW_RESULTS', 'CLOSE_CASE'],
        route: 'INTAKE',
      },
    };
    return currentSession;
  },

  getQuestions(): Question[] {
    return [
      {
        id: 'q_age',
        category: 'General Demographics',
        text: 'What is your current age bracket?',
        explanation: 'Age is a biological factor that naturally influences sperm motility, morphology, and seminal volume.',
        type: 'choice',
        options: [
          { label: 'Under 25', value: 'under_25' },
          { label: '25 to 34', value: '25_34' },
          { label: '35 to 44', value: '35_44' },
          { label: '45 and above', value: '45_plus' },
        ],
      },
      {
        id: 'q_duration',
        category: 'Conception Timeline',
        text: 'How long have you and your partner been trying to conceive naturally?',
        explanation: 'WHO clinical guidelines recommend comprehensive fertility evaluation if regular unprotected intercourse has not resulted in pregnancy after 12 months.',
        type: 'choice',
        options: [
          { label: 'Not trying yet / Preconception planning', value: 'planning' },
          { label: 'Less than 6 months', value: 'under_6m' },
          { label: '6 to 12 months', value: '6_12m' },
          { label: 'Over 12 months', value: 'over_1y' },
        ],
      },
      {
        id: 'q_prior_test',
        category: 'Clinical History',
        text: 'Have you ever had a Semen Analysis (Sperm Test)?',
        explanation: 'A formal semen analysis is the primary first-line diagnostic investigation for male reproductive assessment.',
        type: 'choice',
        options: [
          { label: 'Never tested', value: 'never' },
          { label: 'Tested (results were normal)', value: 'normal' },
          { label: 'Tested (some parameters flagged)', value: 'abnormal' },
          { label: 'Not sure / Unknown', value: 'not_sure' },
        ],
      },
      {
        id: 'q_scrotal_discomfort',
        category: 'Physical Symptoms',
        text: 'Do you experience scrotal pain, swelling, or a feeling of heaviness?',
        explanation: 'Chronic dull ache or swelling may be associated with varicocele (dilated veins) or subclinical inflammation.',
        type: 'choice',
        options: [
          { label: 'None at all', value: 'never' },
          { label: 'Occasional, mild heaviness', value: 'occasional' },
          { label: 'Frequent dull ache when standing', value: 'frequent' },
          { label: 'Severe / Acute pain (Immediate attention)', value: 'severe' },
        ],
      },
      {
        id: 'q_lifestyle',
        category: 'Thermal & Lifestyle Exposures',
        text: 'Do you regularly use hot saunas, hot tubs, or rest laptops directly on your lap?',
        explanation: 'Spermatogenesis requires scrotal temperatures 2-4°C below core body temperature. Sustained heat can temporarily suppress sperm production.',
        type: 'choice',
        options: [
          { label: 'No heat exposure habits', value: 'no' },
          { label: 'Occasional (1-2 times a month)', value: 'occasional' },
          { label: 'Frequent (weekly or prolonged)', value: 'frequent' },
        ],
      },
      {
        id: 'q_stress_habits',
        category: 'Tobacco & Stress',
        text: 'What is your current level of tobacco smoking and daily work stress?',
        explanation: 'Nicotine and oxidative stress from severe fatigue elevate sperm DNA fragmentation indices.',
        type: 'choice',
        options: [
          { label: 'Non-smoker, manageable stress', value: 'good' },
          { label: 'Occasional smoking / Moderate stress', value: 'moderate' },
          { label: 'Daily smoking or high chronic stress', value: 'high' },
        ],
      },
    ];
  },

  saveAnswers(answers: IntakeSubmission): void {
    currentAnswers = { ...currentAnswers, ...answers };
  },

  getAnswers(): IntakeSubmission {
    return currentAnswers;
  },

  hasAnswers(): boolean {
    return Object.keys(currentAnswers).length > 0;
  },

  loadSampleAnswers(): void {
    currentAnswers = {
      age: '25_34',
      trying_duration_months: 8,
      prior_sperm_test: 'never',
      scrotal_discomfort: 'occasional',
      lifestyle_heat_exposure: false,
      lifestyle_smoking: 'none',
      stress_level: 'moderate',
    };
  },

  async evaluateResults(): Promise<ScreeningResult> {
    const answers = currentAnswers;
    const hasSeverePain = answers.scrotal_discomfort === 'severe';
    const isOver1Year = answers.trying_duration_months && answers.trying_duration_months >= 12;

    if (hasSeverePain) {
      return {
        is_mock: true,
        triage_level: 'URGENT_EVALUATION',
        summary_title: 'Prompt Medical Attention Recommended',
        summary_description: 'Notable scrotal pain or acute discomfort was reported. A clinical evaluation by a urologist or emergency physician is advised to rule out acute conditions.',
        key_findings: [
          'Reported scrotal discomfort at a threshold warranting direct medical evaluation.',
          'Scrotal Doppler ultrasound is typically indicated to evaluate vascular flow and exclude varicocele or torsion.',
        ],
        recommended_actions: [
          'Visit a urology clinic or urgent medical care center within 24 to 48 hours.',
          'Avoid heavy lifting or strenuous athletic activity while awaiting assessment.',
          'If pain becomes sudden and severe, proceed to the nearest emergency department immediately.',
        ],
        lifestyle_tips: [
          'Do not take unprescribed painkillers without medical evaluation.',
          'Wear supportive, comfortable briefs rather than loose or tight restrictive clothing.',
        ],
        generated_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    }

    if (isOver1Year || answers.prior_sperm_test === 'abnormal') {
      return {
        is_mock: true,
        triage_level: 'RECOMMENDED_EVALUATION',
        summary_title: 'Specialist Consultation Recommended',
        summary_description: 'With a conception timeline exceeding 12 months or previously flagged parameters, proactive evaluation of both partners is the gold standard approach.',
        key_findings: [
          'Trying timeline is at or above the 12-month standard diagnostic threshold.',
          'Male factor accounts for approximately 50% of all infertility investigations.',
        ],
        recommended_actions: [
          'Order a standard semen analysis per WHO 2021 6th Edition laboratory guidelines.',
          'Check baseline male hormonal panel (Total Testosterone, LH, FSH, Prolactin).',
          'Schedule an exploratory consultation with an andrologist or reproductive specialist.',
        ],
        lifestyle_tips: [
          'Consider evidence-backed antioxidants (CoQ10, Zinc, Vitamin C, Vitamin E) to combat reactive oxygen species.',
          'Spermatogenesis takes approximately 74 days; lifestyle modifications require 2 to 3 months to reflect in semen parameters.',
        ],
        generated_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    }

    return {
      is_mock: true,
      triage_level: 'ROUTINE',
      summary_title: 'Low Clinical Risk: Proactive Optimization',
      summary_description: 'No significant acute or historical risk flags detected. Focus on lifestyle optimization and proactive preconception wellness.',
      key_findings: [
        'No acute scrotal pain or abnormal symptoms reported.',
        'Current timeline and self-reported exposures are within routine parameters.',
      ],
      recommended_actions: [
        'If planning to conceive within 3 to 6 months, consider a baseline semen analysis for reassurance.',
        'Maintain regular moderate aerobic exercise (walking, swimming, moderate strength training).',
      ],
      lifestyle_tips: [
        'Avoid testicular overheating: minimize hot tub sessions and avoid keeping laptops on laps.',
        'Prioritize 7 to 8 hours of quality sleep; peak testosterone synthesis occurs during REM sleep cycles.',
      ],
      generated_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  },
};
