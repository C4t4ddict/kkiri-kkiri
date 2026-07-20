import React, { useCallback, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import axios from 'axios';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types';
import colors from '../config/colors';
import AppRefreshControl from '../components/AppRefreshControl';
import ApplicationStatusBadge from '../components/ApplicationStatusBadge';

const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
};

const formatPeriod = (start?: string | null, end?: string | null) =>
  [formatDate(start), formatDate(end)].filter(Boolean).join(' ~ ');

export default function FavoriteActivitiesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFavorites = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await axios.get<any[]>(`${BASE_URL}/api/favorite-activities`, {
        headers: { 'x-user-id': String(user.id) },
      });
      setActivities(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('관심 활동 목록 조회 오류:', error);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchFavorites();
    }, [fetchFavorites])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchFavorites();
    } finally {
      setRefreshing(false);
    }
  }, [fetchFavorites]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={activities.length ? styles.content : styles.emptyContent}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="heart-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>저장한 관심 활동이 없어요</Text>
            <Text style={styles.emptyDescription}>정보 상세 화면에서 하트를 눌러 저장해보세요.</Text>
          </View>
        ) : (
          activities.map((activity) => {
            const period = formatPeriod(
              activity.application_period_start,
              activity.application_period_end
            );
            return (
              <TouchableOpacity
                key={activity.activity_id}
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('InfoDetail', { id: Number(activity.activity_id) })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{activity.category || '활동'}</Text>
                  </View>
                  <Icon name="heart" size={20} color={colors.primary} />
                </View>
                <Text style={styles.title} numberOfLines={2}>{activity.title}</Text>
                {activity.topic_category ? (
                  <Text style={styles.topic}>{activity.topic_category}</Text>
                ) : null}
                {period ? (
                  <View style={styles.periodRow}>
                    <Text style={styles.periodText}>신청 {period}</Text>
                    <ApplicationStatusBadge
                      start={activity.application_period_start}
                      end={activity.application_period_end}
                    />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  emptyContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center' },
  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  emptyTitle: { marginTop: 16, color: colors.textMain, fontSize: 17, fontWeight: '800' },
  emptyDescription: { marginTop: 7, color: colors.textSub, fontSize: 13, textAlign: 'center' },
  card: {
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: {
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: colors.primarySurface,
  },
  categoryText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  title: { color: colors.textMain, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  topic: { marginTop: 7, color: colors.primary, fontSize: 13, fontWeight: '700' },
  periodRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  periodText: { color: colors.textSub, fontSize: 13 },
});
