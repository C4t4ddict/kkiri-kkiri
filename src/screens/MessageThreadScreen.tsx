import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
type Message = { message_id: number; sender_id: number; recipient_id: number; content: string; created_at: string };

export default function MessageThreadScreen() {
  const { user } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, 'MessageThread'>>();
  const { friendUserId } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/friends/${friendUserId}/messages`, { headers: { 'x-user-id': String(user.id) } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '쪽지를 불러오지 못했습니다');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      await fetch(`${API_BASE_URL}/api/friends/${friendUserId}/messages/read`, {
        method: 'PUT', headers: { 'x-user-id': String(user.id) },
      });
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '쪽지를 불러오지 못했습니다');
    }
  }, [friendUserId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!user?.id || !content.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/friends/${friendUserId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '쪽지를 보내지 못했습니다');
      setContent('');
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '쪽지를 보내지 못했습니다');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!messages.length ? <Text style={styles.empty}>첫 쪽지를 보내보세요.</Text> : null}
          {messages.map((message) => {
            const mine = Number(message.sender_id) === Number(user?.id);
            return (
              <View key={message.message_id} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.messageText, mine && styles.mineText]}>{message.content}</Text>
                  <Text style={[styles.time, mine && styles.mineTime]}>{String(message.created_at).slice(11, 16)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.composer}>
          <View style={styles.inputWrap}>
            <TextInput
              value={content}
              onChangeText={(value) => setContent(value.slice(0, 200))}
              multiline
              placeholder="쪽지를 입력하세요"
              placeholderTextColor="#98A2B3"
              style={styles.input}
            />
            <Text style={styles.count}>{content.length}/200</Text>
          </View>
          <TouchableOpacity style={[styles.send, (!content.trim() || sending) && styles.disabled]} disabled={!content.trim() || sending} onPress={send}>
            <Icon name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  messages: { flexGrow: 1, padding: 16, paddingBottom: 22 },
  empty: { marginTop: 40, textAlign: 'center', color: colors.textSub, fontSize: 13 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 16 },
  theirs: { borderBottomLeftRadius: 5, backgroundColor: '#F2F4F7' },
  mine: { borderBottomRightRadius: 5, backgroundColor: colors.primary },
  messageText: { color: colors.textMain, fontSize: 14, lineHeight: 20 },
  mineText: { color: '#FFFFFF' },
  time: { marginTop: 4, alignSelf: 'flex-end', color: '#98A2B3', fontSize: 9 },
  mineTime: { color: '#D9D1FF' },
  error: { paddingHorizontal: 18, paddingBottom: 5, color: '#D92D20', fontSize: 11 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0', backgroundColor: '#FFFFFF' },
  inputWrap: { flex: 1, minHeight: 48, maxHeight: 104, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 5, borderRadius: 16, backgroundColor: '#F2F4F7' },
  input: { minHeight: 25, maxHeight: 70, padding: 0, color: colors.textMain, fontSize: 14 },
  count: { alignSelf: 'flex-end', color: '#98A2B3', fontSize: 9 },
  send: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  disabled: { opacity: 0.4 },
});
