import { Platform } from 'react-native';

// Default to local development server:
// - Android Emulator uses 10.0.2.2 to access host machine localhost
// - iOS Simulator and Web use localhost:8000
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
  lifestyle_heat_exposure?: boolean; // Hot baths / tight wear
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

// In-memory session holder for privacy
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

  // Start a new private session (Mock or Backend API)
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
      // Graceful fallback to offline/synthetic mock session
    }

    // Synthetic session compliant with Sanad BRD & PRD
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
        category: 'Thông tin chung',
        text: 'Độ tuổi của bạn hiện tại?',
        explanation: 'Độ tuổi là yếu tố sinh học tự nhiên ảnh hưởng đến chất lượng và số lượng tinh trùng.',
        type: 'choice',
        options: [
          { label: 'Dưới 25 tuổi', value: 'under_25' },
          { label: '25 - 34 tuổi', value: '25_34' },
          { label: '35 - 44 tuổi', value: '35_44' },
          { label: '45 tuổi trở lên', value: '45_plus' },
        ],
      },
      {
        id: 'q_duration',
        category: 'Thời gian mong con',
        text: 'Bạn và bạn đời đã mong con tự nhiên trong bao lâu?',
        explanation: 'Khuyến cáo y khoa quốc tế: Nếu trên 12 tháng sinh hoạt đều đặn chưa có tin vui, nên kiểm tra cả 2 vợ chồng.',
        type: 'choice',
        options: [
          { label: 'Chưa cố gắng / Chỉ tìm hiểu trước', value: 'planning' },
          { label: 'Dưới 6 tháng', value: 'under_6m' },
          { label: '6 - 12 tháng', value: '6_12m' },
          { label: 'Trên 1 năm', value: 'over_1y' },
        ],
      },
      {
        id: 'q_prior_test',
        category: 'Tiền sử kiểm tra',
        text: 'Bạn đã từng làm xét nghiệm Tinh dịch đồ (Semen Analysis) chưa?',
        explanation: 'Xét nghiệm tinh dịch đồ là tiêu chuẩn vàng đầu tiên để đánh giá sức khỏe sinh sản nam giới.',
        type: 'choice',
        options: [
          { label: 'Chưa bao giờ làm', value: 'never' },
          { label: 'Đã làm (kết quả bình thường)', value: 'normal' },
          { label: 'Đã làm (có chỉ số cần chú ý)', value: 'abnormal' },
          { label: 'Không chắc chắn', value: 'not_sure' },
        ],
      },
      {
        id: 'q_scrotal_discomfort',
        category: 'Triệu chứng thực thể',
        text: 'Bạn có cảm giác đau tức, sưng nề hoặc cảm giác nặng vùng bìu không?',
        explanation: 'Có thể liên quan đến giãn tĩnh mạch thừng tinh (varicocele) hoặc viêm nhiễm nhẹ.',
        type: 'choice',
        options: [
          { label: 'Hoàn toàn không có', value: 'never' },
          { label: 'Thỉnh thoảng, thoáng qua', value: 'occasional' },
          { label: 'Thường xuyên khi đứng lâu hoặc mệt', value: 'frequent' },
          { label: 'Đau buốt cấp tính (Cần hỗ trợ ngay)', value: 'severe' },
        ],
      },
      {
        id: 'q_lifestyle',
        category: 'Thói quen & Lối sống',
        text: 'Bạn có thói quen tắm nước rất nóng, xông hơi thường xuyên hoặc để laptop trên đùi không?',
        explanation: 'Nhiệt độ cao kéo dài gây ức chế quá trình sinh tinh ở tinh hoàn.',
        type: 'choice',
        options: [
          { label: 'Không có thói quen này', value: 'no' },
          { label: 'Thỉnh thoảng (1-2 lần/tháng)', value: 'occasional' },
          { label: 'Thường xuyên (hàng tuần)', value: 'frequent' },
        ],
      },
      {
        id: 'q_stress_habits',
        category: 'Hút thuốc & Căng thẳng',
        text: 'Mức độ hút thuốc lá hoặc căng thẳng (stress) công việc hiện tại?',
        explanation: 'Nicotine và stress oxy hóa làm giảm độ di động và tăng phân mảnh DNA tinh trùng.',
        type: 'choice',
        options: [
          { label: 'Không hút thuốc, tinh thần thoải mái', value: 'good' },
          { label: 'Hút ít / Stress vừa phải', value: 'moderate' },
          { label: 'Hút thường xuyên hoặc áp lực cao', value: 'high' },
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

  async evaluateResults(): Promise<ScreeningResult> {
    // Evaluation calculation based on inputs (Always transparently labeled as MOCK / RESEARCH PROTOTYPE)
    const answers = currentAnswers;
    const hasSeverePain = answers.scrotal_discomfort === 'severe';
    const isOver1Year = answers.trying_duration_months && answers.trying_duration_months >= 12;

    if (hasSeverePain) {
      return {
        is_mock: true,
        triage_level: 'URGENT_EVALUATION',
        summary_title: 'Cần thăm khám trực tiếp sớm',
        summary_description: 'Bạn có triệu chứng đau tức bìu đáng chú ý. Cần gặp bác sĩ chuyên khoa Nam học hoặc Ngoại niệu để loại trừ các bệnh lý cấp tính.',
        key_findings: [
          'Ghi nhận triệu chứng đau tức vùng bìu mức độ cần can thiệp y tế.',
          'Cần siêu âm Doppler mạch máu bìu để kiểm tra giãn tĩnh mạch thừng tinh hoặc xoắn tinh hoàn nhẹ.',
        ],
        recommended_actions: [
          'Đến cơ sở y tế chuyên khoa Nam học gần nhất trong vòng 24 - 48 giờ.',
          'Hạn chế vận động mạnh, mang vác nặng trong lúc chờ thăm khám.',
          'Nếu đau dữ dội đột ngột, đến phòng cấp cứu y tế ngay lập tức.',
        ],
        lifestyle_tips: [
          'Không tự ý dùng thuốc giảm đau mà không có chỉ định.',
          'Mặc quần lót nâng đỡ vừa vặn, tránh cọ xát.',
        ],
        generated_at: new Date().toLocaleDateString('vi-VN'),
      };
    }

    if (isOver1Year || answers.prior_sperm_test === 'abnormal') {
      return {
        is_mock: true,
        triage_level: 'RECOMMENDED_EVALUATION',
        summary_title: 'Khuyến nghị kiểm tra chuyên sâu',
        summary_description: 'Khoảng thời gian mong con trên 12 tháng hoặc tiền sử chỉ số chưa tối ưu là thời điểm vàng để cả hai vợ chồng cùng kiểm tra toàn diện.',
        key_findings: [
          'Thời gian mong con trên 12 tháng sinh hoạt tự nhiên.',
          'Sức khỏe sinh sản nam giới chiếm 50% nguyên nhân trong các cặp đôi chậm có con.',
        ],
        recommended_actions: [
          'Thực hiện xét nghiệm Tinh dịch đồ (Semen Analysis) chuẩn WHO 2021 tại phòng khám chuyên khoa.',
          'Kiểm tra nồng độ hormone nam (Testosterone, LH, FSH, Prolactin).',
          'Tư vấn trực tiếp với bác sĩ chuyên khoa Hỗ trợ sinh sản (IVF/Andrology).',
        ],
        lifestyle_tips: [
          'Bổ sung kẽm (Zinc), Coenzyme Q10, Vitamin E, Vitamin C hỗ trợ chống oxy hóa tế bào sinh tinh.',
          'Hạn chế rượu bia, dừng hút thuốc lá ít nhất 74 ngày (chu kỳ tạo tinh trùng mới).',
        ],
        generated_at: new Date().toLocaleDateString('vi-VN'),
      };
    }

    return {
      is_mock: true,
      triage_level: 'ROUTINE',
      summary_title: 'Sức khỏe cơ bản tốt - Tối ưu hóa lối sống',
      summary_description: 'Hiện chưa ghi nhận tín hiệu rủi ro cao. Bạn có thể tập trung duy trì thói quen sống lành mạnh để chuẩn bị cho kế hoạch tương lai.',
      key_findings: [
        'Chưa ghi nhận triệu chứng bất thường tại cơ quan sinh dục.',
        'Lối sống và thói quen sinh hoạt ở mức kiểm soát tốt.',
      ],
      recommended_actions: [
        'Nếu có kế hoạch sinh con trong 3-6 tháng tới, nên làm một xét nghiệm Tinh dịch đồ tổng quát để yên tâm.',
        'Duy trì chế độ vận động nhẹ nhàng (đi bộ, gym vừa sức, bơi lội).',
      ],
      lifestyle_tips: [
        'Tránh để vùng bìu bị nóng: không ngâm bồn nước nóng thường xuyên, không để máy tính lên đùi.',
        'Ngủ đủ 7-8 tiếng mỗi đêm; nồng độ testosterone được tái tạo chủ yếu trong giấc ngủ sâu.',
      ],
      generated_at: new Date().toLocaleDateString('vi-VN'),
    };
  },
};
