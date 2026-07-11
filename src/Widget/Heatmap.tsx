import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import colors from '../config/colors';

type Props = {
  teamId?: number | null;
};

type HeatmapCell = {
  date: string;
  count: number;
};

type CalendarCell = {
  key: string;
  day: number | null;
  count: number;
  isOutside?: boolean;
};

const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthTitle(date: Date) {
  return `${String(date.getFullYear()).slice(2)}.${date.getMonth() + 1}월`;
}

function cellColor(count: number, isOutside?: boolean) {
  if (isOutside) return '#E5E7EB';
  if (count >= 4) return '#6D28D9';
  if (count >= 3) return colors.primary;
  if (count >= 2) return colors.primaryLight;
  if (count >= 1) return '#C4B5FD';
  return '#F2F4F7';
}

export default function Heatmap({ teamId }: Props) {
  const [cells, setCells] = useState<HeatmapCell[]>([]);

  useEffect(() => {
    let alive = true;
    if (!teamId) {
      setCells([]);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/teams/${teamId}/heatmap`);
        const data = await response.json();
        if (alive) setCells(Array.isArray(data) ? data : []);
      } catch (error) {
        if (alive) setCells([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [teamId]);

  const baseDate = useMemo(() => (cells[0]?.date ? parseDate(cells[0].date) : new Date()), [cells]);
  const calendar = useMemo<CalendarCell[]>(() => {
    const countByDate = new Map(cells.map((cell) => [cell.date, Number(cell.count || 0)]));
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const result: CalendarCell[] = [];

    for (let i = 0; i < first.getDay(); i += 1) {
      result.push({ key: `empty-start-${i}`, day: null, count: 0, isOutside: true });
    }

    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = new Date(year, month, day);
      const key = formatDate(date);
      result.push({ key, day, count: countByDate.get(key) || 0 });
    }

    while (result.length % 7 !== 0) {
      result.push({ key: `empty-end-${result.length}`, day: null, count: 0, isOutside: true });
    }

    return result;
  }, [baseDate, cells]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>히트맵</Text>
      <View style={styles.divider} />
      <Text style={styles.month}>{'<   '}{monthTitle(baseDate)}{'   >'}</Text>
      <View style={styles.weekRow}>
        {weekdays.map((day) => (
          <View key={day} style={styles.slot}>
            <Text style={styles.weekday}>{day}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {calendar.map((cell) => (
          <View
            key={cell.key}
            style={styles.slot}
          >
            <View style={[styles.cell, { backgroundColor: cellColor(cell.count, cell.isOutside) }]}>
              <Text style={[styles.day, cell.isOutside && styles.dayOutside]}>
                {cell.day ?? ''}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textMain,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 18,
  },
  month: {
    textAlign: 'center',
    color: colors.textSub,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  slot: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    marginBottom: 8,
  },
  weekday: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSub,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    fontSize: 13,
    color: colors.textMain,
    fontWeight: '600',
  },
  dayOutside: {
    color: 'transparent',
  },
});
