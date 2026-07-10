// src/screens/MatchingDetailScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import axios from 'axios';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

type RootStackParamList = {
  RecruitDetail: { id: number };
};

type Recruitment = {
  recruitment_id: number;
  owner_user_id: number;
  activity_name: string;
  activity_type: string;
  activity_period?: string;
  meeting_type?: string; // '대면' | '비대면' | '혼합'
  required_members: number;
  memo?: string;
  created_at?: string;
  // 자격 조건 등 필요시 추가
};

type Application = {
  application_id: number;
  recruitment_id: number;
  applicant_id: number;
  memo?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  created_at: string;
  // 아래는 클라이언트에서 합친 정보
  applicant?: {
    id: number;
    name: string;
    department?: string;
    profile_picture?: string;
  };
};

type RouteProps = RouteProp<RootStackParamList, 'RecruitDetail'>;

const MatchingDetailScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProps>();
  const { user: me } = useAuth();

  const [recruit, setRecruit] = useState<Recruitment | null>(null);
  const [owner, setOwner] = useState<any>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [intro, setIntro] = useState(''); // 일반 사용자 자기소개
  const [loading, setLoading] = useState(false);

  const isOwner = useMemo(
    () => recruit && me?.id && recruit.owner_user_id === me.id,
    [recruit, me?.id]
  );

  const fetchDetail = async () => {
    try {
      const r = await axios.get(`${BASE_URL}/api/team-recruitments/${route.params.id}`);
      setRecruit(r.data);

      // 작성자 프로필
      const u = await axios.get(`${BASE_URL}/api/user/${r.data.owner_user_id}`);
      setOwner(u.data.user);

      // 지원 목록(작성자/일반 공통으로 필요)
      const a = await axios.get(`${BASE_URL}/api/team-recruitments/${route.params.id}/applications`);
      const list: Application[] = a.data || [];

      // 지원자 상세 붙이기(가벼운 N회 호출; 필요시 서버 join으로 대체 가능)
      const enriched = await Promise.all(
        list.map(async (ap: Application) => {
          try {
            const ures = await axios.get(`${BASE_URL}/api/user/${ap.applicant_id}`);
            return { ...ap, applicant: ures.data.user };
          } catch {
            return ap;
          }
        })
      );
      setApps(enriched);
    } catch (e) {
      console.error('상세 조회 오류:', e);
      Alert.alert('오류', '상세 정보를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [route.params.id]);

  // 뒤로갔다가 다시 들어오거나, 승인/반려 후 갱신
  useFocusEffect(
    useCallback(() => {
      fetchDetail();
    }, [route.params.id])
  );

  const alreadyApplied = useMemo(() => {
    if (!me?.id) return false;
    return apps.some(a => a.applicant_id === me.id && a.status !== 'REJECTED' && a.status !== 'CANCELED');
  }, [apps, me?.id]);

  const currentCount = useMemo(() => {
    return apps.reduce((acc, a) => acc + (a.status === 'REJECTED' || a.status === 'CANCELED' ? 0 : 1), 0);
  }, [apps]);

  const handleApply = async () => {
    if (!me?.id) {
      Alert.alert('알림', '로그인이 필요합니다.');
      return;
    }
    if (alreadyApplied) {
      Alert.alert('알림', '이미 신청한 모집글입니다.');
      return;
    }
    try {
      setLoading(true);
      await axios.post(`${BASE_URL}/api/applications`, {
        recruitment_id: route.params.id,
        applicant_id: me.id,
        memo: intro,
        status: 'PENDING',
      });
      Alert.alert('완료', '지원이 등록되었습니다.');
      setIntro('');
      fetchDetail();
    } catch (e) {
      console.error('지원 오류:', e);
      Alert.alert('오류', '지원에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const updateAppStatus = async (application_id: number, status: 'APPROVED' | 'REJECTED') => {
    try {
      setLoading(true);
      // 권장: 상태 변경 API
      await axios.put(`${BASE_URL}/api/applications/${application_id}/status`, { status });
      fetchDetail();
    } catch (e) {
      console.error('상태 변경 오류:', e);
      Alert.alert('오류', '상태 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!recruit) return null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={24} color="#101828" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>팀 찾기</Text>
        <View style={{ width: 24 }} />
      </View> */}

      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingTop: 16 }}>
        {/* 제목 */}
        <Text style={styles.title}>{recruit.activity_name}</Text>

        {/* 작성자 요약 */}
        <View style={styles.metaRow}>
          <Image
            source={{ uri: owner?.profile_picture || 'https://via.placeholder.com/56' }}
            style={styles.avatar}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerName}>{owner?.name || '작성자'}</Text>
            <Text style={styles.ownerSub}>{timeAgo(recruit.created_at)} 전</Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.badge}>
              {recruit.activity_type || '-'} | {recruit.meeting_type || '-'} | {recruit.activity_period || '-'}
            </Text>
            <Text style={styles.headcount}>인원 : [{currentCount}/{recruit.required_members}]</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* 본문(메모) */}
        {recruit.memo ? (
          <Text style={styles.body}>{recruit.memo}</Text>
        ) : (
          <Text style={styles.body}>상세 설명이 없습니다.</Text>
        )}

        {/* --- 일반 사용자 뷰 --- */}
        {!isOwner && (
          <>
            <View style={styles.inputBox}>
              <TextInput
                placeholder="본인에 대해 알려주세요"
                placeholderTextColor="#98A2B3"
                value={intro}
                onChangeText={setIntro}
                style={styles.input}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (alreadyApplied || loading) && { opacity: 0.6 }]}
              onPress={handleApply}
              disabled={alreadyApplied || loading}
            >
              <Text style={styles.primaryBtnText}>
                {alreadyApplied ? '이미 지원함' : '지원하기'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* --- 작성자 뷰 --- */}
        {isOwner && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            {apps.length === 0 ? (
              <Text style={{ color: '#475467' }}>아직 신청자가 없습니다.</Text>
            ) : (
              apps
                .sort((a, b) => (a.status === 'PENDING' ? -1 : 1) - (b.status === 'PENDING' ? -1 : 1))
                .map((a) => (
                <View key={a.application_id} style={styles.appCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image
                      source={{ uri: a.applicant?.profile_picture || 'https://via.placeholder.com/40' }}
                      style={styles.appAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.appTitle}>
                        {(a.applicant?.department ? `${a.applicant.department} ` : '') + (a.applicant?.name || `user#${a.applicant_id}`)}
                      </Text>
                      <Text style={styles.appSub}>{timeAgo(a.created_at)} 전 · 상태: {labelStatus(a.status)}</Text>
                    </View>
                  </View>
                  {a.memo ? <Text style={styles.appMemo}>{a.memo}</Text> : null}

                  <View style={styles.appButtons}>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.acceptBtn, loading && { opacity: 0.6 }]}
                      onPress={() => updateAppStatus(a.application_id, 'APPROVED')}
                      disabled={loading || a.status === 'APPROVED'}
                    >
                      <Text style={[styles.smallBtnText, styles.acceptText]}>수락</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.rejectBtn, loading && { opacity: 0.6 }]}
                      onPress={() => updateAppStatus(a.application_id, 'REJECTED')}
                      disabled={loading || a.status === 'REJECTED'}
                    >
                      <Text style={styles.smallBtnText}>반려</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default MatchingDetailScreen;

/* ---------- helpers & styles ---------- */
function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간`;
  const d = Math.floor(h / 24);
  return `${d}일`;
}
function labelStatus(s: Application['status']) {
  return s === 'PENDING' ? '대기' : s === 'APPROVED' ? '수락' : s === 'REJECTED' ? '반려' : '취소';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#101828' },

  title: { fontSize: 22, fontWeight: '800', color: '#101828', paddingHorizontal: 16, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: '#E5E7EB' },
  ownerName: { fontSize: 16, fontWeight: '700', color: '#101828' },
  ownerSub: { fontSize: 13, color: '#667085', marginTop: 2 },
  badge: { fontSize: 13, color: '#475467' },
  headcount: { fontSize: 13, color: '#475467', marginTop: 6 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 16, marginHorizontal: 16 },
  body: { color: '#101828', fontSize: 15, paddingHorizontal: 16, lineHeight: 22 },

  inputBox: {
    backgroundColor: '#F2F4F7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 16, marginTop: 20, height: 140,
  },
  input: { flex: 1, fontSize: 15, color: '#101828', textAlignVertical: 'top' },
  primaryBtn: {
    marginHorizontal: 16, marginTop: 14, backgroundColor: '#7A5AF8',
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  appCard: {
    backgroundColor: '#F3F4F6', borderRadius: 18, padding: 14, marginBottom: 12,
  },
  appAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#E5E7EB' },
  appTitle: { fontSize: 14, color: '#101828', fontWeight: '800' },
  appSub: { fontSize: 12, color: '#667085', marginTop: 2 },
  appMemo: { marginTop: 8, color: '#101828', fontSize: 14, lineHeight: 20 },
  appButtons: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 10 },
  smallBtn: { minWidth: 90, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  acceptBtn: { backgroundColor: '#E9D7FE' },
  acceptText: { color: '#7A5AF8', fontWeight: '800' },
  rejectBtn: { backgroundColor: '#D1D5DB' },
});