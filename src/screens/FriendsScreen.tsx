import React, { useCallback, useMemo, useState } from 'react';
import { Image, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Friend = { user_id: number; name: string; profile_picture?: string | null; unread_count: number; last_message_at?: string | null };
type FriendRequest = { friendship_id: number; user_id: number; name: string; profile_picture?: string | null; created_at: string };

function Avatar({ uri, name }: { uri?: string | null; name: string }) {
  return uri ? <Image source={{ uri }} style={styles.avatar} /> : (
    <View style={styles.avatarFallback}><Text style={styles.avatarText}>{name.slice(0, 1)}</Text></View>
  );
}

export default function FriendsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [friendsResponse, requestsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/friends`, { headers: { 'x-user-id': String(user.id) } }),
        fetch(`${API_BASE_URL}/api/friends/requests`, { headers: { 'x-user-id': String(user.id) } }),
      ]);
      const friendsData = await friendsResponse.json();
      const requestsData = await requestsResponse.json();
      if (!friendsResponse.ok) throw new Error(friendsData.message || '친구 목록을 불러오지 못했습니다');
      setFriends(Array.isArray(friendsData.friends) ? friendsData.friends : []);
      setRequests(requestsResponse.ok && Array.isArray(requestsData) ? requestsData : []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '친구 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (friendshipId: number, decision: 'ACCEPTED' | 'REJECTED') => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/friends/requests/${friendshipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '친구 요청을 처리하지 못했습니다');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '친구 요청을 처리하지 못했습니다');
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? friends.filter((friend) => friend.name.toLowerCase().includes(query)) : friends;
  }, [friends, search]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.searchBox}>
        <Icon name="search-outline" size={19} color="#667085" />
        <TextInput value={search} onChangeText={setSearch} placeholder="친구 이름 검색" placeholderTextColor="#98A2B3" style={styles.searchInput} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {requests.length ? <Text style={styles.sectionTitle}>받은 친구 요청 {requests.length}</Text> : null}
        {requests.map((request) => (
          <View key={request.friendship_id} style={styles.requestCard}>
            <Avatar uri={request.profile_picture} name={request.name} />
            <Text style={styles.requestName}>{request.name}</Text>
            <TouchableOpacity style={styles.rejectButton} onPress={() => respond(request.friendship_id, 'REJECTED')}>
              <Text style={styles.rejectText}>거절</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton} onPress={() => respond(request.friendship_id, 'ACCEPTED')}>
              <Text style={styles.acceptText}>수락</Text>
            </TouchableOpacity>
          </View>
        ))}
        <Text style={styles.sectionTitle}>친구 {friends.length}</Text>
        {loading ? <Text style={styles.empty}>친구 목록을 불러오는 중...</Text> : null}
        {!loading && !filtered.length ? <Text style={styles.empty}>{search ? '검색 결과가 없어요' : '아직 등록된 친구가 없어요'}</Text> : null}
        {filtered.map((friend) => (
          <TouchableOpacity
            key={friend.user_id}
            style={styles.friendRow}
            onPress={() => navigation.navigate('MessageThread', { friendUserId: friend.user_id, friendName: friend.name })}
            activeOpacity={0.75}
          >
            <View style={styles.avatarWrap}>
              <Avatar uri={friend.profile_picture} name={friend.name} />
              {Number(friend.unread_count) > 0 ? (
                <View style={styles.unreadBadge}><Text style={styles.unreadText}>{Math.min(99, Number(friend.unread_count))}</Text></View>
              ) : null}
            </View>
            <View style={styles.friendCopy}>
              <Text style={styles.friendName}>{friend.name}</Text>
              <Text style={styles.friendSub}>{friend.last_message_at ? '최근 쪽지가 있어요' : '친구가 되었어요'}</Text>
            </View>
            <View style={styles.messageButton}><Icon name="mail-outline" size={18} color={colors.primary} /><Text style={styles.messageButtonText}>쪽지</Text></View>
          </TouchableOpacity>
        ))}
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('FriendAdd')}>
        <Icon name="person-add-outline" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, paddingHorizontal: 13, height: 46, borderRadius: 13, backgroundColor: '#F2F4F7' },
  searchInput: { flex: 1, color: colors.textMain, fontSize: 14 },
  content: { paddingHorizontal: 18, paddingBottom: 110 },
  sectionTitle: { marginTop: 12, marginBottom: 10, color: colors.textMain, fontSize: 16, fontWeight: '900' },
  avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#EAECF0' },
  avatarFallback: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySurface },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  avatarWrap: { position: 'relative' },
  unreadBadge: { position: 'absolute', right: -5, top: -5, minWidth: 19, height: 19, paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  unreadText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  requestCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9, padding: 12, borderRadius: 16, backgroundColor: '#FAF9FF' },
  requestName: { flex: 1, color: colors.textMain, fontSize: 14, fontWeight: '800' },
  rejectButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F2F4F7' },
  rejectText: { color: '#667085', fontSize: 11, fontWeight: '800' },
  acceptButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primarySurface },
  acceptText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  friendCopy: { flex: 1 },
  friendName: { color: colors.textMain, fontSize: 15, fontWeight: '800' },
  friendSub: { marginTop: 4, color: colors.textSub, fontSize: 11 },
  messageButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primarySurface },
  messageButtonText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  empty: { paddingVertical: 28, textAlign: 'center', color: colors.textSub, fontSize: 13 },
  error: { marginTop: 14, color: '#D92D20', fontSize: 12 },
  fab: { position: 'absolute', right: 22, bottom: 25, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, shadowColor: colors.primaryDark, shadowOpacity: 0.28, shadowOffset: { width: 0, height: 5 }, shadowRadius: 9, elevation: 7 },
});
