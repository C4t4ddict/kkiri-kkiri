import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import colors from '../config/colors';

type Props = {
  teamId?: number | null;
};

type DailyTodo = {
  todo_id: number;
  title: string;
  status: '미진행' | '진행중' | '완료';
  assigned_user_name: string;
};

const API_BASE_URL = __DEV__
  ? (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000')
  : 'https://your.api';

export default function IssueTracker({ teamId }: Props) {
  const [items, setItems] = useState<DailyTodo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDaily = useCallback(async () => {
    if (!teamId) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/teams/${teamId}/daily-todos`);
      const data: DailyTodo[] = await response.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchDaily();
  }, [fetchDaily]);

  const groups = useMemo(() => ({
    '할 일': items.filter((item) => item.status === '미진행'),
    '진행중': items.filter((item) => item.status === '진행중'),
    '완료!': items.filter((item) => item.status === '완료'),
  }), [items]);

  const Section = ({ title, data }: { title: keyof typeof groups; data: DailyTodo[] }) => (
    <View style={styles.section}>
      <Text style={styles.tag}>{title}</Text>
      <View style={styles.box}>
        {loading ? (
          <Text style={styles.empty}>로딩 중…</Text>
        ) : data.length > 0 ? (
          <FlatList
            data={data}
            keyExtractor={(todo) => String(todo.todo_id)}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.todoTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.assignee}>{item.assigned_user_name}</Text>
              </View>
            )}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.empty}>
            {title === '할 일' ? '할 일이 없습니다' : title === '진행중' ? '진행 중인 일이 없습니다' : '완료된 일이 없습니다'}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.header}>이슈트래커</Text>
      <Section title="할 일" data={groups['할 일']} />
      <Section title="진행중" data={groups['진행중']} />
      <Section title="완료!" data={groups['완료!']} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 28,
  },
  header: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textMain,
    marginBottom: 12,
  },
  section: {
    marginBottom: 12,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.primarySurface,
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  box: {
    borderRadius: 20,
    backgroundColor: '#FAFAFF',
    borderWidth: 1,
    borderColor: '#EBE9FE',
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  todoTitle: {
    flex: 1,
    marginRight: 12,
    color: colors.textMain,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  assignee: {
    color: colors.textSub,
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    color: colors.textSub,
    fontSize: 13,
    marginVertical: 8,
  },
});
