import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../config/colors';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';

type Props = {
  teamId?: number | null;
  refreshKey?: number;
};

type RoadmapTodo = {
  todo_id: number | string;
  title: string;
  status: '미진행' | '진행중' | '완료';
  scope_type: '월간' | '주간' | '일일' | '전체';
};

type RoadmapSummary = {
  total_count: number;
  completed_count: number;
  in_progress_count: number;
  pending_count: number;
  percent: number;
};

type RoadmapSegment = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: '미진행' | '진행중' | '완료' | '예정' | '지연';
  summary: RoadmapSummary;
  todos: RoadmapTodo[];
};

type LearningRoadmapData = {
  team_id: number;
  title: string;
  is_generated: boolean;
  summary: RoadmapSummary;
  today_remaining_count: number;
  current_segment_id: string | null;
  current_segment: RoadmapSegment | null;
  next_segment: RoadmapSegment | null;
  segments: RoadmapSegment[];
};

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const API_BASE_URL = __DEV__
  ? (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000')
  : 'https://your.api';

const statusColors: Record<RoadmapSegment['status'], { background: string; text: string }> = {
  미진행: { background: '#F2F4F7', text: '#667085' },
  진행중: { background: colors.primarySurface, text: colors.primaryDark },
  완료: { background: '#ECFDF3', text: '#027A48' },
  예정: { background: '#EFF8FF', text: '#175CD3' },
  지연: { background: '#FEF3F2', text: '#B42318' },
};

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return '기간 미정';
  const compact = (value: string) => {
    const [, month, day] = value.split('-');
    return `${Number(month)}.${Number(day)}`;
  };
  if (!startDate) return `~ ${compact(endDate as string)}`;
  if (!endDate || startDate === endDate) return compact(startDate);
  return `${compact(startDate)} - ${compact(endDate)}`;
}

export default function LearningRoadmap({ teamId, refreshKey }: Props) {
  const { user } = useAuth();
  const navigation = useNavigation<Navigation>();
  const [data, setData] = useState<LearningRoadmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchRoadmap = useCallback(async () => {
    if (!teamId || !user?.id) {
      setData(null);
      setError(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/teams/${teamId}/learning-roadmap`, {
        headers: { 'x-user-id': String(user.id) },
      });
      if (!response.ok) throw new Error(`학습 로드맵 조회 실패 (${response.status})`);
      const payload = await response.json();
      setData(payload && Array.isArray(payload.segments) ? payload : null);
      setError(false);
    } catch (fetchError) {
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [teamId, user?.id]);

  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap, refreshKey]);

  if (!teamId) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>학습 로드맵</Text>

      <View style={styles.card}>
        {loading && !data ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>기존 목표로 로드맵을 구성하고 있어요</Text>
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <View style={styles.stateIcon}>
              <Icon name="cloud-offline-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>로드맵을 불러오지 못했어요</Text>
            <Pressable
              accessibilityRole="button"
              onPress={fetchRoadmap}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : !data || data.summary.total_count === 0 ? (
          <View style={styles.stateBox}>
            <View style={styles.stateIcon}>
              <Icon name="map-outline" size={23} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>아직 구성할 목표가 없어요</Text>
            <Text style={styles.stateText}>주간 또는 일일 목표를 추가하면 학습 순서를 자동으로 보여드려요.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('TodoScreen', { teamId })}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Icon name="add" size={17} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>목표 추가</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.roadmapTitle} numberOfLines={2}>{data.title}</Text>
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{data.summary.percent}%</Text>
                <Text style={styles.metricLabel}>전체 진행률</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{data.summary.completed_count}</Text>
                <Text style={styles.metricLabel}>완료 목표</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{data.today_remaining_count}</Text>
                <Text style={styles.metricLabel}>오늘 진행</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${data.summary.percent}%` }]} />
            </View>

            <ScrollView
              accessibilityLabel="학습 로드맵 구간 목록"
              style={styles.timelineViewport}
              contentContainerStyle={styles.timeline}
              nestedScrollEnabled
              persistentScrollbar
              showsVerticalScrollIndicator
            >
              {data.segments.map((segment, index) => {
                const isCurrent = segment.id === data.current_segment_id;
                const palette = statusColors[segment.status];
                return (
                  <View key={segment.id} style={styles.segmentRow}>
                    <View style={styles.timelineRail}>
                      <View style={[
                        styles.timelineDot,
                        isCurrent && styles.timelineDotCurrent,
                        segment.status === '완료' && styles.timelineDotDone,
                      ]}>
                        {segment.status === '완료' ? (
                          <Icon name="checkmark" size={11} color="#FFFFFF" />
                        ) : isCurrent ? (
                          <View style={styles.timelineDotCenter} />
                        ) : null}
                      </View>
                      {index < data.segments.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={[styles.segmentCard, isCurrent && styles.segmentCardCurrent]}>
                      <View style={styles.segmentHeader}>
                        <Text style={[styles.segmentTitle, isCurrent && styles.segmentTitleCurrent]} numberOfLines={2}>
                          {segment.title}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: palette.background }]}>
                          <Text style={[styles.statusText, { color: palette.text }]}>{segment.status}</Text>
                        </View>
                      </View>
                      <View style={styles.segmentMetaRow}>
                        <Text style={styles.segmentMeta}>
                          {formatDateRange(segment.start_date, segment.end_date)}
                        </Text>
                        <Text style={styles.segmentMeta}>
                          {segment.summary.completed_count}/{segment.summary.total_count} 완료
                        </Text>
                        <Text style={styles.segmentPercent}>{segment.summary.percent}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="목표 관리 화면으로 이동"
              onPress={() => navigation.navigate('TodoScreen', { teamId })}
              style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
            >
              <Text style={styles.manageButtonText}>목표에서 관리</Text>
              <Icon name="arrow-forward" size={16} color={colors.primaryDark} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
  },
  heading: {
    marginBottom: 12,
    color: colors.textMain,
    fontSize: 24,
    fontWeight: '900',
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: '#E9E4FC',
    borderRadius: 24,
    backgroundColor: '#FCFBFF',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  stateBox: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  stateIcon: {
    width: 48,
    height: 48,
    marginBottom: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  stateTitle: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateText: {
    marginTop: 7,
    color: colors.textSub,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 13,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.primarySurface,
  },
  retryText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
  roadmapTitle: {
    color: colors.textMain,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '900',
  },
  metricsRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 27,
    backgroundColor: colors.border,
  },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  metricLabel: {
    marginTop: 3,
    color: colors.textSub,
    fontSize: 10,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    marginTop: 17,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#ECE8F8',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  timelineViewport: {
    marginTop: 20,
    maxHeight: 286,
  },
  timeline: {
    paddingRight: 4,
    paddingBottom: 2,
  },
  segmentRow: {
    flexDirection: 'row',
  },
  timelineRail: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: '#D0D5DD',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    zIndex: 1,
  },
  timelineDotCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  timelineDotCenter: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  timelineDotDone: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 62,
    backgroundColor: '#E4DFF4',
  },
  segmentCard: {
    flex: 1,
    minHeight: 64,
    marginLeft: 8,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  segmentCardCurrent: {
    borderWidth: 1,
    borderColor: '#D9CEFF',
    backgroundColor: colors.primarySurface,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentTitle: {
    flex: 1,
    marginRight: 8,
    color: colors.textMain,
    fontSize: 14,
    fontWeight: '800',
  },
  segmentTitleCurrent: {
    color: colors.primaryDark,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  segmentMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentMeta: {
    marginRight: 10,
    color: colors.textSub,
    fontSize: 10,
    fontWeight: '700',
  },
  segmentPercent: {
    marginLeft: 'auto',
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  manageButton: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E9E4FC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  manageButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});
