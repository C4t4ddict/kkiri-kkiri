import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

type Notification = {
  notification_id: number;
  type: 'notice' | 'notice_comment' | 'team_invitation';
  title: string;
  content: string;
  created_at: string;
  is_read: number | boolean;
  offer_id?: number | null;
  offer_status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | null;
};

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const relativeTime = (value: string) => {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};

export default function NotificationScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'활동' | '공지'>('활동');
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<number | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/notifications`, { headers: { 'x-user-id': String(user.id) } });
      const data = await response.json();
      setItems(Array.isArray(data) ? data : []);
      if (response.ok) {
        await fetch(`${API_BASE_URL}/notifications/read`, {
          method: 'PUT',
          headers: { 'x-user-id': String(user.id) },
        });
        setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadNotifications(); }, [loadNotifications]));
  const data = tab === '활동'
    ? items.filter((item) => item.type !== 'notice')
    : items.filter((item) => item.type === 'notice');

  const respondToOffer = async (item: Notification, decision: 'ACCEPTED' | 'REJECTED') => {
    if (!user?.id || !item.offer_id || respondingOfferId) return;
    setRespondingOfferId(item.offer_id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/team-join-offers/${item.offer_id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '합류 제안을 처리하지 못했습니다.');
      Alert.alert('완료', decision === 'ACCEPTED' ? '팀에 합류했습니다.' : '팀 합류 제안을 거절했습니다.');
      await loadNotifications();
    } catch (error) {
      Alert.alert('처리 실패', error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setRespondingOfferId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabs}>
        <View style={styles.tabBaseLine} />
        {(['활동', '공지'] as const).map((item) => (
          <TouchableOpacity key={item} style={styles.tabBtn} onPress={() => setTab(item)} activeOpacity={0.8}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
        <View style={[styles.tabActiveBar, tab === '활동' ? { left: 0 } : { left: '50%' }]} />
      </View>
      {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.notification_id)}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.is_read && styles.unreadCard]}>
              <View style={styles.cardTop}>
                <Text style={styles.channel}>
                  {item.type === 'team_invitation' ? '팀 합류 제안' : item.type === 'notice_comment' ? '댓글 알림' : '공지 알림'}
                </Text>
                <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.content} numberOfLines={1}>{item.content}</Text>
              {item.type === 'team_invitation' && item.offer_id ? (
                item.offer_status === 'PENDING' ? (
                  <View style={styles.offerActions}>
                    <TouchableOpacity
                      style={[styles.offerButton, styles.offerRejectButton]}
                      disabled={respondingOfferId === item.offer_id}
                      onPress={() => respondToOffer(item, 'REJECTED')}
                    >
                      <Text style={styles.offerRejectText}>거절</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.offerButton, styles.offerAcceptButton]}
                      disabled={respondingOfferId === item.offer_id}
                      onPress={() => respondToOffer(item, 'ACCEPTED')}
                    >
                      <Text style={styles.offerAcceptText}>
                        {respondingOfferId === item.offer_id ? '처리 중...' : '합류하기'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.offerResult}>
                    {item.offer_status === 'ACCEPTED'
                      ? '팀 합류를 수락했어요'
                      : item.offer_status === 'CANCELED'
                        ? '지원이 취소되었어요'
                        : '팀 합류 제안을 거절했어요'}
                  </Text>
                )
              ) : null}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>새 알림이 없어요</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  tabs: { position: 'relative', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingTop: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 16, color: '#98A2B3' },
  tabTextActive: { color: colors.textMain, fontWeight: '700' },
  tabBaseLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.border },
  tabActiveBar: { position: 'absolute', bottom: 0, width: '50%', height: 2, backgroundColor: colors.primary, borderRadius: 1 },
  loading: { marginTop: 28 },
  card: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unreadCard: { backgroundColor: '#FAF9FF' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  channel: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  time: { fontSize: 12, color: '#98A2B3' },
  title: { fontSize: 15, color: colors.textMain, fontWeight: '800' },
  content: { marginTop: 5, fontSize: 13, color: colors.textSub },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  offerButton: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  offerRejectButton: { backgroundColor: '#F2F4F7' },
  offerAcceptButton: { backgroundColor: colors.primarySurface },
  offerRejectText: { color: colors.textSub, fontSize: 13, fontWeight: '800' },
  offerAcceptText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  offerResult: { marginTop: 13, color: colors.textSub, fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textSub, paddingTop: 40 },
});
