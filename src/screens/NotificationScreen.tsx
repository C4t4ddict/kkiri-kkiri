import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

type Notification = {
  notification_id: number;
  type: 'notice' | 'notice_comment';
  title: string;
  content: string;
  created_at: string;
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

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/notifications`, { headers: { 'x-user-id': String(user.id) } });
      const data = await response.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadNotifications(); }, [loadNotifications]));
  const data = tab === '활동' ? items.filter((item) => item.type === 'notice_comment') : items.filter((item) => item.type === 'notice');

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
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.channel}>{item.type === 'notice_comment' ? '댓글 알림' : '공지 알림'}</Text>
                <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.content} numberOfLines={1}>{item.content}</Text>
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  channel: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  time: { fontSize: 12, color: '#98A2B3' },
  title: { fontSize: 15, color: colors.textMain, fontWeight: '800' },
  content: { marginTop: 5, fontSize: 13, color: colors.textSub },
  empty: { textAlign: 'center', color: colors.textSub, paddingTop: 40 },
});
