import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  PhoneCall,
  AlertTriangle,
  Trash2,
  MapPin,
  Clock,
  Shield,
  ExternalLink,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService } from '@/services/api';

export default function SafetyScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const handleCallEmergency = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Không thể thực hiện cuộc gọi', `Vui lòng tự quay số: ${phone}`);
    });
  };

  const handlePurgeSession = () => {
    Alert.alert(
      'Xóa toàn bộ dữ liệu phiên?',
      'Hành động này sẽ xóa ngay lập tức mọi câu trả lời, mã phiên và bộ nhớ tạm trên thiết bị của bạn.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: () => {
            ApiService.clearSession();
            Alert.alert(
              'Đã xóa an toàn',
              'Toàn bộ dữ liệu của bạn trên máy này đã biến mất hoàn toàn.',
              [{ text: 'Về trang chủ', onPress: () => router.replace('/') }]
            );
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
      {/* Urgent Warning Header */}
      <View style={[styles.alertBanner, { backgroundColor: theme.emergencyLight, borderColor: theme.emergency }]}>
        <AlertTriangle size={24} color={theme.emergency} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.alertTitle, { color: theme.emergency }]}>
            Dấu hiệu Cấp cứu Y tế Khẩn cấp
          </Text>
          <Text style={[styles.alertSubtitle, { color: theme.text }]}>
            Nếu bạn gặp bất kỳ dấu hiệu nào dưới đây, hãy tới khoa Cấp cứu của bệnh viện gần nhất ngay lập tức (Thời gian vàng là dưới 6 giờ):
          </Text>
        </View>
      </View>

      {/* Red Flags List */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.flagItem}>
          <View style={[styles.flagDot, { backgroundColor: theme.emergency }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagTitle, { color: theme.text }]}>
              Đau dữ dội tinh hoàn đột ngột (Kèm nôn ói)
            </Text>
            <Text style={[styles.flagDesc, { color: theme.textSecondary }]}>
              Dấu hiệu nghi ngờ Xoắn tinh hoàn (Testicular Torsion) — cần can thiệp phẫu thuật khẩn cấp để bảo tồn chức năng.
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.flagItem}>
          <View style={[styles.flagDot, { backgroundColor: theme.emergency }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagTitle, { color: theme.text }]}>
              Chấn thương rách, tụ máu lớn vùng bìu
            </Text>
            <Text style={[styles.flagDesc, { color: theme.textSecondary }]}>
              Sau va đập thể thao, tai nạn xe cộ hoặc ngoại lực mạnh.
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.flagItem}>
          <View style={[styles.flagDot, { backgroundColor: theme.emergency }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagTitle, { color: theme.text }]}>
              Sốt cao kèm sưng nóng đỏ bìu và tiểu buốt
            </Text>
            <Text style={[styles.flagDesc, { color: theme.textSecondary }]}>
              Dấu hiệu của viêm mào tinh hoàn - tinh hoàn cấp tính do nhiễm trùng.
            </Text>
          </View>
        </View>
      </View>

      {/* Emergency Hotlines */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Đường dây nóng Hỗ trợ Y tế 24/7
      </Text>

      <View style={styles.hotlineList}>
        <Pressable
          style={({ pressed }) => [
            styles.hotlineButton,
            { backgroundColor: theme.emergency, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => handleCallEmergency('115')}
        >
          <PhoneCall size={22} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.hotlineTitle}>Cấp cứu Y tế Toàn quốc: 115</Text>
            <Text style={styles.hotlineSub}>Bấm để gọi cấp cứu xe cứu thương ngay</Text>
          </View>
          <ExternalLink size={18} color="#FFFFFF" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.facilityCard,
            { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => handleCallEmergency('19009095')}
        >
          <PhoneCall size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.facilityName, { color: theme.text }]}>
              Đường dây nóng Bộ Y Tế (1900 9095)
            </Text>
            <Text style={[styles.facilityDesc, { color: theme.textSecondary }]}>
              Tư vấn y tế & hướng dẫn địa chỉ bệnh viện gần nhất
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Privacy & Ghost Mode Card */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Bảo vệ Quyền riêng tư Cá nhân
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.privacyHeader}>
          <Shield size={20} color={theme.primary} />
          <Text style={[styles.privacyTitle, { color: theme.text }]}>
            Chế độ Xóa dấu vết (Ghost Mode)
          </Text>
        </View>
        <Text style={[styles.privacyDesc, { color: theme.textSecondary }]}>
          Nếu bạn dùng chung thiết bị hoặc muốn đảm bảo không ai thấy được câu trả lời khảo sát và kết quả của mình, hãy nhấn nút xóa bên dưới.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.purgeButton,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.emergency,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handlePurgeSession}
        >
          <Trash2 size={18} color={theme.emergency} />
          <Text style={[styles.purgeButtonText, { color: theme.emergency }]}>
            Xóa sạch phiên và dữ liệu ngay
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
  alertBanner: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    gap: 12,
    marginBottom: Spacing.xl,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  alertSubtitle: {
    fontSize: 13,
    lineHeight: 19,
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
  flagItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  flagTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  flagDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  hotlineList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  hotlineButton: {
    minHeight: 60,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  hotlineTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  hotlineSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
  },
  facilityCard: {
    minHeight: 56,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  facilityName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  facilityDesc: {
    fontSize: 12,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  privacyDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },
  purgeButton: {
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  purgeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
