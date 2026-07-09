import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

type Participation = {
  participation_id: number;
  activity_id: number;
  participated_at?: string;
  participated_with?: number[] | string;
};

type UserInfo = {
  id: number;
  user_id?: number;
  name: string;
  department?: string;
  email?: string;
};

const BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const parseParticipantIds = (value?: number[] | string) => {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
    } catch {
      return value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(Number.isFinite);
    }
  }

  return [];
};

const getActivityTitle = (activity: any, activityId: number) =>
  activity?.title ||
  activity?.activity_name ||
  activity?.post_name ||
  `활동 ${activityId}`;

export default function MatchingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id;
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [activityTitles, setActivityTitles] = useState<Record<number, string>>({});
  const [usersById, setUsersById] = useState<Record<number, UserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teammateIds = useMemo(() => {
    const ids = new Set<number>();
    participations.forEach(item => {
      parseParticipantIds(item.participated_with)
        .filter(id => Number(id) !== Number(userId))
        .forEach(id => ids.add(Number(id)));
    });
    return Array.from(ids);
  }, [participations, userId]);

  const fetchMatchingData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setError('로그인이 필요합니다.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const participationResponse = await fetch(`${BASE_URL}/api/participations/user/${userId}`);
      const participationData = await participationResponse.json();

      if (!participationResponse.ok || !participationData.success) {
        throw new Error(participationData.message || '매칭 정보를 불러오지 못했습니다.');
      }

      const nextParticipations: Participation[] = participationData.participations || [];
      setParticipations(nextParticipations);

      const activityEntries = await Promise.all(
        nextParticipations.map(async item => {
          const response = await fetch(`${BASE_URL}/api/activities/${item.activity_id}`);
          const activity = await response.json();
          return [item.activity_id, getActivityTitle(activity, item.activity_id)] as const;
        })
      );
      setActivityTitles(Object.fromEntries(activityEntries));

      const ids = Array.from(
        new Set(
          nextParticipations.flatMap(item =>
            parseParticipantIds(item.participated_with).filter(id => Number(id) !== Number(userId))
          )
        )
      );

      if (ids.length > 0) {
        const usersResponse = await fetch(`${BASE_URL}/api/users/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: ids }),
        });
        const usersData = await usersResponse.json();

        if (usersResponse.ok && usersData.success) {
          const nextUsers = (usersData.users || []).reduce((acc: Record<number, UserInfo>, item: UserInfo) => {
            acc[Number(item.id || item.user_id)] = item;
            return acc;
          }, {});
          setUsersById(nextUsers);
        }
      } else {
        setUsersById({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '매칭 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMatchingData();
  }, [fetchMatchingData]);

  useFocusEffect(
    useCallback(() => {
      fetchMatchingData();
    }, [fetchMatchingData])
  );

  const goEvaluation = (member: UserInfo, activityId: number) => {
    navigation.navigate('MyPage3', {
      user,
      selectedMember: {
        id: member.id || member.user_id,
        name: member.name,
        department: member.department || '',
        activity_id: activityId,
        activity_title: activityTitles[activityId] || `활동 ${activityId}`,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>끼리끼리</Text>
        <Text style={styles.title}>팀원 매칭</Text>
        <Text style={styles.subtitle}>함께 참여한 팀원을 확인하고 평가할 수 있습니다.</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7A5AF8" />
          <Text style={styles.centerText}>매칭 정보를 불러오는 중...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMatchingData}>
            <Text style={styles.retryText}>다시 불러오기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {teammateIds.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>매칭된 팀원이 없습니다.</Text>
              <Text style={styles.emptyText}>참여 활동이 생기면 팀원이 표시됩니다.</Text>
            </View>
          ) : (
            participations.map(participation => {
              const members = parseParticipantIds(participation.participated_with)
                .filter(id => Number(id) !== Number(userId))
                .map(id => usersById[Number(id)])
                .filter(Boolean);

              if (members.length === 0) return null;

              return (
                <View key={participation.participation_id} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {activityTitles[participation.activity_id] || `활동 ${participation.activity_id}`}
                  </Text>
                  {!!participation.participated_at && (
                    <Text style={styles.period}>{participation.participated_at}</Text>
                  )}
                  {members.map(member => (
                    <TouchableOpacity
                      key={`${participation.participation_id}-${member.id || member.user_id}`}
                      style={styles.memberRow}
                      onPress={() => goEvaluation(member, participation.activity_id)}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{member.name?.slice(0, 1) || '?'}</Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <Text style={styles.memberDept}>{member.department || '학과 정보 없음'}</Text>
                      </View>
                      <Text style={styles.evaluateText}>평가</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })
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
  subtitle: { marginTop: 8, fontSize: 14, color: '#667085' },
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
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#101828' },
  period: { marginTop: 4, marginBottom: 10, fontSize: 13, color: '#667085' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAECF0',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#7A5AF8', fontWeight: '800', fontSize: 16 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#101828' },
  memberDept: { marginTop: 2, fontSize: 13, color: '#667085' },
  evaluateText: { color: '#7A5AF8', fontWeight: '700' },
  emptyCard: { padding: 24, borderRadius: 16, backgroundColor: '#F9FAFB', alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#667085' },
});
