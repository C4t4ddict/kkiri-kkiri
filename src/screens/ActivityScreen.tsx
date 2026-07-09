import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

type ActivityItem = {
  id: number;
  title: string;
  comment?: string | null;
  created_at?: string;
};

const BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR');
};

export default function ActivityScreen() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id;
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setError('로그인이 필요합니다.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/user/${userId}/activities`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '활동 정보를 불러오지 못했습니다.');
      }

      setActivities(data.activities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '활동 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useFocusEffect(
    useCallback(() => {
      fetchActivities();
    }, [fetchActivities])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>끼리끼리</Text>
        <Text style={styles.title}>내 활동</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7A5AF8" />
          <Text style={styles.centerText}>활동 정보를 불러오는 중...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchActivities}>
            <Text style={styles.retryText}>다시 불러오기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {activities.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>참여한 활동이 없습니다.</Text>
              <Text style={styles.emptyText}>정보 탭에서 비교과 활동을 확인해보세요.</Text>
            </View>
          ) : (
            activities.map(activity => (
              <View key={`${activity.id}-${activity.created_at}`} style={styles.card}>
                <Text style={styles.cardTitle}>{activity.title}</Text>
                {!!activity.comment && <Text style={styles.comment}>{activity.comment}</Text>}
                {!!activity.created_at && (
                  <Text style={styles.date}>참여일 {formatDate(activity.created_at)}</Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 16 },
  logo: { fontSize: 20, fontWeight: '700', color: '#7A5AF8', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  centerText: { marginTop: 12, color: '#667085' },
  errorText: { color: '#EF4444', marginBottom: 16, textAlign: 'center' },
  retryButton: { backgroundColor: '#7A5AF8', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingBottom: 120 },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#101828', marginBottom: 8 },
  comment: { fontSize: 14, color: '#344054', marginBottom: 8 },
  date: { fontSize: 13, color: '#667085' },
  emptyCard: { padding: 24, borderRadius: 16, backgroundColor: '#F9FAFB', alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#667085' },
});
