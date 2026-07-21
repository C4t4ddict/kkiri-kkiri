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

type Recruitment = {
  recruitment_id: number;
  post_name: string;
  activity_name?: string | null;
  activity_type?: string | null;
  meeting_type?: string | null;
  activity_period?: string | null;
  required_members: number;
  application_count: number;
  status: 'OPEN' | 'CLOSED';
  can_edit: number | boolean;
};

export default function MyRecruitmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchRecruitments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await axios.get<Recruitment[]>(`${BASE_URL}/api/my-recruitments`, {
        headers: { 'x-user-id': String(user.id) },
      });
      setRecruitments(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('나의 모집 조회 오류:', error);
      Alert.alert('조회 실패', error?.response?.data?.message || '작성한 모집글을 불러오지 못했습니다.');
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchRecruitments();
    }, [fetchRecruitments])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchRecruitments();
    } finally {
      setRefreshing(false);
    }
  }, [fetchRecruitments]);

  const deleteRecruitment = useCallback((recruitment: Recruitment) => {
    Alert.alert(
      '모집글 삭제',
      `“${recruitment.post_name}” 모집글을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id || deletingId) return;
            setDeletingId(recruitment.recruitment_id);
            try {
              await axios.delete(`${BASE_URL}/api/team-recruitments/${recruitment.recruitment_id}`, {
                headers: { 'x-user-id': String(user.id) },
              });
              setRecruitments((items) =>
                items.filter((item) => item.recruitment_id !== recruitment.recruitment_id)
              );
            } catch (error: any) {
              Alert.alert('삭제 실패', error?.response?.data?.message || '모집글을 삭제하지 못했습니다.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }, [deletingId, user?.id]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={recruitments.length ? styles.content : styles.emptyContent}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {recruitments.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="megaphone-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>작성한 모집글이 없어요</Text>
            <Text style={styles.emptyDescription}>매칭 탭에서 팀 모집글을 작성해보세요.</Text>
          </View>
        ) : (
          recruitments.map((recruitment) => {
            const editable = Boolean(Number(recruitment.can_edit));
            const isDeleting = deletingId === recruitment.recruitment_id;
            return (
              <View key={recruitment.recruitment_id} style={styles.card}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('MatchingDetail', { id: recruitment.recruitment_id })}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.statusBadge, recruitment.status === 'CLOSED' && styles.closedBadge]}>
                      <Text style={[styles.statusText, recruitment.status === 'CLOSED' && styles.closedText]}>
                        {recruitment.status === 'OPEN' ? '모집중' : '모집완료'}
                      </Text>
                    </View>
                    <Text style={styles.applicationCount}>지원 {Number(recruitment.application_count || 0)}명</Text>
                  </View>
                  <Text style={styles.title} numberOfLines={2}>{recruitment.post_name}</Text>
                  {recruitment.activity_name ? (
                    <Text style={styles.activityName} numberOfLines={1}>{recruitment.activity_name}</Text>
                  ) : null}
                  <Text style={styles.meta} numberOfLines={1}>
                    {[recruitment.activity_type, recruitment.meeting_type, recruitment.activity_period]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </TouchableOpacity>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionButton, !editable && styles.disabledButton]}
                    disabled={!editable}
                    onPress={() => navigation.navigate('TeamMake', {
                      user: user || undefined,
                      recruitmentId: recruitment.recruitment_id,
                    })}
                  >
                    <Icon name="create-outline" size={17} color={editable ? colors.primary : '#98A2B3'} />
                    <Text style={[styles.editText, !editable && styles.disabledText]}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    disabled={isDeleting}
                    onPress={() => deleteRecruitment(recruitment)}
                  >
                    <Icon name="trash-outline" size={17} color="#D92D20" />
                    <Text style={styles.deleteText}>{isDeleting ? '삭제 중' : '삭제'}</Text>
                  </TouchableOpacity>
                </View>
                {!editable && recruitment.status === 'OPEN' ? (
                  <Text style={styles.editHint}>접수 마감이 지난 모집글은 수정할 수 없습니다.</Text>
                ) : null}
              </View>
            );
          })
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
  emptyDescription: { marginTop: 7, color: colors.textSub, fontSize: 13 },
  card: {
    marginBottom: 14,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: { marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.primarySurface },
  closedBadge: { backgroundColor: colors.inputBackground },
  statusText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  closedText: { color: colors.textSub },
  applicationCount: { color: colors.textSub, fontSize: 12, fontWeight: '700' },
  title: { color: colors.textMain, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  activityName: { marginTop: 7, color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  meta: { marginTop: 8, color: colors.textSub, fontSize: 12 },
  actions: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primarySurface,
  },
  disabledButton: { backgroundColor: colors.inputBackground },
  editText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  deleteText: { color: '#D92D20', fontSize: 13, fontWeight: '800' },
  disabledText: { color: '#98A2B3' },
  editHint: { marginTop: 9, color: colors.textSub, fontSize: 11, textAlign: 'center' },
});
