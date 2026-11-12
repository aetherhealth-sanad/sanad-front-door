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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  PhoneCall,
  AlertTriangle,
  Trash2,
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
      Alert.alert('Unable to Place Call', `Please manually dial: ${phone}`);
    });
  };

  const handlePurgeSession = () => {
    Alert.alert(
      'Purge All Local Session Data?',
      'This action immediately deletes your questionnaire responses, session tokens, and local cache from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purge Now',
          style: 'destructive',
          onPress: () => {
            ApiService.clearSession();
            Alert.alert(
              'Session Cleared',
              'All personal answers and identifiers have been completely erased from this device.',
              [{ text: 'Return Home', onPress: () => router.replace('/') }]
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
      {/* Urgent Warning Header with Visual Banner */}
      <View style={[styles.alertBanner, { backgroundColor: theme.emergencyLight, borderColor: theme.emergency }]}>
        <Image
          source={require('@/assets/images/medical_urgent_care_3d.jpg')}
          style={styles.alertBannerImage}
          resizeMode="cover"
        />
        <View style={styles.alertBannerBody}>
          <View style={styles.alertTitleRow}>
            <AlertTriangle size={20} color={theme.emergency} />
            <Text style={[styles.alertTitle, { color: theme.emergency }]}>
              Medical Emergency Red Flags
            </Text>
          </View>
          <Text style={[styles.alertSubtitle, { color: theme.text }]}>
            If you experience any of the symptoms below, proceed to the nearest emergency department immediately (critical surgical window &lt; 6 hours):
          </Text>
        </View>
      </View>

      {/* Red Flags List */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.flagItem}>
          <View style={[styles.flagDot, { backgroundColor: theme.emergency }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagTitle, { color: theme.text }]}>
              Sudden Severe Testicular Pain (with or without nausea)
            </Text>
            <Text style={[styles.flagDesc, { color: theme.textSecondary }]}>
              High index of suspicion for Testicular Torsion — requires prompt surgical evaluation to preserve testicular viability.
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.flagItem}>
          <View style={[styles.flagDot, { backgroundColor: theme.emergency }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagTitle, { color: theme.text }]}>
              Penetrating Scrotal Trauma or Severe Hematoma
            </Text>
            <Text style={[styles.flagDesc, { color: theme.textSecondary }]}>
              Following sports impact, motor vehicular accident, or significant blunt force injury.
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.flagItem}>
          <View style={[styles.flagDot, { backgroundColor: theme.emergency }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flagTitle, { color: theme.text }]}>
              High Fever with Rapid Scrotal Swelling, Erythema & Dysuria
            </Text>
            <Text style={[styles.flagDesc, { color: theme.textSecondary }]}>
              Indicates acute epididymo-orchitis or expanding urogenital infection requiring prompt antibiotics.
            </Text>
          </View>
        </View>
      </View>

      {/* Emergency Hotlines */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        24/7 Emergency Medical Contacts
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
            <Text style={styles.hotlineTitle}>Emergency Medical Dispatch: 115 / 911</Text>
            <Text style={styles.hotlineSub}>Tap to connect with emergency ambulance services</Text>
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
              National Health Helpline (1900 9095)
            </Text>
            <Text style={[styles.facilityDesc, { color: theme.textSecondary }]}>
              24/7 health guidance and facility directory assistance
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Privacy & Ghost Mode Card with Visual Shield */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Patient Privacy & Data Protection
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.privacyRow}>
          <Image
            source={require('@/assets/images/medical_shield_3d.jpg')}
            style={styles.shieldThumbnail}
            resizeMode="cover"
          />
          <View style={{ flex: 1 }}>
            <View style={styles.privacyHeader}>
              <Shield size={18} color={theme.primary} />
              <Text style={[styles.privacyTitle, { color: theme.text }]}>
                Ghost Mode (Instant Session Purge)
              </Text>
            </View>
            <Text style={[styles.privacyDesc, { color: theme.textSecondary }]}>
              If you are on a shared device, tap below to permanently purge answers and cache from memory.
            </Text>
          </View>
        </View>

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
            Purge Session & Answers Immediately
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
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    marginBottom: Spacing.xl,
  },
  alertBannerImage: {
    width: '100%',
    height: 120,
  },
  alertBannerBody: {
    padding: Spacing.lg,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
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
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.md,
  },
  shieldThumbnail: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  privacyDesc: {
    fontSize: 13,
    lineHeight: 19,
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
