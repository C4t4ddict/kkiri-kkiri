import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
  start_date: string;
  end_date: string;
  total_count: number;
  completed_count: number;
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

const API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const GRID_GAP = 4;

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

  const cells = useMemo(
    () => buildCells(year, month, calendar.days),
    [calendar.days, month, year],
  );
  const cellWidth = Math.max(28, Math.floor((gridWidth - (GRID_GAP * 6)) / 7));
  const cellHeight = Math.max(56, Math.min(68, Math.round(cellWidth * 1.08)));
  const todayKey = dateKey(today);

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="오늘로 이동"
          onPress={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          style={styles.todayButton}
        >
          <Text style={styles.todayButtonText}>오늘</Text>
        </Pressable>
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
            return <View key={cell.key} style={{ width: cellWidth, height: cellHeight }} />;
          }
          const activeRanges = calendar.ranges.filter(
            (range) => cell.date! >= range.start_date && cell.date! <= range.end_date,
          ).slice(0, 2);
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
              {Number(cell.day?.count || 0) > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{cell.day?.count}</Text>
                </View>
              ) : null}
              <View style={styles.rangeArea}>
                {activeRanges.map((range, rangeIndex) => {
                  const beginsHere = cell.date === range.start_date || weekdayIndex === 0;
                  const endsHere = cell.date === range.end_date || weekdayIndex === 6;
                  return (
                    <View
                      key={range.range_group_id}
                      style={[
                        styles.rangeLine,
                        rangeIndex === 0 ? styles.firstRangeLine : styles.secondRangeLine,
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
      ) : calendar.ranges.length > 0 ? (
        <View style={styles.legendRow}>
          <View style={styles.legendLine} />
          <Text style={styles.legendText}>가로선은 기간 목표의 시작일부터 종료일까지 표시합니다.</Text>
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
              {selectedDay?.todos.length ? selectedDay.todos.map((todo) => (
                <View key={`${selectedDay.date}-${todo.todo_id}`} style={styles.todoRow}>
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
                  <Text style={styles.emptyModalTitle}>이날은 등록된 할 일이 없어요</Text>
                </View>
              )}
            </ScrollView>

            <Pressable onPress={() => setSelectedDay(null)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
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
  todayButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.primarySurface },
  todayButtonText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  monthNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  monthButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { minWidth: 130, color: colors.textMain, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  weekdayRow: { flexDirection: 'row', columnGap: GRID_GAP, marginBottom: 7 },
  weekday: { color: colors.textSub, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  sunday: { color: '#F04438' },
  saturday: { color: '#4785E8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: GRID_GAP, width: '100%' },
  dayCell: {
    alignItems: 'center',
    paddingTop: 7,
    borderWidth: 1,
    borderColor: '#EEF0F4',
    borderRadius: 12,
    backgroundColor: '#FAFAFC',
    overflow: 'visible',
  },
  todayCell: { borderColor: colors.primaryLight, backgroundColor: colors.primarySurface },
  selectedCell: { borderColor: colors.primary, borderWidth: 1.5 },
  dayPressed: { opacity: 0.7 },
  dayNumber: { color: colors.textMain, fontSize: 12, fontWeight: '700' },
  todayNumber: { color: colors.primaryDark, fontWeight: '900' },
  countBadge: {
    minWidth: 19,
    height: 19,
    marginTop: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#E9E4FF',
  },
  countText: { color: colors.primaryDark, fontSize: 9, fontWeight: '900' },
  rangeArea: { position: 'absolute', left: 0, right: 0, bottom: 5, height: 10 },
  rangeLine: {
    position: 'absolute',
    left: -(GRID_GAP / 2),
    right: -(GRID_GAP / 2),
    height: 4,
  },
  firstRangeLine: { top: 0, backgroundColor: '#7A5AF8' },
  secondRangeLine: { top: 6, backgroundColor: '#A78BFA' },
  rangeBeginning: { left: 5, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  rangeEnding: { right: 5, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  messageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13 },
  messageText: { color: colors.textSub, fontSize: 11 },
  errorText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13 },
  legendLine: { width: 25, height: 4, marginRight: 7, borderRadius: 2, backgroundColor: colors.primary },
  legendText: { flex: 1, color: colors.textSub, fontSize: 10, lineHeight: 15 },
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
});
