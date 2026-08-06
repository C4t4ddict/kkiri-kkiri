import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const CATEGORIES = [
  { value: 'IMPROVEMENT', label: '개선사항', icon: 'sparkles-outline' },
  { value: 'BUG', label: '오류 제보', icon: 'bug-outline' },
  { value: 'OTHER', label: '기타', icon: 'chatbubble-ellipses-outline' },
] as const;

type Feedback = {
  feedback_id: number;
  category: string;
  content: string;
  status: string;
  created_at: string;
  replies?: Array<{ reply_id: number; content: string; created_at: string }>;
};

export default function DeveloperFeedbackScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState('IMPROVEMENT');
  const [content, setContent] = useState('');
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadFeedbacks = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/developer-feedback/mine`, {
        headers: { 'x-user-id': String(user.id) },
      });
      const data = await response.json();
      if (response.ok) setFeedbacks(Array.isArray(data) ? data : []);
    } catch {
      setMessage('전달 내역을 불러오지 못했습니다.');
    }
  }, [user?.id]);

  useEffect(() => { loadFeedbacks(); }, [loadFeedbacks]);

  const submit = async () => {
    if (!user?.id || content.trim().length < 10 || submitting) {
      setMessage('내용을 10자 이상 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/developer-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ category, content, platform: Platform.OS }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '전송하지 못했습니다');
      setContent('');
      setMessage('의견이 전달되었습니다. 감사합니다.');
      await loadFeedbacks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '전송하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.introCard}>
          <Icon name="code-slash-outline" size={26} color={colors.primary} />
          <View style={styles.introBody}>
            <Text style={styles.title}>개발자에게 한마디</Text>
            <Text style={styles.description}>불편한 점이나 필요한 기능을 알려주세요.</Text>
          </View>
        </View>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((item) => {
            const active = category === item.value;
            return (
              <TouchableOpacity
                key={item.value}
                style={[styles.category, active && styles.categoryActive]}
                onPress={() => setCategory(item.value)}
              >
                <Icon name={item.icon} size={18} color={active ? colors.primary : colors.textSub} />
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          value={content}
          onChangeText={(value) => setContent(value.slice(0, 2000))}
          placeholder="상황과 재현 방법을 자세히 적어주시면 빠르게 확인할 수 있어요."
          placeholderTextColor={colors.inputPlaceholder}
          multiline
          textAlignVertical="top"
          style={styles.input}
        />
        <Text style={styles.count}>{content.length}/2000</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TouchableOpacity style={[styles.submit, submitting && styles.disabled]} disabled={submitting} onPress={submit}>
          <Text style={styles.submitText}>{submitting ? '전송 중...' : '개발자에게 전달'}</Text>
        </TouchableOpacity>

        {feedbacks.length ? <Text style={styles.historyTitle}>최근 전달 내역</Text> : null}
        {feedbacks.map((feedback) => (
          <View key={feedback.feedback_id} style={styles.historyCard}>
            <Text style={styles.historyMeta}>
              {CATEGORIES.find((item) => item.value === feedback.category)?.label || '기타'} · {String(feedback.created_at).slice(0, 10)}
            </Text>
            <Text style={styles.historyContent} numberOfLines={3}>{feedback.content}</Text>
            {(feedback.replies || []).map((reply) => (
              <View key={reply.reply_id} style={styles.replyCard}>
                <Text style={styles.replyLabel}>개발자 답장 · {String(reply.created_at).slice(0, 10)}</Text>
                <Text style={styles.replyContent}>{reply.content}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 20, paddingBottom: 44 },
  introCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 18, backgroundColor: colors.primarySurface },
  introBody: { flex: 1, marginLeft: 12 },
  title: { color: colors.textMain, fontSize: 18, fontWeight: '900' },
  description: { marginTop: 4, color: colors.textSub, fontSize: 13 },
  categoryRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  category: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.inputBackground },
  categoryActive: { borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: colors.primarySurface },
  categoryText: { color: colors.textSub, fontSize: 12, fontWeight: '700' },
  categoryTextActive: { color: colors.primaryDark },
  input: { height: 190, marginTop: 14, padding: 16, borderRadius: 16, color: colors.textMain, fontSize: 15, lineHeight: 22, backgroundColor: colors.inputBackground },
  count: { marginTop: 6, textAlign: 'right', color: colors.textSub, fontSize: 11 },
  message: { marginTop: 8, color: colors.primaryDark, fontSize: 13 },
  submit: { marginTop: 16, padding: 16, borderRadius: 14, alignItems: 'center', backgroundColor: colors.primary },
  disabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  historyTitle: { marginTop: 30, marginBottom: 10, color: colors.textMain, fontSize: 17, fontWeight: '900' },
  historyCard: { marginBottom: 10, padding: 15, borderRadius: 15, backgroundColor: colors.inputBackground },
  historyMeta: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  historyContent: { marginTop: 7, color: colors.textMain, fontSize: 13, lineHeight: 19 },
  replyCard: { marginTop: 11, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: 10, backgroundColor: '#FFFFFF' },
  replyLabel: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  replyContent: { marginTop: 6, color: colors.textMain, fontSize: 12, lineHeight: 18 },
});
