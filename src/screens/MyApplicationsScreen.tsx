import React, { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import AppRefreshControl from '../components/AppRefreshControl';
import colors from '../config/colors';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types';

const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

type Application = {
  application_id: number;
  recruitment_id: number;
  application_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  recruitment_status: 'OPEN' | 'CLOSED';
  post_name: string;
  activity_name?: string | null;
  activity_type?: string | null;
  meeting_type?: string | null;
  activity_period?: string | null;
  offer_status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | null;
};

const STATUS_LABELS: Record<Application['application_status'], string> = {
  PENDING: '검토중',
  APPROVED: '수락됨',
  REJECTED: '반려됨',
  CANCELED: '취소됨',
};

const getStatusLabel = (application: Application) => {
  if (application.offer_status === 'PENDING') return '합류 제안';
  return STATUS_LABELS[application.application_status];
};

export default function MyApplicationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchApplications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await axios.get<Application[]>(`${BASE_URL}/api/my-applications`, {
        headers: { 'x-user-id': String(user.id) },
      });
      setApplications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('나의 지원 조회 오류:', error);
      Alert.alert('조회 실패', '지원한 모집글을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchApplications();
    }, [fetchApplications])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchApplications();
    } finally {
      setRefreshing(false);
    }
  }, [fetchApplications]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={applications.length ? styles.content : styles.emptyContent}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {applications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="paper-plane-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>지원한 모집글이 없어요</Text>
            <Text style={styles.emptyDescription}>매칭 탭에서 함께하고 싶은 팀에 지원해보세요.</Text>
          </View>
        ) : (
          applications.map((application) => (
            <TouchableOpacity
              key={application.application_id}
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('MatchingDetail', { id: application.recruitment_id })}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.statusBadge, styles[`status${application.application_status}`]]}>
                  <Text style={[styles.statusText, styles[`status${application.application_status}Text`]]}>
                    {getStatusLabel(application)}
                  </Text>
                </View>
                <Text style={styles.recruitmentStatus}>
                  {application.recruitment_status === 'OPEN' ? '모집중' : '모집완료'}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>{application.post_name}</Text>
              {application.activity_name ? (
                <Text style={styles.activityName} numberOfLines={1}>{application.activity_name}</Text>
              ) : null}
              <View style={styles.footer}>
                <Text style={styles.meta} numberOfLines={1}>
                  {[application.activity_type, application.meeting_type, application.activity_period]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Icon name="chevron-forward" size={19} color={colors.primary} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 18, paddingBottom: 40 },
  emptyContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center' },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  emptyTitle: { marginTop: 16, color: colors.textMain, fontSize: 17, fontWeight: '800' },
  emptyDescription: { marginTop: 7, color: colors.textSub, fontSize: 13, textAlign: 'center' },
  card: {
    marginBottom: 14,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: { marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '800' },
  statusPENDING: { backgroundColor: '#FFF7E8' },
  statusPENDINGText: { color: '#B54708' },
  statusAPPROVED: { backgroundColor: '#ECFDF3' },
  statusAPPROVEDText: { color: '#027A48' },
  statusREJECTED: { backgroundColor: '#FEF3F2' },
  statusREJECTEDText: { color: '#B42318' },
  statusCANCELED: { backgroundColor: colors.inputBackground },
  statusCANCELEDText: { color: colors.textSub },
  recruitmentStatus: { color: colors.textSub, fontSize: 12, fontWeight: '700' },
  title: { color: colors.textMain, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  activityName: { marginTop: 7, color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  footer: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },
  meta: { flex: 1, marginRight: 8, color: colors.textSub, fontSize: 12 },
});
