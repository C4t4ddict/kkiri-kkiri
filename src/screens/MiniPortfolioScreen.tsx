import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import colors from '../config/colors';

type MiniPortfolioRoute = RouteProp<RootStackParamList, 'MiniPortfolioScreen'>;
type Navigation = StackNavigationProp<RootStackParamList>;

type CompletedTask = {
  todo_id: number;
  title: string;
  scope_start_date?: string;
  scope_end_date?: string;
  completed_at?: string;
};

type MiniPortfolio = {
  portfolio_id: number;
  activity_name: string;
  activity_type: string;
  user_name: string;
  department?: string;
  role: string;
  period: string;
  summary: string;
  member_count: number;
  completed_task_count: number;
  achievements?: string[];
  reflection?: string;
  image_urls?: string[];
  links?: Array<{ title?: string; url: string }>;
  completed_tasks: {
    monthly?: CompletedTask[];
    weekly?: CompletedTask[];
    daily?: CompletedTask[];
    overall?: CompletedTask[];
  };
};

type TaskSectionProps = {
  title: string;
  subtitle: string;
  icon: string;
  tasks: CompletedTask[];
};

const API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';
const getImageUrl = (value: string) => value.startsWith('/uploads/') ? `${API_BASE_URL}${value}` : value;

function TaskSection({ title, subtitle, icon, tasks }: TaskSectionProps) {
  if (!tasks.length) return null;

  return (
    <View style={styles.taskSection}>
      <View style={styles.taskSectionHeader}>
        <View style={styles.taskSectionIcon}>
          <Icon name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.taskSectionCopy}>
          <Text style={styles.taskSectionTitle}>{title}</Text>
          <Text style={styles.taskSectionSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.taskCountBadge}>
          <Text style={styles.taskCountText}>{tasks.length}</Text>
        </View>
      </View>
      <View style={styles.taskList}>
        {tasks.map((task) => (
          <View key={`${title}-${task.todo_id}-${task.title}`} style={styles.taskRow}>
            <Icon name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.taskTitle}>{task.title}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MiniPortfolioScreen() {
  const route = useRoute<MiniPortfolioRoute>();
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const { portfolioId } = route.params;
  const [portfolio, setPortfolio] = useState<MiniPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const fetchPortfolio = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/past-activities/${portfolioId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '미니포트폴리오를 불러오지 못했습니다');
      setPortfolio(data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '미니포트폴리오를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [portfolioId, user?.id]);

  useFocusEffect(useCallback(() => { fetchPortfolio(); }, [fetchPortfolio]));

  const taskSections = useMemo(() => {
    if (!portfolio) return [];
    return [
      { key: 'monthly', title: '월간 목표', subtitle: '큰 목표를 완성한 기록', icon: 'calendar-outline', tasks: portfolio.completed_tasks.monthly || [] },
      { key: 'weekly', title: '주간 목표', subtitle: '주차별로 쌓아온 성과', icon: 'today-outline', tasks: portfolio.completed_tasks.weekly || [] },
      { key: 'daily', title: '일일 목표', subtitle: '매일 실행한 구체적인 작업', icon: 'sunny-outline', tasks: portfolio.completed_tasks.daily || [] },
      { key: 'overall', title: '기타 완료 작업', subtitle: '활동 전체에서 담당한 결과', icon: 'layers-outline', tasks: portfolio.completed_tasks.overall || [] },
    ].filter((section) => section.tasks.length);
  }, [portfolio]);

  const downloadPdf = async () => {
    if (!user?.id || downloading) return;
    const url = `${API_BASE_URL}/users/${user.id}/past-activities/${portfolioId}/pdf`;
    setDownloading(true);
    try {
      const fileName = `kkiri-mini-portfolio-${portfolioId}.pdf`;
      if (Platform.OS === 'android') {
        const downloadPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
        await ReactNativeBlobUtil.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            path: downloadPath,
            title: `${portfolio?.activity_name || '활동'} 미니포트폴리오`,
            description: '미니포트폴리오 PDF를 다운로드합니다.',
            mime: 'application/pdf',
            mediaScannable: true,
          },
        }).fetch('GET', url, user.authToken ? { Authorization: `Bearer ${user.authToken}` } : {});
        Alert.alert('다운로드 완료', `다운로드 폴더에 ${fileName} 파일을 저장했습니다.`);
      } else {
        const response = await ReactNativeBlobUtil.config({
          fileCache: true,
          appendExt: 'pdf',
        }).fetch('GET', url, user.authToken ? { Authorization: `Bearer ${user.authToken}` } : {});
        await ReactNativeBlobUtil.ios.openDocument(response.path());
      }
    } catch (downloadError) {
      Alert.alert('PDF 다운로드 오류', downloadError instanceof Error ? downloadError.message : 'PDF를 열지 못했습니다');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>미니포트폴리오를 구성하고 있어요</Text>
      </View>
    );
  }

  if (!portfolio || error) {
    return (
      <View style={styles.centered}>
        <Icon name="document-text-outline" size={42} color={colors.primary} />
        <Text style={styles.errorTitle}>{error || '미니포트폴리오가 없습니다'}</Text>
        <Pressable onPress={fetchPortfolio} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.coverCard}>
          {portfolio.image_urls?.[0] ? <Image source={{ uri: getImageUrl(portfolio.image_urls[0]) }} style={styles.coverImage} /> : null}
          {portfolio.image_urls?.[0] ? <View style={styles.coverImageOverlay} /> : null}
          <View style={styles.coverCircleLarge} />
          <View style={styles.coverCircleSmall} />
          <Text style={styles.coverEyebrow}>KKIRI KKIRI · MINI PORTFOLIO</Text>
          <Text style={styles.coverTitle}>{portfolio.activity_name}</Text>
          <View style={styles.coverMetaRow}>
            <View style={styles.coverBadge}>
              <Text style={styles.coverBadgeText}>{portfolio.activity_type || '팀 활동'}</Text>
            </View>
            <Text style={styles.coverRole}>{portfolio.role || '역할 미정'}</Text>
          </View>
        </View>

        {portfolio.achievements?.length ? (
          <View style={styles.storyCard}>
            <Text style={styles.storyEyebrow}>KEY OUTCOMES</Text>
            <Text style={styles.storyTitle}>핵심 성과</Text>
            {portfolio.achievements.map((achievement, index) => (
              <View key={`${achievement}-${index}`} style={styles.achievementRow}>
                <Icon name="sparkles" size={17} color={colors.primary} />
                <Text style={styles.storyText}>{achievement}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {portfolio.reflection ? (
          <View style={styles.storyCard}>
            <Text style={styles.storyEyebrow}>REFLECTION</Text>
            <Text style={styles.storyTitle}>활동 회고</Text>
            <Text style={styles.reflectionText}>{portfolio.reflection}</Text>
          </View>
        ) : null}

        {portfolio.links?.length ? (
          <View style={styles.storyCard}>
            <Text style={styles.storyEyebrow}>LINKS</Text>
            <Text style={styles.storyTitle}>관련 링크</Text>
            {portfolio.links.map((link, index) => (
              <Pressable
                key={`${link.url}-${index}`}
                accessibilityRole="link"
                onPress={() => Linking.openURL(link.url).catch(() => Alert.alert('링크 오류', '링크를 열 수 없습니다.'))}
                style={styles.linkRow}
              >
                <Icon name="link-outline" size={17} color={colors.primary} />
                <View style={styles.linkCopy}>
                  <Text style={styles.linkTitle}>{link.title || '관련 링크'}</Text>
                  <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>활동 기간</Text>
            <Text style={styles.metricValue} numberOfLines={2}>{portfolio.period || '-'}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>완료 작업</Text>
            <Text style={styles.metricValue}>{portfolio.completed_task_count || 0}개</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>함께한 인원</Text>
            <Text style={styles.metricValue}>{portfolio.member_count || 1}명</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryEyebrow}>ACTIVITY SUMMARY</Text>
          <Text style={styles.summaryTitle}>나의 활동 요약</Text>
          <Text style={styles.summaryText}>
            {portfolio.summary || `${portfolio.activity_name}에서 맡은 역할과 완료 작업을 정리했습니다.`}
          </Text>
          <View style={styles.ownerRow}>
            <View style={styles.ownerAvatar}>
              <Text style={styles.ownerInitial}>{portfolio.user_name?.slice(0, 1) || 'K'}</Text>
            </View>
            <View>
              <Text style={styles.ownerName}>{portfolio.user_name}</Text>
              <Text style={styles.ownerDepartment}>{portfolio.department || portfolio.role || '끼리끼리 사용자'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>COMPLETED WORK</Text>
            <Text style={styles.sectionHeading}>담당해서 완료한 작업</Text>
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>총 {portfolio.completed_task_count || 0}개</Text>
          </View>
        </View>

        {taskSections.length ? taskSections.map((section) => (
          <TaskSection
            key={section.key}
            title={section.title}
            subtitle={section.subtitle}
            icon={section.icon}
            tasks={section.tasks}
          />
        )) : (
          <View style={styles.noTasksCard}>
            <Text style={styles.noTasksText}>기록된 완료 작업이 없습니다.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('MiniPortfolioEditScreen', { portfolioId })}
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
        >
          <Icon name="create-outline" size={20} color={colors.primary} />
          <Text style={styles.editButtonText}>편집</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={downloading}
          onPress={downloadPdf}
          style={({ pressed }) => [styles.pdfButton, pressed && styles.pdfButtonPressed]}
        >
          <Icon name="download-outline" size={21} color="#FFFFFF" />
          <Text style={styles.pdfButtonText}>{downloading ? 'PDF 준비 중' : 'PDF로 다운로드'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 20, paddingBottom: 118 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F8F9FC' },
  loadingText: { marginTop: 13, color: colors.textSub, fontSize: 14 },
  errorTitle: { marginTop: 16, color: colors.textMain, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  retryButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 13, backgroundColor: colors.primary },
  retryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  coverCard: {
    minHeight: 250,
    overflow: 'hidden',
    padding: 24,
    justifyContent: 'flex-end',
    borderRadius: 26,
    backgroundColor: colors.primaryDark,
  },
  coverImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  coverImageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(40,24,82,0.70)' },
  coverCircleLarge: { position: 'absolute', top: -66, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.10)' },
  coverCircleSmall: { position: 'absolute', bottom: -65, left: -45, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.08)' },
  coverEyebrow: { color: '#D9D1FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  coverTitle: { marginTop: 13, color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 37 },
  coverMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  coverBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.primary },
  coverBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  coverRole: { marginLeft: 12, color: '#E7E0FF', fontSize: 13, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  metricCard: { flex: 1, minHeight: 92, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: '#FFFFFF' },
  metricLabel: { color: colors.textSub, fontSize: 10, fontWeight: '700' },
  metricValue: { marginTop: 8, color: colors.textMain, fontSize: 14, fontWeight: '900', lineHeight: 20 },
  summaryCard: { marginTop: 18, padding: 20, borderWidth: 1, borderColor: '#DDD4FF', borderRadius: 22, backgroundColor: colors.primarySurface },
  summaryEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  summaryTitle: { marginTop: 7, color: colors.textMain, fontSize: 20, fontWeight: '900' },
  summaryText: { marginTop: 12, color: colors.textSub, fontSize: 13, lineHeight: 21 },
  storyCard: { marginTop: 14, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: '#FFFFFF' },
  storyEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  storyTitle: { marginTop: 7, marginBottom: 11, color: colors.textMain, fontSize: 18, fontWeight: '900' },
  storyText: { flex: 1, color: colors.textSub, fontSize: 13, lineHeight: 20 },
  achievementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 7 },
  reflectionText: { color: colors.textSub, fontSize: 13, lineHeight: 22 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  linkCopy: { flex: 1 },
  linkTitle: { color: colors.textMain, fontSize: 12, fontWeight: '800' },
  linkUrl: { marginTop: 3, color: colors.primary, fontSize: 11 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D4CAFF' },
  ownerAvatar: { width: 38, height: 38, marginRight: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FFFFFF' },
  ownerInitial: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  ownerName: { color: colors.textMain, fontSize: 13, fontWeight: '800' },
  ownerDepartment: { marginTop: 2, color: colors.textSub, fontSize: 11 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 30, marginBottom: 13 },
  sectionEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  sectionHeading: { marginTop: 5, color: colors.textMain, fontSize: 20, fontWeight: '900' },
  totalBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primarySurface },
  totalBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  taskSection: { marginBottom: 13, padding: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: '#FFFFFF' },
  taskSectionHeader: { flexDirection: 'row', alignItems: 'center' },
  taskSectionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primarySurface },
  taskSectionCopy: { flex: 1, marginLeft: 11 },
  taskSectionTitle: { color: colors.textMain, fontSize: 15, fontWeight: '900' },
  taskSectionSubtitle: { marginTop: 2, color: colors.textSub, fontSize: 11 },
  taskCountBadge: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F2F4F7' },
  taskCountText: { color: colors.textMain, fontSize: 12, fontWeight: '900' },
  taskList: { gap: 9, marginTop: 15 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 14, backgroundColor: '#FAFAFC' },
  taskTitle: { flex: 1, marginLeft: 9, color: colors.textMain, fontSize: 13, lineHeight: 19 },
  noTasksCard: { padding: 24, alignItems: 'center', borderRadius: 18, backgroundColor: '#FFFFFF' },
  noTasksText: { color: colors.textSub, fontSize: 13 },
  footer: { position: 'absolute', right: 0, bottom: 0, left: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: '#FFFFFF' },
  editButton: { width: 102, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: 16, backgroundColor: '#FFFFFF' },
  editButtonPressed: { backgroundColor: colors.primarySurface },
  editButtonText: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  pdfButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.primary },
  pdfButtonPressed: { backgroundColor: colors.primaryDark },
  pdfButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
