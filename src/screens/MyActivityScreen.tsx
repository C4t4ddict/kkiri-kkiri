import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import colors from '../config/colors';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type PastActivity = {
  portfolio_id: number;
  team_id: number;
  activity_name: string;
  activity_type: string;
  role: string;
  period: string;
  completed_task_count: number;
  archived_at: string;
};

const API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';

const formatArchivedDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} 저장`;
};

export default function MyActivityScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const [activities, setActivities] = useState<PastActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchPastActivities = useCallback(async (isRefresh = false) => {
    if (!user?.id) {
      setActivities([]);
      setLoading(false);
      return;
    }

    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/past-activities`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '지난 활동을 불러오지 못했습니다');
      setActivities(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '지난 활동을 불러오지 못했습니다');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchPastActivities();
    }, [fetchPastActivities]),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>지난 활동을 정리하고 있어요</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={activities}
        keyExtractor={(item) => String(item.portfolio_id)}
        contentContainerStyle={[styles.content, activities.length === 0 && styles.emptyContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchPastActivities(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={activities.length ? (
          <View style={styles.heroCard}>
            <View style={styles.heroIconBox}>
              <Icon name="folder-open-outline" size={25} color={colors.primary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>ACTIVITY ARCHIVE</Text>
              <Text style={styles.heroTitle}>완료한 경험을 다시 꺼내보세요</Text>
              <Text style={styles.heroDescription}>
                역할과 완료 작업을 미니포트폴리오로 정리했습니다.
              </Text>
            </View>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Icon name="archive-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{error || '아직 지난 활동이 없어요'}</Text>
            <Text style={styles.emptyDescription}>
              활동 기간이 끝나거나 팀장이 마무리하면 이곳에 자동으로 저장됩니다.
            </Text>
            {error ? (
              <Pressable onPress={() => fetchPastActivities()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>다시 불러오기</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('MiniPortfolioScreen', { portfolioId: item.portfolio_id })}
            style={({ pressed }) => [styles.activityCard, pressed && styles.activityCardPressed]}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{item.activity_type || '팀 활동'}</Text>
              </View>
              <Text style={styles.archivedDate}>{formatArchivedDate(item.archived_at)}</Text>
            </View>
            <Text style={styles.activityTitle}>{item.activity_name}</Text>
            <View style={styles.metaRow}>
              <Icon name="person-outline" size={15} color={colors.textSub} />
              <Text style={styles.metaText}>{item.role || '역할 미정'}</Text>
              <View style={styles.metaDivider} />
              <Icon name="calendar-clear-outline" size={15} color={colors.textSub} />
              <Text style={styles.metaText}>{item.period || '기간 미정'}</Text>
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.taskSummary}>
                <Icon name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.taskSummaryText}>완료 작업 {item.completed_task_count || 0}개</Text>
              </View>
              <View style={styles.openButton}>
                <Text style={styles.openButtonText}>미니포트폴리오</Text>
                <Icon name="chevron-forward" size={16} color={colors.primary} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 20, paddingBottom: 48 },
  emptyContent: { flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FC' },
  loadingText: { marginTop: 13, color: colors.textSub, fontSize: 14 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DED7FF',
    borderRadius: 22,
    backgroundColor: colors.primarySurface,
  },
  heroIconBox: {
    width: 52,
    height: 52,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
  },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  heroTitle: { marginTop: 4, color: colors.textMain, fontSize: 17, fontWeight: '900' },
  heroDescription: { marginTop: 5, color: colors.textSub, fontSize: 12, lineHeight: 18 },
  activityCard: {
    marginBottom: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  activityCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.primarySurface },
  typeBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  archivedDate: { color: '#98A2B3', fontSize: 11 },
  activityTitle: { marginTop: 13, color: colors.textMain, fontSize: 20, fontWeight: '900', lineHeight: 28 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 6 },
  metaText: { color: colors.textSub, fontSize: 12 },
  metaDivider: { width: 1, height: 13, marginHorizontal: 3, backgroundColor: colors.border },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 17,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  taskSummary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskSummaryText: { color: colors.textMain, fontSize: 12, fontWeight: '700' },
  openButton: { flexDirection: 'row', alignItems: 'center' },
  openButtonText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIconBox: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: colors.primarySurface,
  },
  emptyTitle: { marginTop: 20, color: colors.textMain, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  emptyDescription: { marginTop: 9, color: colors.textSub, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: 20, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 13, backgroundColor: colors.primary },
  retryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
