import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

type Props = { teamId?: number | null };

type Notice = {
  notice_id: number;
  author_id: number;
  title: string;
  content: string;
  author_name: string;
  created_at: string;
  comment_count: number;
};

type NoticeDetail = Notice & {
  comments: Array<{
    comment_id: number;
    author_id: number;
    author_name: string;
    content: string;
    created_at: string;
  }>;
};

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const formatMeta = (createdAt: string, authorName: string) => {
  const created = new Date(createdAt);
  const timestamp = Number.isNaN(created.getTime()) ? '' : `${created.getMonth() + 1}월 ${created.getDate()}일`;
  return `${timestamp} | ${authorName}`;
};

export default function NoticeBoard({ teamId }: Props) {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<NoticeDetail | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeDetail | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = useMemo(() => ({ 'x-user-id': String(user?.id || '') }), [user?.id]);

  const loadNotices = useCallback(async () => {
    if (!teamId || !user?.id) {
      setNotices([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/teams/${teamId}/notices?limit=${expanded ? 100 : 3}`, { headers });
      const data = await response.json();
      setNotices(Array.isArray(data) ? data : []);
    } catch {
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [expanded, headers, teamId, user?.id]);

  useEffect(() => { loadNotices(); }, [loadNotices]);
  useFocusEffect(useCallback(() => { loadNotices(); }, [loadNotices]));

  const openDetail = async (notice: Notice) => {
    if (!teamId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/teams/${teamId}/notices/${notice.notice_id}`, { headers });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setDetail(data);
      setDetailVisible(true);
    } catch {
      Alert.alert('공지사항을 불러오지 못했습니다');
    }
  };

  const openEditor = (notice?: NoticeDetail) => {
    setEditingNotice(notice ?? null);
    setTitle(notice?.title ?? '');
    setContent(notice?.content ?? '');
    setEditorVisible(true);
  };

  const saveNotice = async () => {
    if (!teamId || !title.trim() || !content.trim()) {
      Alert.alert('제목과 내용을 입력해주세요');
      return;
    }
    setSaving(true);
    try {
      const url = editingNotice
        ? `${API_BASE_URL}/teams/${teamId}/notices/${editingNotice.notice_id}`
        : `${API_BASE_URL}/teams/${teamId}/notices`;
      const response = await fetch(url, {
        method: editingNotice ? 'PUT' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '저장에 실패했습니다');
      setEditorVisible(false);
      if (detail && editingNotice?.notice_id === detail.notice_id) {
        setDetail({ ...detail, title: title.trim(), content: content.trim() });
      }
      await loadNotices();
    } catch (error) {
      Alert.alert('공지사항 저장 실패', error instanceof Error ? error.message : '다시 시도해주세요');
    } finally {
      setSaving(false);
    }
  };

  const submitComment = async () => {
    if (!teamId || !detail || !comment.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/teams/${teamId}/notices/${detail.notice_id}/comments`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: comment.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '댓글 작성에 실패했습니다');
      setComment('');
      await openDetail(detail);
      await loadNotices();
    } catch (error) {
      Alert.alert('댓글 작성 실패', error instanceof Error ? error.message : '다시 시도해주세요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>공지사항</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setExpanded((value) => !value)} hitSlop={8}>
            <Text style={styles.moreText}>{expanded ? '접기' : '더보기'}</Text>
          </Pressable>
          <Pressable onPress={() => openEditor()} style={styles.writeButton} hitSlop={8}>
            <Text style={styles.writeText}>글쓰기</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.list}>
        {loading ? <ActivityIndicator color={colors.primary} /> : notices.length > 0 ? notices.map((notice, index) => (
          <Pressable key={notice.notice_id} onPress={() => openDetail(notice)} style={[styles.noticeRow, index < notices.length - 1 && styles.noticeDivider]}>
            <View style={styles.noticeTitleRow}>
              <Text style={styles.noticeTitle} numberOfLines={1}>{notice.title}</Text>
              {notice.comment_count > 0 && <Text style={styles.commentBadge}>+{notice.comment_count}</Text>}
            </View>
            <Text style={styles.noticeMeta}>{formatMeta(notice.created_at, notice.author_name)}</Text>
          </Pressable>
        )) : <Text style={styles.empty}>아직 작성된 공지사항이 없어요</Text>}
      </View>

      <Modal visible={detailVisible} animationType="slide" transparent onRequestClose={() => setDetailVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>공지사항</Text>
              <Pressable onPress={() => setDetailVisible(false)} hitSlop={10}><Text style={styles.close}>닫기</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
              <View style={styles.detailHeading}>
                <Text style={styles.detailTitle}>{detail?.title}</Text>
                <Text style={styles.noticeMeta}>{detail ? formatMeta(detail.created_at, detail.author_name) : ''}</Text>
                {detail?.author_id === user?.id && <Pressable onPress={() => openEditor(detail ?? undefined)}><Text style={styles.editText}>제목·내용 수정</Text></Pressable>}
              </View>
              <Text style={styles.detailContent}>{detail?.content}</Text>
              <Text style={styles.commentHeading}>댓글 {detail?.comments.length ?? 0}</Text>
              {detail?.comments.map((item) => (
                <View key={item.comment_id} style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>{item.author_name}</Text>
                  <Text style={styles.commentContent}>{item.content}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.commentComposer}>
              <TextInput value={comment} onChangeText={setComment} placeholder="댓글을 남겨보세요" placeholderTextColor={colors.textSub} style={styles.commentInput} multiline />
              <Pressable disabled={saving} onPress={submitComment} style={[styles.commentSubmit, saving && styles.disabled]}><Text style={styles.commentSubmitText}>등록</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editorVisible} animationType="fade" transparent onRequestClose={() => setEditorVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editorCard}>
            <Text style={styles.modalTitle}>{editingNotice ? '공지사항 수정' : '공지사항 작성'}</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="제목" placeholderTextColor={colors.textSub} style={styles.titleInput} maxLength={160} />
            <TextInput value={content} onChangeText={setContent} placeholder="공지 내용을 입력하세요" placeholderTextColor={colors.textSub} style={styles.contentInput} multiline textAlignVertical="top" />
            <View style={styles.editorActions}>
              <Pressable onPress={() => setEditorVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></Pressable>
              <Pressable disabled={saving} onPress={saveNotice} style={[styles.saveButton, saving && styles.disabled]}><Text style={styles.saveText}>저장</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primarySurface, borderRadius: 26, padding: 24, marginBottom: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 21, color: colors.textMain, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreText: { color: colors.textSub, fontSize: 13, fontWeight: '700' },
  writeButton: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  writeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  list: { minHeight: 52 },
  noticeRow: { paddingVertical: 14 },
  noticeDivider: { borderBottomWidth: 1, borderBottomColor: '#DDD7F4' },
  noticeTitleRow: { flexDirection: 'row', alignItems: 'center' },
  noticeTitle: { flex: 1, color: colors.textMain, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  commentBadge: { marginLeft: 8, minWidth: 28, textAlign: 'center', borderRadius: 14, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', backgroundColor: '#FFFFFF', color: colors.primary, fontSize: 11, fontWeight: '800' },
  noticeMeta: { marginTop: 6, color: '#98A2B3', fontSize: 12, fontWeight: '600' },
  empty: { color: colors.textSub, fontSize: 14, paddingVertical: 16, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 40, 0.38)' },
  modalCard: { maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF', paddingTop: 22 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { color: colors.textMain, fontSize: 18, fontWeight: '800' },
  close: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  detailScroll: { padding: 24, paddingBottom: 12 },
  detailHeading: { paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailTitle: { color: colors.textMain, fontSize: 20, lineHeight: 28, fontWeight: '800' },
  editText: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 12 },
  detailContent: { color: colors.textMain, fontSize: 15, lineHeight: 24, paddingVertical: 22 },
  commentHeading: { color: colors.textMain, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  commentRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0EFF6' },
  commentAuthor: { color: colors.textMain, fontSize: 13, fontWeight: '800', marginBottom: 5 },
  commentContent: { color: colors.textSub, fontSize: 14, lineHeight: 20 },
  commentComposer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  commentInput: { flex: 1, maxHeight: 80, backgroundColor: colors.inputBackground, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: colors.textMain, fontSize: 14 },
  commentSubmit: { marginLeft: 8, borderRadius: 14, backgroundColor: colors.primary, paddingHorizontal: 13, paddingVertical: 12 },
  commentSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  editorCard: { margin: 20, borderRadius: 24, backgroundColor: '#FFFFFF', padding: 22 },
  titleInput: { marginTop: 16, borderRadius: 14, backgroundColor: colors.inputBackground, color: colors.textMain, fontSize: 15, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 12 },
  contentInput: { height: 150, marginTop: 10, borderRadius: 14, backgroundColor: colors.inputBackground, color: colors.textMain, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  cancelButton: { borderRadius: 12, backgroundColor: colors.inputBackground, paddingHorizontal: 16, paddingVertical: 11 },
  cancelText: { color: colors.textSub, fontWeight: '800' },
  saveButton: { borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 11 },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
