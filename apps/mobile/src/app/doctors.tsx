import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  useColorScheme,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  SlidersHorizontal,
  Star,
  CheckCircle2,
  Calendar,
  Clock,
  ShieldCheck,
  X,
  MapPin,
  Sparkles,
} from 'lucide-react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ApiService } from '@/services/api';
import { LoadingView } from '@/components/loading-view';

interface DoctorItem {
  id: string;
  name: string;
  title: string;
  fee: string;
  rating: number;
  reviewsCount: number;
  facility: string;
  image: any;
  about: string;
  nextAvailable: string;
}

const DOCTORS: DoctorItem[] = [
  {
    id: 'doc-1',
    name: 'Dr. Eric David Adler',
    title: 'Reproductive Urologist & Andrologist',
    fee: '$100 (Mock Covered)',
    rating: 4.9,
    reviewsCount: 124,
    facility: 'Mock Andrology Center (Simulated)',
    image: require('../../assets/images/real_doctor_consultation.jpg'),
    about:
      'Specializes in male reproductive evaluation, semen parameter interpretation, and confidential non-invasive health guidance.',
    nextAvailable: 'Today, 3:30 PM',
  },
  {
    id: 'doc-2',
    name: 'Dr. Tulika Jain',
    title: 'Reproductive Endocrinologist',
    fee: '$100 (Mock Covered)',
    rating: 4.9,
    reviewsCount: 98,
    facility: 'Fertility Science Clinic (Mock)',
    image: require('../../assets/images/medical_doctor_avatar.jpg'),
    about:
      'Focuses on hormonal baseline reviews, lifestyle optimization for sperm vitality, and collaborative couples fertility planning.',
    nextAvailable: 'Tomorrow, 10:00 AM',
  },
  {
    id: 'doc-3',
    name: 'Dr. Sameer Mehta',
    title: 'Clinical Andrologist & Lab Director',
    fee: 'Free Follow-up (Simulated)',
    rating: 4.8,
    reviewsCount: 86,
    facility: 'Metropolitan Reproductive Lab (Mock)',
    image: require('../../assets/images/real_clinical_lab.jpg'),
    about:
      'Expert in semen analysis motility and concentration grading, WHO 6th edition laboratory parameters, and pre-test preparation.',
    nextAvailable: 'Friday, 2:00 PM',
  },
];

export default function DoctorListScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? Colors.dark : Colors.light;

  const [selectedDoctor, setSelectedDoctor] = useState<DoctorItem | null>(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'urology' | 'lab'>('all');
  const [isFiltering, setIsFiltering] = useState(false);

  const handleFilterChange = (filter: 'all' | 'urology' | 'lab') => {
    setActiveFilter(filter);
    setIsFiltering(true);
    setTimeout(() => {
      setIsFiltering(false);
    }, 450);
  };

  const filteredDoctors = DOCTORS.filter(doc => {
    if (activeFilter === 'urology') return doc.title.includes('Urologist');
    if (activeFilter === 'lab') return doc.title.includes('Lab') || doc.title.includes('Endocrinologist');
    return true;
  });

  const handleBookNow = (doctor: DoctorItem) => {
    setSelectedDoctor(doctor);
    setBookingConfirmed(false);
  };

  const confirmBooking = () => {
    setBookingConfirmed(true);
    setTimeout(() => {
      setSelectedDoctor(null);
      setBookingConfirmed(false);
      Alert.alert(
        'Simulated Booking Confirmed',
        `Your mock appointment with ${selectedDoctor?.name} has been scheduled for demonstration purposes (is_mock: true). No real data was transmitted.`,
      );
    }, 1200);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Navigation Bar */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: theme.text }]}>Doctor List</Text>

        <Pressable
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            setActiveFilter(prev => (prev === 'all' ? 'urology' : prev === 'urology' ? 'lab' : 'all'));
          }}
        >
          <SlidersHorizontal size={19} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Research / Mock Disclaimer Badge */}
        <View style={[styles.disclaimerPill, { backgroundColor: theme.primaryLight, borderColor: theme.borderFocus }]}>
          <ShieldCheck size={14} color={theme.primary} />
          <Text style={[styles.disclaimerText, { color: theme.primaryDark }]}>
            SIMULATED CARE DIRECTORY (MOCK SPECIALISTS)
          </Text>
        </View>

        {/* Direct Booking Notice */}
        <View style={[styles.directBookingBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.directBookingTitle, { color: theme.text }]}>
              Direct Specialist Booking
            </Text>
            <Text style={[styles.directBookingDesc, { color: theme.textSecondary }]}>
              {ApiService.hasAnswers()
                ? 'Your completed intake report is ready to be securely linked to your consultation.'
                : 'You can book any specialist directly below without taking the screening assessment. Intake is completely optional.'}
            </Text>
          </View>
          {!ApiService.hasAnswers() && (
            <Pressable
              style={({ pressed }) => [
                styles.takeIntakeChip,
                { backgroundColor: theme.primaryLight, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => router.push('/intake')}
            >
              <Text style={[styles.takeIntakeText, { color: theme.primaryDark }]}>Take Intake</Text>
            </Pressable>
          )}
        </View>

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          <Pressable
            style={[
              styles.filterChip,
              activeFilter === 'all'
                ? { backgroundColor: theme.primary }
                : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
            ]}
            onPress={() => handleFilterChange('all')}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: activeFilter === 'all' ? '#FFFFFF' : theme.textSecondary },
              ]}
            >
              All Specialists
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.filterChip,
              activeFilter === 'urology'
                ? { backgroundColor: theme.primary }
                : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
            ]}
            onPress={() => handleFilterChange('urology')}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: activeFilter === 'urology' ? '#FFFFFF' : theme.textSecondary },
              ]}
            >
              Urologists
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.filterChip,
              activeFilter === 'lab'
                ? { backgroundColor: theme.primary }
                : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
            ]}
            onPress={() => handleFilterChange('lab')}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: activeFilter === 'lab' ? '#FFFFFF' : theme.textSecondary },
              ]}
            >
              Lab & Hormone
            </Text>
          </Pressable>
        </View>

        {/* Doctor Cards or Skeleton Loading State */}
        {isFiltering ? (
          <View style={{ minHeight: 340 }}>
            <LoadingView mode="skeleton" showBack={false} />
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredDoctors.map(doctor => (
              <View
                key={doctor.id}
                style={[
                  styles.doctorCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
              <View style={styles.cardHeader}>
                <View style={styles.doctorInfo}>
                  <Text style={[styles.doctorSpecialty, { color: theme.textSecondary }]}>
                    {doctor.title.split('&')[0].trim()}
                  </Text>
                  <Text style={[styles.doctorName, { color: theme.text }]}>
                    {doctor.name}
                  </Text>

                  <View style={styles.feeRatingRow}>
                    <View style={styles.ratingBox}>
                      <Star size={13} color="#F59E0B" fill="#F59E0B" />
                      <Text style={[styles.ratingText, { color: theme.text }]}>
                        {doctor.rating}
                      </Text>
                      <Text style={[styles.reviewsText, { color: theme.textMuted }]}>
                        ({doctor.reviewsCount})
                      </Text>
                    </View>

                    <Text style={[styles.feeLabel, { color: theme.textSecondary }]}>
                      Visit Fee
                    </Text>
                    <Text style={[styles.feeValue, { color: theme.primary }]}>
                      {doctor.fee}
                    </Text>
                  </View>
                </View>

                {/* Doctor Portrait Image */}
                <Image
                  source={doctor.image}
                  style={styles.doctorImage}
                  resizeMode="cover"
                />
              </View>

              {/* Action Buttons Row */}
              <View style={styles.buttonRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
                  ]}
                  onPress={() => handleBookNow(doctor)}
                >
                  <Text style={styles.primaryButtonText}>Book Now</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => {
                    Alert.alert(
                      doctor.name,
                      `${doctor.title}\n\n${doctor.about}\n\nFacility: ${doctor.facility}\nNext Slot: ${doctor.nextAvailable}`,
                    );
                  }}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                    View Details
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Booking Modal */}
      {selectedDoctor && (
        <Modal
          visible={!!selectedDoctor}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedDoctor(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Schedule Consultation
                </Text>
                <Pressable
                  style={styles.closeModalButton}
                  onPress={() => setSelectedDoctor(null)}
                >
                  <X size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.modalDoctorPreview}>
                <Image
                  source={selectedDoctor.image}
                  style={styles.modalDoctorThumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalDoctorName, { color: theme.text }]}>
                    {selectedDoctor.name}
                  </Text>
                  <Text style={[styles.modalDoctorSpecialty, { color: theme.textSecondary }]}>
                    {selectedDoctor.title}
                  </Text>
                  <View style={styles.facilityRow}>
                    <MapPin size={12} color={theme.primary} />
                    <Text style={[styles.facilityText, { color: theme.primary }]}>
                      {selectedDoctor.facility}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.slotCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.slotRow}>
                  <Calendar size={16} color={theme.textSecondary} />
                  <Text style={[styles.slotText, { color: theme.text }]}>
                    Next Available: {selectedDoctor.nextAvailable}
                  </Text>
                </View>
                <View style={styles.slotRow}>
                  <Clock size={16} color={theme.textSecondary} />
                  <Text style={[styles.slotText, { color: theme.text }]}>
                    Duration: 30-min confidential video review
                  </Text>
                </View>
                <View style={styles.slotRow}>
                  <Sparkles size={16} color={ApiService.hasAnswers() ? theme.primary : theme.textMuted} />
                  <Text style={[styles.slotText, { color: theme.text }]}>
                    {ApiService.hasAnswers()
                      ? 'Screening Context: Report Linked'
                      : 'Screening Context: General Consultation (Direct Booking)'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.mockNotice, { color: theme.textMuted }]}>
                Notice: This booking is simulated for the research prototype (is_mock: true). No payment or personal identifying information is required.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.confirmButton,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
                ]}
                onPress={confirmBooking}
              >
                {bookingConfirmed ? (
                  <View style={styles.confirmedRow}>
                    <CheckCircle2 size={18} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Appointment Confirmed</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmButtonText}>Confirm Simulated Appointment</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
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
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  content: {
    padding: Spacing.lg,
  },
  disclaimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  disclaimerText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  directBookingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  directBookingTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  directBookingDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  takeIntakeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  takeIntakeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    gap: 16,
  },
  doctorCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#072254',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorSpecialty: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  feeRatingRow: {
    gap: 4,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reviewsText: {
    fontSize: 11,
  },
  feeLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  feeValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  doctorImage: {
    width: 100,
    height: 110,
    borderRadius: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066EE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 34, 84, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeModalButton: {
    padding: 6,
  },
  modalDoctorPreview: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalDoctorThumb: {
    width: 60,
    height: 60,
    borderRadius: 16,
  },
  modalDoctorName: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalDoctorSpecialty: {
    fontSize: 12,
    marginTop: 2,
  },
  facilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  facilityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  slotCard: {
    borderRadius: 16,
    padding: 14,
    gap: 8,
    marginBottom: 14,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotText: {
    fontSize: 12,
    fontWeight: '500',
  },
  mockNotice: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 18,
  },
  confirmButton: {
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
