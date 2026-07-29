import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../config/colors';

type CalendarTodo = {
  todo_id: number;
  title: string;
  status: '미진행' | '진행중' | '완료';
  scope_type: string;
  scope_start_date: string;
  scope_end_date: string;
  range_group_id?: string | null;
  range_start_date?: string | null;
  range_end_date?: string | null;
};

type CalendarDay = {
  date: string;
  count: number;
  todos: CalendarTodo[];
};

type CalendarRange = {
  range_group_id: string;
  title: string;
  scope_type: string;
  color?: string | null;
  start_date: string;
  end_date: string;
  total_count: number;
  completed_count: number;
  status_counts: Record<TodoStatus, number>;
};

type CalendarResponse = {
  year: number;
  month: number;
  days: CalendarDay[];
  ranges: CalendarRange[];
};

type CalendarCell = {
  key: string;
  date: string | null;
  dayNumber: number | null;
  day?: CalendarDay;
};

type Props = {
  teamId?: number | null;
  refreshKey?: number;
};

type GoalType = '일일' | '주간' | '월간';
type TodoStatus = CalendarTodo['status'];
type CalendarFilterConfig = Record<GoalType, {
  enabled: boolean;
  statuses: Record<TodoStatus, boolean>;
}>;

const API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const GOAL_TYPES: GoalType[] = ['일일', '주간', '월간'];
const TODO_STATUSES: TodoStatus[] = ['미진행', '진행중', '완료'];
const RANGE_COLORS = ['#6941C6', '#7F56D9', '#9E77ED', '#B692F6', '#C3B5FD'];
const MAX_RANGE_LANES = 3;

const createDefaultFilters = (): CalendarFilterConfig => ({
  일일: { enabled: true, statuses: { 미진행: true, 진행중: true, 완료: true } },
  주간: { enabled: true, statuses: { 미진행: true, 진행중: true, 완료: true } },
  월간: { enabled: true, statuses: { 미진행: true, 진행중: true, 완료: true } },
});

const normalizeFilters = (value: unknown): CalendarFilterConfig => {
  const defaults = createDefaultFilters();
  if (!value || typeof value !== 'object') return defaults;
  const stored = value as Partial<CalendarFilterConfig>;
  GOAL_TYPES.forEach((goalType) => {
    const typeConfig = stored[goalType];
    if (!typeConfig || typeof typeConfig !== 'object') return;
    defaults[goalType].enabled = typeConfig.enabled !== false;
    TODO_STATUSES.forEach((status) => {
      defaults[goalType].statuses[status] = typeConfig.statuses?.[status] !== false;
    });
  });
  return defaults;
};

const rangeColor = (range: CalendarRange) => {
  if (range.color && /^#[0-9A-F]{6}$/i.test(range.color)) return range.color;
  const hash = [...range.range_group_id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return RANGE_COLORS[hash % RANGE_COLORS.length];
};

const formatShortRange = (start: string, end: string) => {
  const [, startMonth, startDay] = start.split('-');
  const [, endMonth, endDay] = end.split('-');
  return `${Number(startMonth)}.${Number(startDay)} ~ ${Number(endMonth)}.${Number(endDay)}`;
};

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const formatSelectedDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
};

const buildCells = (year: number, month: number, days: CalendarDay[]): CalendarCell[] => {
  const firstOffset = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - firstOffset + 1;
    if (dayNumber < 1 || dayNumber > lastDay) {
      return { key: `empty-${index}`, date: null, dayNumber: null };
    }
    const date = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    return { key: date, date, dayNumber, day: byDate.get(date) };
  });
};

const statusColor = (status: CalendarTodo['status']) => {
  if (status === '완료') return '#12B76A';
  if (status === '진행중') return colors.primary;
  return '#98A2B3';
};

export default function ActivityCalendar({ teamId, refreshKey = 0 }: Props) {
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calendar, setCalendar] = useState<CalendarResponse>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    days: [],
    ranges: [],
  });
  const [gridWidth, setGridWidth] = useState(Math.max(220, windowWidth - 72));
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [filters, setFilters] = useState<CalendarFilterConfig>(createDefaultFilters);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;

  const fetchCalendar = useCallback(async () => {
    if (!teamId) {
      setCalendar({ year, month, days: [], ranges: [] });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/teams/${teamId}/calendar?year=${year}&month=${month}`, {
        headers: { 'x-user-id': String(user?.id || '') },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '일정을 불러오지 못했습니다');
      setCalendar({
        year,
        month,
        days: Array.isArray(data.days) ? data.days : [],
        ranges: Array.isArray(data.ranges) ? data.ranges : [],
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '일정을 불러오지 못했습니다');
      setCalendar({ year, month, days: [], ranges: [] });
    } finally {
      setLoading(false);
    }
  }, [month, teamId, user?.id, year]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar, refreshKey]);

  const filterStorageKey = useMemo(
    () => `activity-calendar-filters:v1:${user?.id || 'guest'}`,
    [user?.id],
  );

  useEffect(() => {
    let active = true;
    setFiltersLoaded(false);
    AsyncStorage.getItem(filterStorageKey)
      .then((stored) => {
        if (!active) return;
        setFilters(normalizeFilters(stored ? JSON.parse(stored) : null));
      })
      .catch(() => {
        if (active) setFilters(createDefaultFilters());
      })
      .finally(() => {
        if (active) setFiltersLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [filterStorageKey]);

  useEffect(() => {
    if (!filtersLoaded) return;
    AsyncStorage.setItem(filterStorageKey, JSON.stringify(filters)).catch(() => undefined);
  }, [filterStorageKey, filters, filtersLoaded]);

  const cells = useMemo(
    () => buildCells(year, month, calendar.days),
    [calendar.days, month, year],
  );
  const visibleRanges = useMemo(
    () => calendar.ranges.filter((range) => {
      const goalType = range.scope_type as GoalType;
      const typeConfig = filters[goalType];
      if (!typeConfig?.enabled) return false;
      return TODO_STATUSES.some(
        (status) => typeConfig.statuses[status] && Number(range.status_counts?.[status] || 0) > 0,
      );
    }),
    [calendar.ranges, filters],
  );
  const visibleTodos = useMemo(
    () => selectedDay?.todos.filter((todo) => {
      const goalType = todo.scope_type as GoalType;
      return Boolean(filters[goalType]?.enabled && filters[goalType].statuses[todo.status]);
    }) || [],
    [filters, selectedDay],
  );
  const visibleRangeLanes = useMemo(() => {
    const maximum = cells.reduce((highest, cell) => {
      if (!cell.date) return highest;
      const count = visibleRanges.filter(
        (range) => cell.date! >= range.start_date && cell.date! <= range.end_date,
      ).length;
      return Math.max(highest, count);
    }, 0);
    return Math.min(MAX_RANGE_LANES, maximum);
  }, [cells, visibleRanges]);
  const cellWidth = Math.max(28, (gridWidth - 2) / 7);
  const cellHeight = Math.max(68, Math.min(94, Math.round(cellWidth * 1.08) + (visibleRangeLanes * 7)));
  const todayKey = dateKey(today);

  const getRemainingDailyCount = (day?: CalendarDay) => {
    if (!filters.일일.enabled) return 0;
    return day?.todos.filter(
      (todo) => todo.scope_type === '일일'
        && todo.status !== '완료'
        && filters.일일.statuses[todo.status],
    ).length || 0;
  };

  const toggleGoalType = (goalType: GoalType) => {
    setFilters((current) => ({
      ...current,
      [goalType]: { ...current[goalType], enabled: !current[goalType].enabled },
    }));
  };

  const toggleGoalStatus = (goalType: GoalType, status: TodoStatus) => {
    setFilters((current) => ({
      ...current,
      [goalType]: {
        ...current[goalType],
        statuses: {
          ...current[goalType].statuses,
          [status]: !current[goalType].statuses[status],
        },
      },
    }));
  };

  const changeMonth = (offset: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const handleGridLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth > 0 && measuredWidth !== gridWidth) setGridWidth(measuredWidth);
  };

  const openDay = (cell: CalendarCell) => {
    if (!cell.date) return;
    setSelectedDay(cell.day || { date: cell.date, count: 0, todos: [] });
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleIcon}>
          <Icon name="calendar-outline" size={21} color={colors.primary} />
        </View>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>일정 캘린더</Text>
          <Text style={styles.subtitle}>날짜를 눌러 할 일을 확인하세요</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="오늘로 이동"
            onPress={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
            style={styles.todayButton}
          >
            <Text style={styles.todayButtonText}>오늘</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="캘린더 설정"
            onPress={() => setSettingsVisible(true)}
            style={styles.settingsButton}
          >
            <Icon name="settings-outline" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.monthNavigation}>
        <Pressable accessibilityLabel="이전 달" onPress={() => changeMonth(-1)} style={styles.monthButton}>
          <Icon name="chevron-back" size={20} color={colors.textSub} />
        </Pressable>
        <Text style={styles.monthLabel}>{year}년 {month}월</Text>
        <Pressable accessibilityLabel="다음 달" onPress={() => changeMonth(1)} style={styles.monthButton}>
          <Icon name="chevron-forward" size={20} color={colors.textSub} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((weekday, index) => (
          <Text
            key={weekday}
            style={[
              styles.weekday,
              { width: cellWidth },
              index === 0 && styles.sunday,
              index === 6 && styles.saturday,
            ]}
          >
            {weekday}
          </Text>
        ))}
      </View>

      <View style={styles.grid} onLayout={handleGridLayout}>
        {cells.map((cell, index) => {
          if (!cell.date) {
            return <View key={cell.key} style={[styles.emptyDayCell, { width: cellWidth, height: cellHeight }]} />;
          }
          const activeRanges = visibleRanges.filter(
            (range) => cell.date! >= range.start_date && cell.date! <= range.end_date,
          ).slice(0, MAX_RANGE_LANES);
          const remainingDailyCount = getRemainingDailyCount(cell.day);
          const isToday = cell.date === todayKey;
          const isSelected = selectedDay?.date === cell.date;
          const weekdayIndex = index % 7;
          return (
            <Pressable
              key={cell.key}
              onPress={() => openDay(cell)}
              style={({ pressed }) => [
                styles.dayCell,
                { width: cellWidth, height: cellHeight },
                isToday && styles.todayCell,
                isSelected && styles.selectedCell,
                pressed && styles.dayPressed,
              ]}
            >
              <Text style={[
                styles.dayNumber,
                weekdayIndex === 0 && styles.sunday,
                weekdayIndex === 6 && styles.saturday,
                isToday && styles.todayNumber,
              ]}>
                {cell.dayNumber}
              </Text>
              {remainingDailyCount > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{remainingDailyCount}</Text>
                </View>
              ) : null}
              <View
                pointerEvents="none"
                style={[styles.rangeArea, { height: Math.max(1, visibleRangeLanes) * 7 }]}
              >
                {activeRanges.map((range, rangeIndex) => {
                  const beginsHere = cell.date === range.start_date;
                  const endsHere = cell.date === range.end_date;
                  return (
                    <View
                      key={range.range_group_id}
                      style={[
                        styles.rangeLine,
                        { top: rangeIndex * 7, backgroundColor: rangeColor(range) },
                        beginsHere && styles.rangeBeginning,
                        endsHere && styles.rangeEnding,
                      ]}
                    />
                  );
                })}
              </View>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.messageRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.messageText}>일정을 불러오는 중이에요</Text>
        </View>
      ) : error ? (
        <Pressable onPress={fetchCalendar} style={styles.messageRow}>
          <Icon name="refresh" size={16} color={colors.primary} />
          <Text style={styles.errorText}>{error} · 다시 시도</Text>
        </Pressable>
      ) : visibleRanges.length > 0 ? (
        <View style={styles.rangeLegend}>
          <Text style={styles.rangeLegendTitle}>기간 목표</Text>
          {visibleRanges.slice(0, 4).map((range) => (
            <View key={range.range_group_id} style={styles.rangeLegendItem}>
              <View style={[styles.rangeLegendColor, { backgroundColor: rangeColor(range) }]} />
              <Text style={styles.rangeLegendName} numberOfLines={1}>{range.title}</Text>
              <Text style={styles.rangeLegendDate}>{formatShortRange(range.start_date, range.end_date)}</Text>
            </View>
          ))}
          {visibleRanges.length > 4 ? (
            <Text style={styles.moreRangeText}>외 {visibleRanges.length - 4}개 기간 목표</Text>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={selectedDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedDay(null)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>DAILY TASKS</Text>
                <Text style={styles.modalTitle}>
                  {selectedDay ? formatSelectedDate(selectedDay.date) : ''}
                </Text>
              </View>
              <Pressable accessibilityLabel="닫기" onPress={() => setSelectedDay(null)} style={styles.closeButton}>
                <Icon name="close" size={21} color={colors.textMain} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {visibleTodos.length ? visibleTodos.map((todo) => (
                <View key={`${todo.scope_start_date}-${todo.todo_id}`} style={styles.todoRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(todo.status) }]} />
                  <View style={styles.todoCopy}>
                    <Text style={[styles.todoTitle, todo.status === '완료' && styles.todoCompleted]}>
                      {todo.title}
                    </Text>
                    <Text style={styles.todoMeta}>
                      {todo.scope_type} · {todo.status}
                      {todo.range_start_date && todo.range_end_date
                        ? ` · ${todo.range_start_date} ~ ${todo.range_end_date}`
                        : ''}
                    </Text>
                  </View>
                </View>
              )) : (
                <View style={styles.emptyModal}>
                  <Icon name="checkmark-done-circle-outline" size={34} color={colors.primaryLight} />
                  <Text style={styles.emptyModalTitle}>설정 조건에 해당하는 할 일이 없어요</Text>
                </View>
              )}
            </ScrollView>

            <Pressable onPress={() => setSelectedDay(null)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSettingsVisible(false)} />
          <View style={styles.settingsCard}>
            <View style={styles.modalHeader}>
              <View style={styles.settingsHeading}>
                <Text style={styles.modalEyebrow}>CALENDAR DISPLAY</Text>
                <Text style={styles.modalTitle}>캘린더 설정</Text>
                <Text style={styles.settingsDescription}>목표 유형과 상태별 표시 여부를 선택하세요.</Text>
              </View>
              <Pressable accessibilityLabel="설정 닫기" onPress={() => setSettingsVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={21} color={colors.textMain} />
              </Pressable>
            </View>

            <ScrollView style={styles.settingsList} contentContainerStyle={styles.settingsListContent}>
              {GOAL_TYPES.map((goalType) => {
                const typeConfig = filters[goalType];
                return (
                  <View key={goalType} style={[styles.filterCard, !typeConfig.enabled && styles.filterCardDisabled]}>
                    <View style={styles.filterHeader}>
                      <View>
                        <Text style={styles.filterTitle}>{goalType} 목표</Text>
                        <Text style={styles.filterHint}>{goalType === '일일' ? '숫자는 남은 일일 목표만 표시됩니다.' : '날짜 상세 목록에 표시됩니다.'}</Text>
                      </View>
                      <Switch
                        accessibilityLabel={`${goalType} 목표 표시`}
                        value={typeConfig.enabled}
                        onValueChange={() => toggleGoalType(goalType)}
                        trackColor={{ false: '#D0D5DD', true: colors.primaryLight }}
                        thumbColor={typeConfig.enabled ? colors.primary : '#FFFFFF'}
                      />
                    </View>
                    <View style={styles.statusToggleRow}>
                      {TODO_STATUSES.map((status) => {
                        const selected = typeConfig.statuses[status];
                        return (
                          <Pressable
                            key={status}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected, disabled: !typeConfig.enabled }}
                            disabled={!typeConfig.enabled}
                            onPress={() => toggleGoalStatus(goalType, status)}
                            style={[
                              styles.statusToggle,
                              selected && styles.statusToggleSelected,
                              !typeConfig.enabled && styles.statusToggleDisabled,
                            ]}
                          >
                            <Icon
                              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                              size={16}
                              color={selected ? colors.primary : colors.textSub}
                            />
                            <Text style={[styles.statusToggleText, selected && styles.statusToggleTextSelected]}>{status}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.settingsFooter}>
              <Pressable onPress={() => setFilters(createDefaultFilters())} style={styles.resetButton}>
                <Text style={styles.resetButtonText}>기본값 복원</Text>
              </Pressable>
              <Pressable onPress={() => setSettingsVisible(false)} style={styles.applyButton}>
                <Text style={styles.applyButtonText}>적용</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primarySurface,
  },
  titleCopy: { flex: 1, marginLeft: 11 },
  title: { color: colors.textMain, fontSize: 17, fontWeight: '900' },
  subtitle: { marginTop: 3, color: colors.textSub, fontSize: 11 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.primarySurface },
  todayButtonText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  settingsButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  monthNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  monthButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { minWidth: 130, color: colors.textMain, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  weekdayRow: { flexDirection: 'row', marginBottom: 7 },
  weekday: { color: colors.textSub, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  sunday: { color: '#F04438' },
  saturday: { color: '#4785E8' },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 16,
  },
  dayCell: {
    alignItems: 'center',
    paddingTop: 7,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },
  emptyDayCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#F8F9FC',
  },
  todayCell: { backgroundColor: colors.primarySurface },
  selectedCell: { backgroundColor: '#EEE9FF' },
  dayPressed: { opacity: 0.7 },
  dayNumber: { color: colors.textMain, fontSize: 12, fontWeight: '700' },
  todayNumber: { color: colors.primaryDark, fontWeight: '900' },
  countBadge: {
    minWidth: 19,
    height: 19,
    marginTop: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#E9E4FF',
  },
  countText: { color: colors.primaryDark, fontSize: 9, fontWeight: '900' },
  rangeArea: { position: 'absolute', left: 0, right: 0, bottom: 6 },
  rangeLine: {
    position: 'absolute',
    left: -1,
    right: -1,
    height: 6,
  },
  rangeBeginning: { left: 8, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  rangeEnding: { right: 8, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  messageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13 },
  messageText: { color: colors.textSub, fontSize: 11 },
  errorText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  rangeLegend: { marginTop: 14, padding: 12, borderRadius: 15, backgroundColor: '#F8F7FF' },
  rangeLegendTitle: { marginBottom: 7, color: colors.textMain, fontSize: 11, fontWeight: '900' },
  rangeLegendItem: { minHeight: 24, flexDirection: 'row', alignItems: 'center' },
  rangeLegendColor: { width: 20, height: 5, marginRight: 8, borderRadius: 3 },
  rangeLegendName: { flex: 1, color: colors.textMain, fontSize: 10, fontWeight: '700' },
  rangeLegendDate: { marginLeft: 8, color: colors.textSub, fontSize: 9, fontWeight: '700' },
  moreRangeText: { marginTop: 4, color: colors.primary, fontSize: 9, fontWeight: '700', textAlign: 'right' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.38)' },
  modalCard: {
    maxHeight: '72%',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  modalEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { marginTop: 5, color: colors.textMain, fontSize: 20, fontWeight: '900' },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#F2F4F7' },
  modalList: { marginTop: 17 },
  modalListContent: { paddingBottom: 8 },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    padding: 14,
    borderRadius: 17,
    backgroundColor: '#F8F9FC',
  },
  statusDot: { width: 9, height: 9, marginTop: 5, marginRight: 10, borderRadius: 5 },
  todoCopy: { flex: 1 },
  todoTitle: { color: colors.textMain, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  todoCompleted: { color: colors.textSub, textDecorationLine: 'line-through' },
  todoMeta: { marginTop: 4, color: colors.textSub, fontSize: 10, lineHeight: 15 },
  emptyModal: { alignItems: 'center', paddingVertical: 34 },
  emptyModalTitle: { marginTop: 10, color: colors.textSub, fontSize: 13, fontWeight: '700' },
  modalCloseButton: { minHeight: 49, marginTop: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  modalCloseText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  settingsCard: {
    maxHeight: '82%',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  settingsHeading: { flex: 1, paddingRight: 12 },
  settingsDescription: { marginTop: 6, color: colors.textSub, fontSize: 11, lineHeight: 16 },
  settingsList: { marginTop: 16 },
  settingsListContent: { gap: 10, paddingBottom: 8 },
  filterCard: { padding: 14, borderWidth: 1, borderColor: '#E9E4FF', borderRadius: 18, backgroundColor: '#FBFAFF' },
  filterCardDisabled: { borderColor: '#EAECF0', backgroundColor: '#F8F9FC' },
  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterTitle: { color: colors.textMain, fontSize: 14, fontWeight: '900' },
  filterHint: { maxWidth: 225, marginTop: 3, color: colors.textSub, fontSize: 9, lineHeight: 13 },
  statusToggleRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  statusToggle: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  statusToggleSelected: { borderColor: '#C3B5FD', backgroundColor: '#F4F0FF' },
  statusToggleDisabled: { opacity: 0.42 },
  statusToggleText: { color: colors.textSub, fontSize: 10, fontWeight: '700' },
  statusToggleTextSelected: { color: colors.primaryDark },
  settingsFooter: { flexDirection: 'row', gap: 9, marginTop: 14 },
  resetButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#F2F4F7' },
  resetButtonText: { color: colors.textSub, fontSize: 12, fontWeight: '800' },
  applyButton: { minHeight: 48, flex: 1.4, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primary },
  applyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
