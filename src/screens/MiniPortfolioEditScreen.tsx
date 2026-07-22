import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenState from '../components/ScreenState';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import colors from '../config/colors';

type EditRoute = RouteProp<RootStackParamList, 'MiniPortfolioEditScreen'>;
type Navigation = StackNavigationProp<RootStackParamList>;

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const imageUrl = (value: string) => value.startsWith('/uploads/') ? `${API_BASE_URL}${value}` : value;

export default function MiniPortfolioEditScreen() {
  const route = useRoute<EditRoute>();
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const { portfolioId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [activityType, setActivityType] = useState('');
  const [role, setRole] = useState('');
  const [summary, setSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [reflection, setReflection] = useState('');
  const [links, setLinks] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/past-activities/${portfolioId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '미니포트폴리오를 불러오지 못했습니다');
      setTitle(data.activity_name || '');
      setActivityType(data.activity_type || '');
      setRole(data.role || '');
      setSummary(data.summary || '');
      setAchievements((data.achievements || []).join('\n'));
      setReflection(data.reflection || '');
      setLinks((data.links || []).map((link: any) => `${link.title || '관련 링크'} | ${link.url}`).join('\n'));
      setImages(Array.isArray(data.image_urls) ? data.image_urls : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '미니포트폴리오를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [portfolioId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const addImage = () => {
    if (images.length >= 6) {
      Alert.alert('이미지 제한', '이미지는 최대 6장까지 추가할 수 있습니다.');
      return;
    }
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, maxWidth: 1600, maxHeight: 1600, selectionLimit: 1 },
      async (result) => {
        const selected = result.assets?.[0];
        if (!selected?.uri || !user?.id) return;
        try {
          const formData = new FormData();
          formData.append('image', {
            uri: selected.uri,
            type: selected.type || 'image/jpeg',
            name: selected.fileName || `portfolio-${portfolioId}-${Date.now()}.jpg`,
          } as any);
          const response = await fetch(
            `${API_BASE_URL}/users/${user.id}/past-activities/${portfolioId}/images`,
            { method: 'POST', body: formData },
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || '이미지를 업로드하지 못했습니다');
          setImages((current) => [...current, data.imageUrl].slice(0, 6));
        } catch (uploadError) {
          Alert.alert('업로드 실패', uploadError instanceof Error ? uploadError.message : '이미지를 업로드하지 못했습니다');
        }
      },
    );
  };

  const save = async () => {
    if (!user?.id || saving) return;
    if (!title.trim()) {
      Alert.alert('제목 확인', '활동 제목을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const parsedLinks = links.split('\n').map((line) => {
        const [label, ...urlParts] = line.split('|');
        return { title: label.trim(), url: urlParts.join('|').trim() };
      }).filter((link) => /^https?:\/\//i.test(link.url));
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/past-activities/${portfolioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          activity_type: activityType,
          role,
          summary,
          achievements: achievements.split('\n').map((item) => item.trim()).filter(Boolean),
          reflection,
          image_urls: images,
          links: parsedLinks,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '미니포트폴리오를 저장하지 못했습니다');
      Alert.alert('저장 완료', '편집 내용이 미니포트폴리오와 PDF에 반영됩니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ]);
    } catch (saveError) {
      Alert.alert('저장 실패', saveError instanceof Error ? saveError.message : '미니포트폴리오를 저장하지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenState kind="loading" title="편집 내용을 준비하고 있어요" />;
  if (error) return <ScreenState kind="error" title={error} onRetry={load} />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.guide}>자동으로 정리된 기록을 나만의 포트폴리오 문장으로 다듬어보세요.</Text>
        <Field label="활동 제목" value={title} onChangeText={setTitle} maxLength={255} />
        <View style={styles.row}>
          <View style={styles.flex}><Field label="활동 유형" value={activityType} onChangeText={setActivityType} maxLength={100} /></View>
          <View style={styles.flex}><Field label="맡은 역할" value={role} onChangeText={setRole} maxLength={100} /></View>
        </View>
        <Field label="활동 요약" value={summary} onChangeText={setSummary} multiline placeholder="활동에서 맡은 역할과 기여를 요약해주세요." />
        <Field label="핵심 성과" value={achievements} onChangeText={setAchievements} multiline placeholder={'성과를 한 줄에 하나씩 입력해주세요.\n예: 서비스 기획서와 발표 자료 완성'} />
        <Field label="활동 회고" value={reflection} onChangeText={setReflection} multiline placeholder="배운 점, 어려웠던 점, 다음 활동에 적용할 점을 작성해주세요." />

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.label}>포트폴리오 이미지</Text>
            <Text style={styles.helper}>첫 번째 이미지가 PDF 표지에 사용됩니다.</Text>
          </View>
          <Pressable style={styles.addButton} onPress={addImage}>
            <Icon name="add" size={17} color={colors.primary} />
            <Text style={styles.addButtonText}>추가</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageList}>
          {images.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.imageCard}>
              <Image source={{ uri: imageUrl(item) }} style={styles.image} />
              <Pressable style={styles.removeImage} onPress={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>
                <Icon name="close" size={15} color="#FFFFFF" />
              </Pressable>
              {index === 0 ? <Text style={styles.coverLabel}>표지</Text> : null}
            </View>
          ))}
          {!images.length ? <Text style={styles.emptyImages}>추가된 이미지가 없습니다.</Text> : null}
        </ScrollView>

        <Field
          label="관련 링크"
          value={links}
          onChangeText={setLinks}
          multiline
          placeholder={'한 줄에 “제목 | https://주소” 형식으로 입력해주세요.'}
        />
      </ScrollView>
      <View style={styles.footer}>
        <Pressable disabled={saving} style={styles.saveButton} onPress={save}>
          <Text style={styles.saveButtonText}>{saving ? '저장 중' : '편집 내용 저장'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({ label, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#98A2B3"
        style={[styles.input, multiline && styles.multilineInput]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 20, paddingBottom: 120 },
  guide: { marginBottom: 18, color: '#667085', fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  field: { marginBottom: 17 },
  label: { marginBottom: 8, color: '#344054', fontSize: 13, fontWeight: '800' },
  helper: { marginTop: -3, color: '#98A2B3', fontSize: 11 },
  input: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DDE1EA', borderRadius: 14, backgroundColor: '#FFFFFF', color: '#101828', fontSize: 14 },
  multilineInput: { minHeight: 112, paddingTop: 13, lineHeight: 21 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1EDFF' },
  addButtonText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  imageList: { minHeight: 100, gap: 10, paddingVertical: 10, marginBottom: 12 },
  imageCard: { width: 112, height: 92, overflow: 'hidden', borderRadius: 14, backgroundColor: '#EAECF0' },
  image: { width: '100%', height: '100%' },
  removeImage: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,24,40,0.72)' },
  coverLabel: { position: 'absolute', left: 7, bottom: 7, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.primary, color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  emptyImages: { paddingVertical: 34, color: '#98A2B3', fontSize: 12 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E7EC', backgroundColor: '#FFFFFF' },
  saveButton: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
