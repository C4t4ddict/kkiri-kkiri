// src/screens/ActivityScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StatusBar, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types';
import { loadWidgetPrefs } from '../utils/widgetPrefs';
import { WIDGET_COMPONENTS, WidgetPref, DEFAULT_WIDGET_PREFS } from '../constants/widgets';
import Ringgraph from '../Widget/Ringgraph';
import colors from '../config/colors';



const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ActivityOption = {
  teamId: number;
  teamName: string;
  part: string;
};

const PURPLE = colors.primary;
const INPUT_BG = colors.inputBackground;
const TEXT_HINT = colors.textSub;
const TEXT_MAIN = colors.textMain;

type Todo = {
  todo_id: number;
  title: string;
  status: '미진행' | '진행중' | '완료';
  scope_start_date: string;
  scope_end_date: string;
  scope_type: '월간' | '주간' | '일일';
};

type GoalScope = '일일' | '주간' | '월간';

const fmt = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getMonthRange = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: fmt(start), end: fmt(end) };
};

const getWeekRange = (date = new Date()) => {
  const day = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: fmt(start), end: fmt(end), startDate: start };
};

const weekOfMonth = (date = new Date()) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMonOffset = (first.getDay() + 6) % 7;
  const dayIndex = date.getDate() - 1;
  return Math.floor((firstMonOffset + dayIndex) / 7) + 1;
};

export default function ActivityScreen() {
  const { user } = useAuth();
  const currentUserId = user?.id; // 필요 시 user.user_id
  const navigation = useNavigation<Nav>();

  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ActivityOption[]>([]);
  const [selected, setSelected] = useState<ActivityOption | null>(null);

  const [monthlyTodos, setMonthlyTodos] = useState<Todo[]>([]);
  const [weeklyTodos, setWeeklyTodos] = useState<Todo[]>([]);
  const [dailyTodos, setDailyTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGoalScope, setSelectedGoalScope] = useState<GoalScope>('일일');

  const API_BASE = useMemo(() => API_BASE_URL, []);

  const monthLabel = () => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = d.getMonth() + 1;
    return `${yy}.${mm}월`;
  };

  const weekLabel = () => {
    const d = new Date();
    const mm = d.getMonth() + 1;
    return `${mm}월 ${weekOfMonth(d)}주차`;
  };

  const dayLabel = () => {
    const d = new Date();
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  // ── API 호출 함수 ──────────────────────────────
  const fetchTeams = useCallback(async () => {
    if (!currentUserId) return [];
    try {
      const res = await fetch(`${API_BASE}/users/${currentUserId}/teams`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, [API_BASE, currentUserId]);

  const fetchAllDataForTeam = useCallback(
    async (teamId: number) => {
      if (!currentUserId) return;
      const month = getMonthRange();
      const week = getWeekRange();
      const today = fmt(new Date());
      const headers = { 'x-user-id': String(currentUserId) };

      setLoading(true);
      try {
        // 내 월간
        const mRes = await fetch(
          `${API_BASE}/todos/${teamId}?scope_type=%EC%9B%94%EA%B0%84&start=${month.start}&end=${month.end}`,
          { headers }
        );
        const monthTodos = await mRes.json();
        setMonthlyTodos(Array.isArray(monthTodos) ? monthTodos : []);

        // 내 주간
        const wRes = await fetch(
          `${API_BASE}/todos/${teamId}?scope_type=%EC%A3%BC%EA%B0%84&start=${week.start}&end=${week.end}`,
          { headers }
        );
        const weekTodos = await wRes.json();
        setWeeklyTodos(Array.isArray(weekTodos) ? weekTodos : []);

        const dRes = await fetch(
          `${API_BASE}/todos/${teamId}?scope_type=%EC%9D%BC%EC%9D%BC&start=${today}&end=${today}`,
          { headers }
        );
        const dayTodos = await dRes.json();
        setDailyTodos(Array.isArray(dayTodos) ? dayTodos : []);
      } catch (e) {
        console.warn('데이터 로드 실패:', e);
        setMonthlyTodos([]);
        setWeeklyTodos([]);
        setDailyTodos([]);
      } finally {
        setLoading(false);
      }
    },
    [API_BASE, currentUserId]
  );
  // 컴포넌트 내부 상태
  const [widgetPrefs, setWidgetPrefs] = useState<WidgetPref[]>(DEFAULT_WIDGET_PREFS);

  const getPercent = (todos: Todo[]) => {
    if (todos.length === 0) return 0;
    return Math.round((todos.filter((todo) => todo.status === '완료').length / todos.length) * 100);
  };

  const schedulePercent = useMemo(() => {
    const allTodos = [...monthlyTodos, ...weeklyTodos, ...dailyTodos];
    if (allTodos.length === 0) return 0;
    return Math.round((allTodos.filter((todo) => todo.status !== '미진행').length / allTodos.length) * 100);
  }, [dailyTodos, monthlyTodos, weeklyTodos]);

  const monthlyPercent = useMemo(() => getPercent(monthlyTodos), [monthlyTodos]);
  const weeklyPercent = useMemo(() => getPercent(weeklyTodos), [weeklyTodos]);
  const overallPercent = useMemo(
    () => getPercent([...monthlyTodos, ...weeklyTodos, ...dailyTodos]),
    [dailyTodos, monthlyTodos, weeklyTodos]
  );
  const ringMetrics = useMemo(() => ([
    { label: '일정', percent: schedulePercent, suffix: '진행중' },
    { label: '전체', percent: overallPercent, suffix: '완료' },
    { label: '월간 목표', percent: monthlyPercent, suffix: '완료' },
    { label: '주간 목표', percent: weeklyPercent, suffix: '완료' },
  ]), [monthlyPercent, overallPercent, schedulePercent, weeklyPercent]);
  const visibleWidgetPrefs = useMemo(
    () => widgetPrefs.filter(w => w.visible).sort((a, b) => a.order - b.order),
    [widgetPrefs]
  );
  const showRing = visibleWidgetPrefs.some((widget) => widget.id === 'ring');
  const selectedGoal = useMemo(() => {
    if (selectedGoalScope === '월간') {
      return { title: '월간 목표', sub: monthLabel(), data: monthlyTodos };
    }
    if (selectedGoalScope === '주간') {
      return { title: '주간 목표', sub: weekLabel(), data: weeklyTodos };
    }
    return { title: '일일 목표', sub: dayLabel(), data: dailyTodos };
  }, [dailyTodos, monthlyTodos, selectedGoalScope, weeklyTodos]);

  // 최초 팀 목록
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      const data = await fetchTeams();
      setOptions(data);
      if (data.length > 0) setSelected((prev) => prev ?? data[0]);
    })();
  }, [currentUserId, fetchTeams]);

  // 선택된 팀 변경 시 데이터 로드
  useEffect(() => {
    if (selected?.teamId) fetchAllDataForTeam(selected.teamId);
  }, [selected, fetchAllDataForTeam]);

  // 화면에 다시 들어오면 전체 새로고침(팀 목록 + 섹션 데이터)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const reload = async () => {
        const data = await fetchTeams();
        if (!alive) return;
        setOptions(data);
        const keep = data.find((d) => d.teamId === selected?.teamId);
        const nextSelected = keep ?? data[0] ?? null;
        setSelected(nextSelected || null);
        if (nextSelected) await fetchAllDataForTeam(nextSelected.teamId);
        else {
          setMonthlyTodos([]);
          setWeeklyTodos([]);
          setDailyTodos([]);
        }
      };
      reload();
      return () => {
        alive = false;
      };
    }, [fetchTeams, fetchAllDataForTeam, selected?.teamId])
  );

  // 포커스 시 위젯 설정 로드(팀별 커스텀 쓰려면 selected?.teamId 넘겨줘)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const prefs = await loadWidgetPrefs(selected?.teamId ?? null);
        if (alive) setWidgetPrefs(prefs);
      })();
      return () => { alive = false; };
    }, [selected?.teamId])
  );
  const TodoItem = ({ item }: { item: Todo }) => {
    const isDone = item.status === '완료';
    const isDoing = item.status === '진행중';
    return (
      <View style={[styles.todoRow, isDoing && styles.todoRowDoing]}>
        <View style={[
          styles.todoStatus,
          isDone && styles.todoStatusDone,
          isDoing && styles.todoStatusDoing,
        ]}>
          {isDone && <Icon name="checkmark" size={13} color="#FFFFFF" />}
          {isDoing && <View style={styles.todoStatusDot} />}
        </View>
        <Text style={[styles.todoText, isDone && styles.todoDone]} numberOfLines={2}>
          {item.title}
        </Text>
        {isDoing && <Text style={styles.doingBadge}>진행중</Text>}
      </View>
    );
  };

  const Section = ({
    title,
    sub,
    data,
  }: {
    title: string;
    sub: string;
    data: Todo[];
  }) => {
    const sectionPercent = getPercent(data);
    const iconName = title === '월간 목표'
      ? 'calendar-outline'
      : title === '주간 목표'
        ? 'today-outline'
        : 'sunny-outline';
    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionIcon}>
              <Icon name={iconName} size={18} color={PURPLE} />
            </View>
            <View>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.sectionSubUnder}>{sub}</Text>
            </View>
          </View>
          <View style={styles.sectionPercentPill}>
            <Text style={styles.sectionPercentText}>{sectionPercent}%</Text>
          </View>
        </View>

        <View style={styles.sectionProgressTrack}>
          <View style={[styles.sectionProgressFill, { width: `${sectionPercent}%` }]} />
        </View>

        {data.length === 0 ? (
          <Text style={styles.emptyText}>{loading ? '불러오는 중...' : '등록된 항목이 없어요'}</Text>
        ) : (
          <View style={styles.todoList}>
            {data.map((item) => <TodoItem key={item.todo_id} item={item} />)}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        {/* 상단 */}
        <AppHeader actions={
          <View style={styles.iconRow}>
            <Pressable hitSlop={10}>
              <Image source={require('../assets/folder.png')} style={styles.icon} resizeMode="contain" />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => navigation.navigate('ActivitySettingScreen', {teamId: selected?.teamId ?? undefined,})}>
              <Image source={require('../assets/settings-01.png')} style={[styles.icon, { marginLeft: 16 }]} resizeMode="contain" />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => navigation.navigate('Notifications')}>
              <Image source={require('../assets/bell.png')} style={[styles.icon, { marginLeft: 16 }]} resizeMode="contain" />
            </Pressable>
          </View>
        } />

        {/* 드롭다운 + 역할 */}
        <View style={styles.selectRow}>
          <View style={styles.dropdown}>
            <Pressable style={styles.dropdownBtn} onPress={() => setOpen(v => !v)}>
              <Text style={styles.dropdownText}>
                {selected ? selected.teamName : '내 활동 선택'}
              </Text>
              <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
            </Pressable>

            {open && (
              <View style={styles.dropdownList}>
                <FlatList
                  data={options}
                  keyExtractor={(item) => String(item.teamId)}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setSelected(item);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.dropdownItemText}>{item.teamName}</Text>
                    </Pressable>
                  )}
                />
              </View>
            )}
          </View>

          <Text style={styles.partText}>{selected?.part ? humanizePart(selected.part) : '—'}</Text>
        </View>
        {/* 스크롤 컨테이너 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}  // 패딩/여유공간은 여기서
        keyboardShouldPersistTaps="handled"
      >
        {/* 진행률 */}
        {showRing && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.progressEyebrow}>목표 진행 현황</Text>
                <Text style={styles.progressTitle}>이번 달 {overallPercent}% 완료</Text>
              </View>
              <View style={styles.progressBadge}>
                <Text style={styles.progressBadgeText}>{schedulePercent}% 진행중</Text>
              </View>
            </View>
            <Ringgraph percent={overallPercent} metrics={ringMetrics} />
          </View>
        )}

        <View style={styles.goalArea}>
          <View style={styles.goalTabs}>
            {(['일일', '주간', '월간'] as GoalScope[]).map((scope) => {
              const active = selectedGoalScope === scope;
              return (
                <Pressable
                  key={scope}
                  onPress={() => setSelectedGoalScope(scope)}
                  style={[styles.goalTab, active && styles.goalTabActive]}
                >
                  <Text style={[styles.goalTabText, active && styles.goalTabTextActive]}>
                    {scope}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Section {...selectedGoal} />
        </View>

        {/* 위젯 영역: 설정(가시성/순서)에 따라 렌더 */}
            <View style={{ marginTop: 30 }}>
              {visibleWidgetPrefs
                .filter(w => w.id !== 'ring')
                .map(w => {
                  const C = WIDGET_COMPONENTS[w.id];
                  if (!C) return null;
                  return (
                    <C
                        key={w.id}
                        teamId={selected?.teamId ?? null}   // ← 팀 ID 내려줌
                    />
                  );
                })}
            </View>
          </ScrollView>

          {/* 떠 있는 FAB (스크롤과 독립) */}
          <Pressable style={styles.fab} onPress={() => navigation.navigate('TodoScreen')}>
            <Icon name="add" size={29} color="#FFFFFF" />
            <Text style={styles.fabText}>목표</Text>
          </Pressable>
          </View>
        </SafeAreaView>
  );
}

function humanizePart(part: string) {
  if (!part) return '';
  return part;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingBottom: 140,
    backgroundColor: '#FFFFFF',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 26,
    height: 26,
  },
  selectRow: {
    marginTop: 18,
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdown: {
    flex: 1,
    marginRight: 12,
    position: 'relative',
  },
  dropdownBtn: {
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownText: {
    flex: 1,
    color: TEXT_MAIN,
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 8,
    color: TEXT_HINT,
    fontSize: 12,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    maxHeight: 220,
    zIndex: 9999,
    elevation: 5,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: 15,
    color: TEXT_MAIN,
  },
  partText: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2A37',
  },

  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressCard: {
    marginTop: 22,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#FAF9FF',
    borderWidth: 1,
    borderColor: '#EEE9FB',
  },
  progressEyebrow: {
    marginBottom: 4,
    color: '#7A5AF8',
    fontSize: 12,
    fontWeight: '800',
  },
  progressTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2A37',
  },
  progressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEEAFE',
  },
  progressBadgeText: {
    color: '#6941C6',
    fontSize: 11,
    fontWeight: '800',
  },

  goalArea: {
    marginTop: 18,
  },
  goalTabs: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: '#F2F4F7',
  },
  goalTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  goalTabText: {
    color: TEXT_HINT,
    fontSize: 14,
    fontWeight: '700',
  },
  goalTabTextActive: {
    color: PURPLE,
    fontWeight: '900',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAECF0',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    width: 38,
    height: 38,
    marginRight: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1EDFF',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  sectionSubUnder: {
    marginTop: 3,
    fontSize: 12,
    color: TEXT_HINT,
  },
  sectionPercentPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F4F1FF',
  },
  sectionPercentText: {
    color: '#6941C6',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionProgressTrack: {
    height: 6,
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#EAECF0',
  },
  sectionProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: PURPLE,
  },
  emptyText: {
    paddingVertical: 14,
    color: TEXT_HINT,
    fontSize: 13,
  },
  todoList: {
    gap: 7,
  },
  todoRow: {
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FC',
  },
  todoRowDoing: {
    backgroundColor: '#EEEAFE',
    borderWidth: 1,
    borderColor: '#D8CCFF',
  },
  todoStatus: {
    width: 19,
    height: 19,
    marginRight: 9,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  todoStatusDone: {
    borderColor: PURPLE,
    backgroundColor: PURPLE,
  },
  todoStatusDoing: {
    borderColor: '#8B6CF6',
  },
  todoStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#7A5AF8',
  },
  todoText: {
    flex: 1,
    fontSize: 14,
    color: TEXT_MAIN,
    lineHeight: 20,
  },
  todoDone: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  doingBadge: {
    marginLeft: 8,
    color: '#6941C6',
    fontSize: 10,
    fontWeight: '800',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 40,
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', marginTop: -3 },
});
