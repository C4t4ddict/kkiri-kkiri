import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenState from '../components/ScreenState';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

type Activity = {
  activity_id: number;
  title: string;
  organizer?: string;
  category?: string;
  topic_category?: string;
  main_image_url?: string;
  source_name?: string;
  is_hidden: number;
};

type Overview = {
  counts: {
    total_activities?: number;
    missing_image_count?: number;
    hidden_count?: number;
    duplicate_group_count?: number;
  };
  crawlerRuns: any[];
  crawlerErrors: any[];
  crawlerRunning: boolean;
};

const filters = [
  ['all', '전체'],
  ['missing_image', '이미지 누락'],
  ['duplicates', '중복 의심'],
  ['hidden', '숨김'],
] as const;

export default function AdminScreen() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [quality, setQuality] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Activity | null>(null);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${path}`, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '운영 정보를 처리하지 못했습니다');
    return data;
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!user?.is_admin) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ quality, search: search.trim() }).toString();
      const [overviewData, activityData] = await Promise.all([
        request('/api/admin/overview'),
        request(`/api/admin/activities?${query}`),
      ]);
      setOverview(overviewData);
      setActivities(activityData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '운영 정보를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [quality, request, search, user?.is_admin]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const updateActivity = async (activityId: number, body: Record<string, unknown>) => {
    await request(`/api/admin/activities/${activityId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load(true);
  };

  const runCrawler = async () => {
    try {
      const data = await request('/api/admin/crawler/run', { method: 'POST' });
      Alert.alert('수집 시작', data.message);
      await load(true);
    } catch (runError) {
      Alert.alert('실행 실패', runError instanceof Error ? runError.message : '크롤러를 실행하지 못했습니다');
    }
  };

  if (!user?.is_admin) {
    return <ScreenState kind="error" title="운영자 권한이 필요합니다" description="관리자로 지정된 계정만 이 화면을 사용할 수 있습니다." />;
  }
  if (loading && !overview) return <ScreenState kind="loading" title="운영 현황을 확인하고 있어요" />;
  if (error && !overview) return <ScreenState kind="error" title={error} onRetry={() => load()} />;

  const countCards = [
    ['전체 활동', overview?.counts.total_activities || 0, 'albums-outline'],
    ['이미지 누락', overview?.counts.missing_image_count || 0, 'image-outline'],
    ['중복 그룹', overview?.counts.duplicate_group_count || 0, 'copy-outline'],
    ['숨김 처리', overview?.counts.hidden_count || 0, 'eye-off-outline'],
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View style={styles.hero}>
          <View>
            <Text style={styles.heroEyebrow}>OPERATIONS</Text>
            <Text style={styles.heroTitle}>서비스 운영 현황</Text>
            <Text style={styles.heroSubtitle}>수집 상태와 활동 데이터 품질을 관리합니다.</Text>
          </View>
          <Pressable style={styles.crawlerButton} onPress={runCrawler}>
            <Icon name={overview?.crawlerRunning ? 'sync' : 'refresh'} size={18} color="#FFFFFF" />
            <Text style={styles.crawlerButtonText}>{overview?.crawlerRunning ? '수집 중' : '지금 수집'}</Text>
          </Pressable>
        </View>

        <View style={styles.countGrid}>
          {countCards.map(([label, value, icon]) => (
            <View key={String(label)} style={styles.countCard}>
              <Icon name={String(icon)} size={20} color={colors.primary} />
              <Text style={styles.countValue}>{String(value)}</Text>
              <Text style={styles.countLabel}>{String(label)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>활동 데이터 관리</Text>
          <Text style={styles.sectionCount}>{activities.length}개 표시</Text>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="활동명, 주최기관, 수집처 검색"
          placeholderTextColor="#98A2B3"
          style={styles.searchInput}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map(([key, label]) => (
            <Pressable key={key} onPress={() => setQuality(key)} style={[styles.filter, quality === key && styles.filterSelected]}>
              <Text style={[styles.filterText, quality === key && styles.filterTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {activities.map((activity) => (
          <View key={activity.activity_id} style={styles.activityCard}>
            <View style={styles.activityCopy}>
              <Text style={styles.activityTitle} numberOfLines={2}>{activity.title}</Text>
              <Text style={styles.activityMeta} numberOfLines={1}>
                {[activity.source_name, activity.organizer, activity.topic_category || activity.category].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.flags}>
                {!activity.main_image_url ? <Flag label="이미지 누락" tone="warning" /> : null}
                {activity.is_hidden ? <Flag label="숨김" tone="neutral" /> : null}
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.iconButton} onPress={() => setEditing(activity)}>
                <Icon name="create-outline" size={19} color={colors.primary} />
              </Pressable>
              <Pressable
                style={styles.iconButton}
                onPress={() => updateActivity(activity.activity_id, { is_hidden: !activity.is_hidden }).catch((updateError) => Alert.alert(
                  '처리 실패',
                  updateError instanceof Error ? updateError.message : '활동 상태를 변경하지 못했습니다',
                ))}
              >
                <Icon name={activity.is_hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={activity.is_hidden ? colors.primary : '#D92D20'} />
              </Pressable>
            </View>
          </View>
        ))}
        {!activities.length ? <ScreenState kind="empty" title="해당 조건의 활동이 없습니다" /> : null}

        <Text style={styles.sectionTitle}>최근 수집 실행</Text>
        {(overview?.crawlerRuns || []).map((run) => (
          <View key={run.run_id} style={styles.runRow}>
            <View style={[
              styles.statusDot,
              run.status === 'completed'
                ? styles.statusCompleted
                : run.status === 'running'
                  ? styles.statusRunning
                  : styles.statusWarning,
            ]} />
            <View style={styles.runCopy}>
              <Text style={styles.runTitle}>{run.source_name} · {run.status}</Text>
              <Text style={styles.runMeta}>발견 {run.discovered_count} · 저장 {run.saved_count} · 오류 {run.error_count}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>최근 수집 오류</Text>
        {(overview?.crawlerErrors || []).slice(0, 10).map((item) => (
          <View key={item.error_id} style={styles.errorCard}>
            <Text style={styles.errorTitle}>{item.source_name} · {item.stage}</Text>
            <Text style={styles.errorMessage} numberOfLines={3}>{item.error_message}</Text>
          </View>
        ))}
        {!overview?.crawlerErrors?.length ? <Text style={styles.noErrors}>최근 수집 오류가 없습니다.</Text> : null}
      </ScrollView>

      <EditActivityModal
        activity={editing}
        onClose={() => setEditing(null)}
        onSave={async (activityId, values) => {
          await updateActivity(activityId, values);
          setEditing(null);
        }}
      />
    </View>
  );
}

function Flag({ label, tone }: { label: string; tone: 'warning' | 'neutral' }) {
  return <Text style={[styles.flag, tone === 'warning' ? styles.flagWarning : styles.flagNeutral]}>{label}</Text>;
}

function EditActivityModal({ activity, onClose, onSave }: {
  activity: Activity | null;
  onClose: () => void;
  onSave: (activityId: number, values: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [topicCategory, setTopicCategory] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(activity?.title || '');
    setCategory(activity?.category || '');
    setTopicCategory(activity?.topic_category || '');
    setImage(activity?.main_image_url || '');
  }, [activity]);

  const submit = async () => {
    if (!activity || !title.trim()) return;
    setSaving(true);
    try {
      await onSave(activity.activity_id, { title, category, topic_category: topicCategory, main_image_url: image });
    } catch (error) {
      Alert.alert('저장 실패', error instanceof Error ? error.message : '활동을 수정하지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={Boolean(activity)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>활동 정보 수정</Text>
            <Pressable onPress={onClose}><Icon name="close" size={24} color="#344054" /></Pressable>
          </View>
          <AdminField label="활동명" value={title} onChangeText={setTitle} />
          <AdminField label="대분류" value={category} onChangeText={setCategory} />
          <AdminField label="세부 분류" value={topicCategory} onChangeText={setTopicCategory} />
          <AdminField label="포스터 URL" value={image} onChangeText={setImage} />
          <Pressable disabled={saving} onPress={submit} style={styles.modalSave}>
            <Text style={styles.modalSaveText}>{saving ? '저장 중' : '수정 저장'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AdminField({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.modalField}><Text style={styles.modalLabel}>{label}</Text><TextInput {...props} style={styles.modalInput} placeholderTextColor="#98A2B3" /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 18, paddingBottom: 50 },
  hero: { padding: 20, borderRadius: 22, backgroundColor: colors.primaryDark },
  heroEyebrow: { color: '#D9D1FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  heroTitle: { marginTop: 7, color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  heroSubtitle: { marginTop: 7, color: '#D9D1FF', fontSize: 12 },
  crawlerButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: colors.primary },
  crawlerButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 18 },
  countCard: { width: '48.5%', padding: 16, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 18, backgroundColor: '#FFFFFF' },
  countValue: { marginTop: 12, color: '#101828', fontSize: 22, fontWeight: '900' },
  countLabel: { marginTop: 3, color: '#667085', fontSize: 12, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { marginTop: 18, marginBottom: 12, color: '#101828', fontSize: 18, fontWeight: '900' },
  sectionCount: { marginTop: 18, color: '#667085', fontSize: 11 },
  searchInput: { height: 46, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 13, backgroundColor: '#FFFFFF', color: '#101828' },
  filters: { gap: 8, paddingVertical: 12 },
  filter: { paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 999, backgroundColor: '#FFFFFF' },
  filterSelected: { borderColor: colors.primary, backgroundColor: '#F2EEFF' },
  filterText: { color: '#667085', fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: colors.primary },
  activityCard: { flexDirection: 'row', gap: 12, marginBottom: 9, padding: 15, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 16, backgroundColor: '#FFFFFF' },
  activityCopy: { flex: 1 },
  activityTitle: { color: '#101828', fontSize: 14, fontWeight: '800', lineHeight: 20 },
  activityMeta: { marginTop: 7, color: '#667085', fontSize: 11 },
  flags: { flexDirection: 'row', gap: 5, marginTop: 9 },
  flag: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, overflow: 'hidden', fontSize: 9, fontWeight: '800' },
  flagWarning: { color: '#B54708', backgroundColor: '#FFFAEB' },
  flagNeutral: { color: '#475467', backgroundColor: '#F2F4F7' },
  actions: { gap: 8 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F2F4F7' },
  runRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, padding: 13, borderRadius: 14, backgroundColor: '#FFFFFF' },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 11 },
  statusCompleted: { backgroundColor: '#12B76A' },
  statusRunning: { backgroundColor: colors.primary },
  statusWarning: { backgroundColor: '#F79009' },
  runCopy: { flex: 1 },
  runTitle: { color: '#344054', fontSize: 12, fontWeight: '800' },
  runMeta: { marginTop: 3, color: '#667085', fontSize: 10 },
  errorCard: { marginBottom: 8, padding: 14, borderLeftWidth: 3, borderLeftColor: '#F79009', borderRadius: 12, backgroundColor: '#FFFFFF' },
  errorTitle: { color: '#344054', fontSize: 11, fontWeight: '900' },
  errorMessage: { marginTop: 5, color: '#667085', fontSize: 10, lineHeight: 15 },
  noErrors: { color: '#667085', fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.45)' },
  modalCard: { padding: 22, paddingBottom: 34, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalTitle: { color: '#101828', fontSize: 19, fontWeight: '900' },
  modalField: { marginBottom: 13 },
  modalLabel: { marginBottom: 6, color: '#475467', fontSize: 11, fontWeight: '800' },
  modalInput: { height: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 12, color: '#101828' },
  modalSave: { height: 50, marginTop: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary },
  modalSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
