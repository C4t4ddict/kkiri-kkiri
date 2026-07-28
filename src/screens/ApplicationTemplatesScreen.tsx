import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import AppRefreshControl from '../components/AppRefreshControl';
import ScreenState from '../components/ScreenState';
import colors from '../config/colors';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export type ApplicationTemplate = {
  template_id: number;
  title: string;
  content: string;
  is_default: number | boolean;
  updated_at?: string;
};

export default function ApplicationTemplatesScreen() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ApplicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ApplicationTemplate | null | undefined>(undefined);

  const load = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/application-templates`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '지원서를 불러오지 못했습니다');
      setTemplates(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '지원서를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (template: ApplicationTemplate) => {
    Alert.alert('지원서 삭제', `“${template.title}” 템플릿을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const response = await fetch(`${API_BASE_URL}/api/application-templates/${template.template_id}`, { method: 'DELETE' });
          const data = await response.json();
          if (!response.ok) return Alert.alert('삭제 실패', data.message || '지원서를 삭제하지 못했습니다');
          await load(true);
        },
      },
    ]);
  };

  if (loading && !templates.length) return <ScreenState kind="loading" title="지원서 템플릿을 준비하고 있어요" />;
  if (error && !templates.length) return <ScreenState kind="error" title={error} onRetry={() => load()} />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} />}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>APPLICATION LIBRARY</Text>
          <Text style={styles.heroTitle}>지원서를 미리 준비해두세요</Text>
          <Text style={styles.heroText}>모집글마다 불러온 뒤 필요한 부분만 다듬어 빠르게 지원할 수 있습니다.</Text>
          <Pressable style={styles.newButton} onPress={() => setEditing(null)}>
            <Icon name="add" size={18} color="#FFFFFF" />
            <Text style={styles.newButtonText}>새 템플릿</Text>
          </Pressable>
        </View>

        {templates.map((template) => (
          <View key={template.template_id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{template.title}</Text>
                {template.is_default ? <Text style={styles.defaultBadge}>기본</Text> : null}
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => setEditing(template)} style={styles.iconButton}><Icon name="create-outline" size={18} color={colors.primary} /></Pressable>
                <Pressable onPress={() => remove(template)} style={styles.iconButton}><Icon name="trash-outline" size={18} color="#D92D20" /></Pressable>
              </View>
            </View>
            <Text style={styles.preview} numberOfLines={4}>{template.content}</Text>
          </View>
        ))}
        {!templates.length ? <ScreenState kind="empty" title="저장된 지원서가 없습니다" description="자주 사용하는 자기소개와 지원 동기를 템플릿으로 만들어보세요." /> : null}
      </ScrollView>

      <TemplateEditor
        template={editing}
        visible={editing !== undefined}
        onClose={() => setEditing(undefined)}
        onSaved={async () => { setEditing(undefined); await load(true); }}
      />
    </SafeAreaView>
  );
}

function TemplateEditor({ template, visible, onClose, onSaved }: {
  template: ApplicationTemplate | null | undefined;
  visible: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setTitle(template?.title || '');
    setContent(template?.content || '');
    setIsDefault(Boolean(template?.is_default));
  }, [template, visible]);

  const save = async () => {
    if (!title.trim() || !content.trim() || saving) {
      if (!saving) Alert.alert('입력 확인', '제목과 지원 내용을 모두 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const path = template ? `/api/application-templates/${template.template_id}` : '/api/application-templates';
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: template ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, is_default: isDefault }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '지원서를 저장하지 못했습니다');
      await onSaved();
    } catch (saveError) {
      Alert.alert('저장 실패', saveError instanceof Error ? saveError.message : '지원서를 저장하지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{template ? '지원서 수정' : '새 지원서'}</Text>
            <Pressable onPress={onClose}><Icon name="close" size={24} color={colors.textMain} /></Pressable>
          </View>
          <Text style={styles.label}>템플릿 이름</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="예: 기획 직무 지원서" placeholderTextColor="#98A2B3" style={styles.input} />
          <Text style={styles.label}>지원 내용</Text>
          <TextInput value={content} onChangeText={setContent} maxLength={2000} multiline textAlignVertical="top" placeholder="자기소개, 지원 동기, 기여할 수 있는 점을 작성해주세요." placeholderTextColor="#98A2B3" style={[styles.input, styles.contentInput]} />
          <Pressable style={styles.defaultRow} onPress={() => setIsDefault((current) => !current)}>
            <Icon name={isDefault ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isDefault ? colors.primary : '#98A2B3'} />
            <Text style={styles.defaultText}>기본 지원서로 사용</Text>
          </Pressable>
          <Pressable disabled={saving} onPress={save} style={styles.saveButton}><Text style={styles.saveButtonText}>{saving ? '저장 중' : '저장하기'}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 18, paddingBottom: 40 },
  hero: { marginBottom: 18, padding: 22, borderRadius: 24, backgroundColor: colors.primaryDark },
  eyebrow: { color: '#D9D1FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  heroTitle: { marginTop: 8, color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroText: { marginTop: 8, color: '#DDD6FE', fontSize: 12, lineHeight: 19 },
  newButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.primary },
  newButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  card: { marginBottom: 11, padding: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 19, backgroundColor: '#FFFFFF' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flexShrink: 1, color: colors.textMain, fontSize: 15, fontWeight: '900' },
  defaultBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', color: colors.primary, backgroundColor: colors.primarySurface, fontSize: 9, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 5 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F2F4F7' },
  preview: { marginTop: 12, color: colors.textSub, fontSize: 12, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.46)' },
  modalCard: { maxHeight: '90%', padding: 22, paddingBottom: 34, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: colors.textMain, fontSize: 20, fontWeight: '900' },
  label: { marginBottom: 7, color: '#475467', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 48, marginBottom: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 13, color: colors.textMain, backgroundColor: '#FFFFFF' },
  contentInput: { minHeight: 180, paddingTop: 13, lineHeight: 21 },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  defaultText: { color: colors.textMain, fontSize: 13, fontWeight: '700' },
  saveButton: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primary },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
