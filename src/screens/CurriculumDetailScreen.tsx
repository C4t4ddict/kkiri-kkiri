import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import MiniCalendarModal from '../components/MiniCalendarModal';
import ScreenState from '../components/ScreenState';
import colors from '../config/colors';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

type CurriculumNode = {
  node_id: number;
  stable_key: string;
  parent_node_id?: number | null;
  level: 'MONTHLY' | 'WEEKLY' | 'DAILY';
  title: string;
  description?: string;
  relative_start_day: number;
  relative_end_day: number;
  estimated_minutes: number;
  is_required: boolean;
  assignment_mode: 'ALL_MEMBERS' | 'ASSIGNED_MEMBERS' | 'TEAM_ONCE';
};

type CurriculumDetail = {
  curriculum_id: number;
  title: string;
  role_title?: string;
  summary: string;
  description?: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  duration_weeks: number;
  weekly_hours: number;
  organization_name: string;
  brand_color?: string;
  is_verified?: boolean;
  version_number: number;
  nodes: CurriculumNode[];
};

type PlanPreview = {
  start_date: string;
  end_date: string;
  total_hours: number;
  level_counts: Record<'월간' | '주간' | '일일', number>;
  goals: Array<{ title: string; scope_type: string; scope_start_date: string; scope_end_date: string }>;
};

const weekdayOptions = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 7, label: '일' },
];

const difficultyLabel = { BEGINNER: '입문', INTERMEDIATE: '중급', ADVANCED: '심화' };
const levelLabel = { MONTHLY: '월간 마일스톤', WEEKLY: '주간 목표', DAILY: '일일 실행' };
const levelIcon = { MONTHLY: 'flag', WEEKLY: 'calendar', DAILY: 'checkmark-circle' };

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function CurriculumDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const curriculumId = Number(route.params?.id);
  const [curriculum, setCurriculum] = useState<CurriculumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [setupVisible, setSetupVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [mode, setMode] = useState<'PERSONAL' | 'TEAM'>('PERSONAL');
  const [startDate, setStartDate] = useState(today());
  const [weekdays, setWeekdays] = useState([1, 3, 5]);
  const [teamName, setTeamName] = useState('');
  const [requiredMembers, setRequiredMembers] = useState(4);
  const [openRecruitment, setOpenRecruitment] = useState(true);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const authHeaders = useMemo(() => user?.id ? { 'x-user-id': String(user.id) } : undefined, [user?.id]);

  const load = useCallback(async () => {
    try {
      const response = await axios.get<CurriculumDetail>(`${API_BASE_URL}/api/curricula/${curriculumId}`, { headers: authHeaders });
      setCurriculum(response.data);
      setTeamName(`${response.data.title} 스터디`);
      setError(false);
    } catch (loadError) {
      console.warn('커리큘럼 상세 조회 실패:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, curriculumId]);

  useEffect(() => { load(); }, [load]);

  const groupedNodes = useMemo(() => {
    const groups: Record<string, CurriculumNode[]> = { MONTHLY: [], WEEKLY: [], DAILY: [] };
    curriculum?.nodes.forEach((node) => groups[node.level]?.push(node));
    return groups;
  }, [curriculum?.nodes]);

  const toggleWeekday = (value: number) => {
    setPreview(null);
    setWeekdays((current) => current.includes(value)
      ? current.length > 1 ? current.filter((day) => day !== value) : current
      : [...current, value].sort((first, second) => first - second));
  };

  const requestPreview = async () => {
    setPreviewing(true);
    try {
      const response = await axios.post<{ plan: PlanPreview }>(
        `${API_BASE_URL}/api/curricula/${curriculumId}/preview`,
        { start_date: startDate, available_weekdays: weekdays },
        { headers: authHeaders },
      );
      setPreview(response.data.plan);
    } catch (previewError: any) {
      Alert.alert('일정 미리보기 실패', previewError?.response?.data?.message || '일정을 만들지 못했습니다.');
    } finally {
      setPreviewing(false);
    }
  };

  const enroll = async () => {
    if (!preview) {
      await requestPreview();
      return;
    }
    setEnrolling(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/curricula/${curriculumId}/enroll`,
        {
          participation_mode: mode,
          start_date: startDate,
          available_weekdays: weekdays,
          team_name: mode === 'TEAM' ? teamName.trim() : undefined,
          required_members: requiredMembers,
          open_recruitment: mode === 'TEAM' ? openRecruitment : false,
        },
        { headers: authHeaders },
      );
      setSetupVisible(false);
      Alert.alert(
        '활동에 추가했어요',
        mode === 'PERSONAL'
          ? '개인 학습 일정이 활동 탭에 생성되었습니다.'
          : openRecruitment
            ? '팀 일정과 모집글이 함께 생성되었습니다.'
            : '비공개 팀 일정이 활동 탭에 생성되었습니다.',
        [{ text: '활동 탭으로 이동', onPress: () => navigation.navigate('MainTabs', { screen: '활동' }) }],
      );
    } catch (enrollError: any) {
      Alert.alert('활동 추가 실패', enrollError?.response?.data?.message || '커리큘럼을 추가하지 못했습니다.');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.safeArea}><ScreenState kind="loading" /></SafeAreaView>;
  if (error || !curriculum) return <SafeAreaView style={styles.safeArea}><ScreenState kind="error" onRetry={load} /></SafeAreaView>;

  const brandColor = /^#[0-9A-F]{6}$/i.test(curriculum.brand_color || '') ? curriculum.brand_color! : colors.primary;
  const totalHours = Math.round(curriculum.duration_weeks * curriculum.weekly_hours);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: brandColor }]}>
          <View style={styles.companyRow}>
            <View style={styles.companyLogo}><Text style={[styles.companyLogoText, { color: brandColor }]}>{curriculum.organization_name.slice(0, 1)}</Text></View>
            <View style={styles.companyCopy}>
              <View style={styles.verifiedRow}>
                <Text style={styles.companyName}>{curriculum.organization_name}</Text>
                {curriculum.is_verified ? <Icon name="checkmark-circle" size={16} color="#FFFFFF" /> : null}
              </View>
              <Text style={styles.versionText}>기업 제공 · v{curriculum.version_number}</Text>
            </View>
          </View>
          <Text style={styles.heroEyebrow}>{curriculum.role_title || 'TECH CAREER ROADMAP'}</Text>
          <Text style={styles.heroTitle}>{curriculum.title}</Text>
          <Text style={styles.heroSummary}>{curriculum.summary}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}><Icon name="calendar-clear-outline" size={16} color="#FFFFFF" /><Text style={styles.heroMetaText}>{curriculum.duration_weeks}주</Text></View>
            <View style={styles.heroMetaItem}><Icon name="time-outline" size={16} color="#FFFFFF" /><Text style={styles.heroMetaText}>주 {curriculum.weekly_hours}시간</Text></View>
            <View style={styles.heroMetaItem}><Icon name="speedometer-outline" size={16} color="#FFFFFF" /><Text style={styles.heroMetaText}>{difficultyLabel[curriculum.difficulty]}</Text></View>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{curriculum.nodes.length}</Text><Text style={styles.metricLabel}>전체 목표</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{totalHours}</Text><Text style={styles.metricLabel}>예상 학습시간</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{groupedNodes.DAILY.length}</Text><Text style={styles.metricLabel}>실행 과제</Text></View>
        </View>

        <View style={styles.readingCard}>
          <Text style={styles.sectionEyebrow}>ABOUT THIS CURRICULUM</Text>
          <Text style={styles.sectionTitle}>이 과정을 마치면</Text>
          <Text style={styles.description}>{curriculum.description || curriculum.summary}</Text>
        </View>

        <View style={styles.sectionHead}>
          <View><Text style={styles.sectionEyebrow}>LEARNING MAP</Text><Text style={styles.sectionTitle}>학습 과정</Text></View>
          <Text style={styles.sectionCount}>{curriculum.nodes.length}개 목표</Text>
        </View>

        {(['MONTHLY', 'WEEKLY', 'DAILY'] as const).map((level) => (
          groupedNodes[level].length ? (
            <View style={styles.timelineSection} key={level}>
              <View style={styles.timelineHeading}>
                <View style={[styles.timelineIcon, { backgroundColor: `${brandColor}18` }]}><Icon name={levelIcon[level]} size={17} color={brandColor} /></View>
                <Text style={styles.timelineTitle}>{levelLabel[level]}</Text>
                <Text style={styles.timelineCount}>{groupedNodes[level].length}</Text>
              </View>
              {groupedNodes[level].slice(0, level === 'DAILY' ? 8 : 20).map((node, index) => (
                <View style={styles.nodeRow} key={node.node_id}>
                  <View style={styles.nodeIndex}><Text style={styles.nodeIndexText}>{String(index + 1).padStart(2, '0')}</Text></View>
                  <View style={styles.nodeCopy}>
                    <View style={styles.nodeTitleRow}>
                      <Text style={styles.nodeTitle}>{node.title}</Text>
                      {!node.is_required ? <Text style={styles.optionalBadge}>선택</Text> : null}
                    </View>
                    {node.description ? <Text style={styles.nodeDescription} numberOfLines={2}>{node.description}</Text> : null}
                    <Text style={styles.nodeMeta}>시작 +{node.relative_start_day}일 · {node.estimated_minutes || 0}분</Text>
                  </View>
                </View>
              ))}
              {level === 'DAILY' && groupedNodes[level].length > 8 ? (
                <Text style={styles.moreText}>외 {groupedNodes[level].length - 8}개 실행 목표</Text>
              ) : null}
            </View>
          ) : null
        ))}

        <View style={styles.safetyCard}>
          <Icon name="shield-checkmark-outline" size={22} color="#027A48" />
          <View style={styles.safetyCopy}><Text style={styles.safetyTitle}>내 일정과 기록은 내가 관리해요</Text><Text style={styles.safetyText}>기업은 개인 일정이나 달성 기록을 볼 수 없으며, 채용 제출은 별도 동의가 있을 때만 가능합니다.</Text></View>
        </View>

        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }]} onPress={() => setSetupVisible(true)}>
          <Text style={styles.primaryButtonText}>내 활동에 추가</Text><Icon name="arrow-forward" size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={setupVisible} transparent animationType="slide" onRequestClose={() => setSetupVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => setSetupVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View><Text style={styles.sheetEyebrow}>ADD TO ACTIVITY</Text><Text style={styles.sheetTitle}>학습 방식과 일정을 정해주세요</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setSetupVisible(false)}><Icon name="close" size={20} color={colors.textSub} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              <Text style={styles.fieldLabel}>참여 방식</Text>
              <View style={styles.modeGrid}>
                {([
                  ['PERSONAL', '개인으로 시작', '내 일정에 맞춰 혼자 완주해요', 'person-outline'],
                  ['TEAM', '팀으로 시작', '팀원과 목표를 나누고 함께 완주해요', 'people-outline'],
                ] as const).map(([value, title, description, icon]) => {
                  const active = mode === value;
                  return (
                    <TouchableOpacity key={value} style={[styles.modeCard, active && styles.modeCardActive]} onPress={() => { setMode(value); setPreview(null); }}>
                      <View style={[styles.modeIcon, active && styles.modeIconActive]}><Icon name={icon} size={20} color={active ? '#FFFFFF' : colors.primary} /></View>
                      <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{title}</Text>
                      <Text style={styles.modeDescription}>{description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>시작일</Text>
              <TouchableOpacity style={styles.inputButton} onPress={() => setCalendarVisible(true)}>
                <Icon name="calendar-clear-outline" size={18} color={colors.primary} />
                <Text style={styles.inputButtonText}>{startDate}</Text>
                <Icon name="chevron-forward" size={17} color="#98A2B3" />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>학습 가능한 요일</Text>
              <View style={styles.weekdayRow}>
                {weekdayOptions.map((weekday) => {
                  const selected = weekdays.includes(weekday.value);
                  return (
                    <TouchableOpacity key={weekday.value} style={[styles.weekdayChip, selected && styles.weekdayChipActive]} onPress={() => toggleWeekday(weekday.value)}>
                      <Text style={[styles.weekdayText, selected && styles.weekdayTextActive]}>{weekday.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {mode === 'TEAM' ? (
                <View style={styles.teamFields}>
                  <Text style={styles.fieldLabel}>팀 이름</Text>
                  <TextInput style={styles.textField} value={teamName} onChangeText={setTeamName} maxLength={80} placeholder="팀 이름" placeholderTextColor="#98A2B3" />
                  <Text style={styles.fieldLabel}>목표 인원</Text>
                  <View style={styles.memberRow}>
                    {[2, 3, 4, 5, 6].map((count) => (
                      <TouchableOpacity key={count} style={[styles.memberChip, requiredMembers === count && styles.memberChipActive]} onPress={() => setRequiredMembers(count)}>
                        <Text style={[styles.memberText, requiredMembers === count && styles.memberTextActive]}>{count}명</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.switchRow}>
                    <View style={styles.switchCopy}><Text style={styles.switchTitle}>매칭 탭에서 팀원 모집</Text><Text style={styles.switchDescription}>활동 생성과 동시에 모집글을 공개합니다.</Text></View>
                    <Switch value={openRecruitment} onValueChange={setOpenRecruitment} trackColor={{ false: '#D0D5DD', true: colors.primaryLight }} thumbColor={openRecruitment ? colors.primary : '#FFFFFF'} />
                  </View>
                </View>
              ) : null}

              {preview ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewHead}><Icon name="calendar-number" size={20} color={colors.primary} /><Text style={styles.previewTitle}>내 일정 미리보기</Text></View>
                  <Text style={styles.previewPeriod}>{preview.start_date} ~ {preview.end_date}</Text>
                  <View style={styles.previewMetrics}>
                    <View><Text style={styles.previewValue}>{preview.total_hours}h</Text><Text style={styles.previewLabel}>전체 학습</Text></View>
                    <View><Text style={styles.previewValue}>{preview.level_counts['주간']}</Text><Text style={styles.previewLabel}>주간 목표</Text></View>
                    <View><Text style={styles.previewValue}>{preview.level_counts['일일']}</Text><Text style={styles.previewLabel}>일일 실행</Text></View>
                  </View>
                  {preview.goals.slice(0, 3).map((goal) => (
                    <View style={styles.previewGoal} key={`${goal.scope_type}-${goal.title}`}><View style={styles.previewDot} /><Text style={styles.previewGoalText} numberOfLines={1}>{goal.title}</Text><Text style={styles.previewGoalDate}>{goal.scope_start_date.slice(5)}</Text></View>
                  ))}
                </View>
              ) : null}

              <TouchableOpacity disabled={previewing || enrolling} style={[styles.sheetButton, (previewing || enrolling) && styles.buttonDisabled]} onPress={enroll}>
                <Text style={styles.sheetButtonText}>{enrolling ? '활동 생성 중...' : preview ? '이 일정으로 활동에 추가' : previewing ? '일정 만드는 중...' : '일정 미리보기'}</Text>
                {!enrolling && !previewing ? <Icon name={preview ? 'checkmark' : 'arrow-forward'} size={18} color="#FFFFFF" /> : null}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <MiniCalendarModal
        visible={calendarVisible}
        title="학습 시작일"
        value={startDate}
        minDate={today()}
        onClose={() => setCalendarVisible(false)}
        onSelect={(date) => { setStartDate(date); setPreview(null); setCalendarVisible(false); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FB' },
  content: { padding: 16, paddingBottom: 38 },
  hero: { padding: 23, borderRadius: 26 },
  companyRow: { flexDirection: 'row', alignItems: 'center' },
  companyLogo: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  companyLogoText: { fontSize: 18, fontWeight: '900' },
  companyCopy: { marginLeft: 11 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  companyName: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  versionText: { marginTop: 3, color: 'rgba(255,255,255,0.72)', fontSize: 10 },
  heroEyebrow: { marginTop: 28, color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { marginTop: 8, color: '#FFFFFF', fontSize: 27, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8 },
  heroSummary: { marginTop: 11, color: 'rgba(255,255,255,0.84)', fontSize: 13, lineHeight: 20 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginTop: 22 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', gap: 9, marginTop: 12 },
  metricCard: { flex: 1, paddingVertical: 16, borderWidth: 1, borderColor: '#E7E7EF', borderRadius: 17, alignItems: 'center', backgroundColor: '#FFFFFF' },
  metricValue: { color: colors.textMain, fontSize: 19, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: colors.textSub, fontSize: 9, fontWeight: '700' },
  readingCard: { marginTop: 12, padding: 20, borderWidth: 1, borderColor: '#E7E7EF', borderRadius: 20, backgroundColor: '#FFFFFF' },
  sectionEyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { marginTop: 5, color: colors.textMain, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  description: { marginTop: 13, color: '#475467', fontSize: 13, lineHeight: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 },
  sectionCount: { color: colors.textSub, fontSize: 11, fontWeight: '700' },
  timelineSection: { marginBottom: 11, padding: 18, borderWidth: 1, borderColor: '#E7E7EF', borderRadius: 20, backgroundColor: '#FFFFFF' },
  timelineHeading: { flexDirection: 'row', alignItems: 'center' },
  timelineIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  timelineTitle: { flex: 1, marginLeft: 10, color: colors.textMain, fontSize: 14, fontWeight: '900' },
  timelineCount: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  nodeRow: { flexDirection: 'row', gap: 11, marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0F1F4' },
  nodeIndex: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F4F7' },
  nodeIndexText: { color: colors.textSub, fontSize: 9, fontWeight: '900' },
  nodeCopy: { flex: 1 },
  nodeTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  nodeTitle: { flex: 1, color: colors.textMain, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  optionalBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, color: '#475467', backgroundColor: '#F2F4F7', fontSize: 8, fontWeight: '800' },
  nodeDescription: { marginTop: 4, color: colors.textSub, fontSize: 10, lineHeight: 16 },
  nodeMeta: { marginTop: 6, color: '#98A2B3', fontSize: 9, fontWeight: '700' },
  moreText: { marginTop: 15, color: colors.primary, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  safetyCard: { flexDirection: 'row', gap: 11, marginTop: 14, padding: 16, borderRadius: 17, backgroundColor: '#ECFDF3' },
  safetyCopy: { flex: 1 },
  safetyTitle: { color: '#027A48', fontSize: 12, fontWeight: '900' },
  safetyText: { marginTop: 4, color: '#05603A', fontSize: 10, lineHeight: 16 },
  primaryButton: { minHeight: 54, marginTop: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.48)' },
  modalDismiss: { flex: 1 },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF' },
  sheetHandle: { width: 42, height: 5, alignSelf: 'center', marginTop: 10, borderRadius: 999, backgroundColor: '#D0D5DD' },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  sheetEyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  sheetTitle: { marginTop: 5, color: colors.textMain, fontSize: 20, fontWeight: '900' },
  closeButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F4F7' },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 34 },
  fieldLabel: { marginTop: 18, marginBottom: 9, color: '#344054', fontSize: 11, fontWeight: '900' },
  modeGrid: { flexDirection: 'row', gap: 9 },
  modeCard: { flex: 1, minHeight: 128, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: '#FFFFFF' },
  modeCardActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  modeIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySurface },
  modeIconActive: { backgroundColor: colors.primary },
  modeTitle: { marginTop: 11, color: colors.textMain, fontSize: 12, fontWeight: '900' },
  modeTitleActive: { color: colors.primaryDark },
  modeDescription: { marginTop: 4, color: colors.textSub, fontSize: 9, lineHeight: 14 },
  inputButton: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF' },
  inputButtonText: { flex: 1, color: colors.textMain, fontSize: 13, fontWeight: '800' },
  weekdayRow: { flexDirection: 'row', gap: 6 },
  weekdayChip: { flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  weekdayChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  weekdayText: { color: colors.textSub, fontSize: 11, fontWeight: '800' },
  weekdayTextActive: { color: '#FFFFFF' },
  teamFields: { marginTop: 1 },
  textField: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 13, color: colors.textMain, backgroundColor: '#FFFFFF' },
  memberRow: { flexDirection: 'row', gap: 7 },
  memberChip: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 11, alignItems: 'center' },
  memberChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  memberText: { color: colors.textSub, fontSize: 10, fontWeight: '800' },
  memberTextActive: { color: colors.primaryDark },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: '#F8F9FC' },
  switchCopy: { flex: 1, paddingRight: 10 },
  switchTitle: { color: colors.textMain, fontSize: 11, fontWeight: '900' },
  switchDescription: { marginTop: 3, color: colors.textSub, fontSize: 9 },
  previewCard: { marginTop: 20, padding: 16, borderRadius: 17, backgroundColor: colors.primarySurface },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: '900' },
  previewPeriod: { marginTop: 7, color: colors.textSub, fontSize: 10 },
  previewMetrics: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#DED7FA' },
  previewValue: { color: colors.primaryDark, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  previewLabel: { marginTop: 2, color: colors.textSub, fontSize: 8, textAlign: 'center' },
  previewGoal: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  previewDot: { width: 6, height: 6, marginRight: 7, borderRadius: 3, backgroundColor: colors.primary },
  previewGoalText: { flex: 1, color: colors.textMain, fontSize: 10, fontWeight: '700' },
  previewGoalDate: { marginLeft: 8, color: colors.textSub, fontSize: 9 },
  sheetButton: { minHeight: 52, marginTop: 20, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.primary },
  sheetButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.6 },
});
