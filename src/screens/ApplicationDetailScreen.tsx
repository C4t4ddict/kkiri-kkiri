import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenState from '../components/ScreenState';
import colors from '../config/colors';
import type { RootStackParamList } from '../types';

type DetailRoute = RouteProp<RootStackParamList, 'ApplicationDetail'>;
type Navigation = StackNavigationProp<RootStackParamList>;
type TimelineStep = { key: string; label: string; state: 'completed' | 'current' | 'upcoming' | 'skipped'; occurred_at?: string | null };
type ApplicationDetail = {
  application_id: number;
  recruitment_id: number;
  memo: string;
  application_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  post_name: string;
  activity_name?: string;
  activity_type?: string;
  meeting_type?: string;
  activity_period?: string;
  offer_id?: number | null;
  offer_status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | null;
  timeline: TimelineStep[];
};

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default function ApplicationDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Navigation>();
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/my-applications/${route.params.applicationId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '지원 현황을 불러오지 못했습니다');
      setDetail(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '지원 현황을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [route.params.applicationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const request = async (path: string, body?: Record<string, unknown>) => {
    setProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다');
      await load();
    } catch (requestError) {
      Alert.alert('처리 실패', requestError instanceof Error ? requestError.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading && !detail) return <ScreenState kind="loading" title="지원 진행 상황을 확인하고 있어요" />;
  if (!detail || error) return <ScreenState kind="error" title={error || '지원 내역이 없습니다'} onRetry={load} />;

  const canCancel = ['PENDING', 'APPROVED'].includes(detail.application_status);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>APPLICATION STATUS</Text>
          <Text style={styles.title}>{detail.post_name}</Text>
          <Text style={styles.activity}>{detail.activity_name}</Text>
          <View style={styles.metaRow}>
            {[detail.activity_type, detail.meeting_type, detail.activity_period].filter(Boolean).map((item) => <Text key={item} style={styles.metaBadge}>{item}</Text>)}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>PROGRESS</Text>
          <Text style={styles.sectionTitle}>지원 진행 상황</Text>
          {detail.timeline.map((step, index) => (
            <View key={`${step.key}-${index}`} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.dot, step.state === 'completed' && styles.dotCompleted, step.state === 'current' && styles.dotCurrent]}>
                  {step.state === 'completed' ? <Icon name="checkmark" size={12} color="#FFFFFF" /> : null}
                </View>
                {index < detail.timeline.length - 1 ? <View style={[styles.line, step.state === 'completed' && styles.lineCompleted]} /> : null}
              </View>
              <View style={styles.timelineCopy}>
                <Text style={[styles.stepLabel, step.state === 'upcoming' && styles.stepMuted]}>{step.label}</Text>
                {step.state === 'current' ? <Text style={styles.currentLabel}>현재 단계</Text> : null}
                {step.occurred_at ? <Text style={styles.stepDate}>{dateLabel(step.occurred_at)}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>SUBMITTED MESSAGE</Text>
          <Text style={styles.sectionTitle}>제출한 지원 내용</Text>
          <Text style={styles.memo}>{detail.memo}</Text>
        </View>

        <Pressable onPress={() => navigation.navigate('MatchingDetail', { id: detail.recruitment_id })} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>모집글 보기</Text><Icon name="arrow-forward" size={18} color={colors.primary} />
        </Pressable>

        {detail.offer_id && detail.offer_status === 'PENDING' ? (
          <View style={styles.offerActions}>
            <Pressable disabled={processing} onPress={() => request(`/api/team-join-offers/${detail.offer_id}/respond`, { decision: 'REJECTED' })} style={styles.rejectButton}><Text style={styles.rejectText}>거절</Text></Pressable>
            <Pressable disabled={processing} onPress={() => request(`/api/team-join-offers/${detail.offer_id}/respond`, { decision: 'ACCEPTED' })} style={styles.acceptButton}><Text style={styles.acceptText}>{processing ? '처리 중' : '팀 합류하기'}</Text></Pressable>
          </View>
        ) : canCancel ? (
          <Pressable disabled={processing} onPress={() => request(`/api/applications/${detail.application_id}/cancel`)} style={styles.cancelButton}><Text style={styles.cancelText}>{processing ? '처리 중' : '지원 취소'}</Text></Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 18, paddingBottom: 40 },
  hero: { padding: 22, borderRadius: 24, backgroundColor: colors.primaryDark },
  eyebrow: { color: '#D9D1FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  title: { marginTop: 9, color: '#FFFFFF', fontSize: 23, lineHeight: 31, fontWeight: '900' },
  activity: { marginTop: 8, color: '#DDD6FE', fontSize: 13, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  metaBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, overflow: 'hidden', color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.14)', fontSize: 10, fontWeight: '800' },
  card: { marginTop: 14, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 21, backgroundColor: '#FFFFFF' },
  sectionEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  sectionTitle: { marginTop: 6, marginBottom: 16, color: colors.textMain, fontSize: 18, fontWeight: '900' },
  timelineRow: { minHeight: 67, flexDirection: 'row' },
  timelineRail: { width: 28, alignItems: 'center' },
  dot: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#D0D5DD', borderRadius: 9, backgroundColor: '#FFFFFF' },
  dotCompleted: { borderColor: colors.primary, backgroundColor: colors.primary },
  dotCurrent: { borderWidth: 5, borderColor: '#D9D1FF', backgroundColor: colors.primary },
  line: { flex: 1, width: 2, backgroundColor: '#EAECF0' },
  lineCompleted: { backgroundColor: '#C7B9FF' },
  timelineCopy: { flex: 1, paddingLeft: 8 },
  stepLabel: { color: colors.textMain, fontSize: 14, fontWeight: '800' },
  stepMuted: { color: '#98A2B3' },
  currentLabel: { marginTop: 3, color: colors.primary, fontSize: 10, fontWeight: '900' },
  stepDate: { marginTop: 4, color: colors.textSub, fontSize: 10 },
  memo: { color: colors.textSub, fontSize: 13, lineHeight: 22 },
  secondaryButton: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, borderWidth: 1, borderColor: '#D9D1FF', borderRadius: 15, backgroundColor: '#FFFFFF' },
  secondaryText: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  offerActions: { flexDirection: 'row', gap: 9, marginTop: 11 },
  rejectButton: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#F2F4F7' },
  rejectText: { color: colors.textSub, fontSize: 14, fontWeight: '900' },
  acceptButton: { flex: 2, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primary },
  acceptText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  cancelButton: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 11, borderRadius: 15, backgroundColor: '#FEF3F2' },
  cancelText: { color: '#B42318', fontSize: 14, fontWeight: '900' },
});
