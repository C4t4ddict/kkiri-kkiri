import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import Icon from 'react-native-vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MATCHING_ACTIVITY_CATEGORIES } from '../constants/activityCategories';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';
import MiniCalendarModal from '../components/MiniCalendarModal';
import { RootStackParamList } from '../types';

const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const CATEGORIES = [...MATCHING_ACTIVITY_CATEGORIES];
const DEPARTMENTS = ['전학과', '컴퓨터공학과', '디자인학부', '경영학과', '기타'];

type Activity = {
  activity_id: number;
  title: string;
  category?: string | null;
  topic_category?: string | null;
  organizer?: string | null;
  application_period_end?: string | null;
};

type ActivitySource = 'open' | 'favorite';
type CalendarTarget = 'start' | 'end' | null;

const toDateString = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const formatDate = (value: string) => value.replace(/-/g, '. ');

export default function TeamMakeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TeamMake'>>();
  const { user } = useAuth();
  const recruitmentId = route.params?.recruitmentId;
  const isEditing = Number.isInteger(recruitmentId);
  const today = useMemo(() => toDateString(new Date()), []);
  const defaultEnd = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return toDateString(date);
  }, []);

  const [postTitle, setPostTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryCollapsed, setCategoryCollapsed] = useState(false);
  const [department, setDepartment] = useState('모집학과');
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [members, setMembers] = useState('4');
  const [meetingType, setMeetingType] = useState<'대면' | '비대면' | '혼합'>('대면');
  const [conditions, setConditions] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [activityPickerVisible, setActivityPickerVisible] = useState(false);
  const [activitySource, setActivitySource] = useState<ActivitySource>('open');
  const [activitySearch, setActivitySearch] = useState('');
  const [openActivities, setOpenActivities] = useState<Activity[]>([]);
  const [favoriteActivities, setFavoriteActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initializing, setInitializing] = useState(isEditing);
  const categoryProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? '모집글 수정' : '팀 만들기' });
  }, [isEditing, navigation]);

  useEffect(() => {
    if (!isEditing || !recruitmentId || !user?.id) return;

    const fetchRecruitment = async () => {
      setInitializing(true);
      try {
        const response = await axios.get(`${BASE_URL}/api/team-recruitments/${recruitmentId}`, {
          headers: { 'x-user-id': String(user.id) },
        });
        const recruitment = response.data;
        if (Number(recruitment.owner_user_id) !== Number(user.id)) {
          Alert.alert('수정 불가', '작성자만 모집글을 수정할 수 있습니다.', [
            { text: '확인', onPress: () => navigation.goBack() },
          ]);
          return;
        }

        setPostTitle(recruitment.post_name || '');
        setSelectedCategory(recruitment.activity_type || null);
        setCategoryCollapsed(Boolean(recruitment.activity_type));
        categoryProgress.setValue(recruitment.activity_type ? 1 : 0);
        setDepartment(recruitment.qualification_department || '모집학과');
        setMembers(String(recruitment.required_members || 4));
        setMeetingType(recruitment.meeting_type || '대면');
        setConditions(recruitment.memo || '');
        setStartDate(recruitment.activity_start_date || today);
        setEndDate(recruitment.activity_end_date || defaultEnd);
        if (recruitment.activity_id) {
          setSelectedActivity({
            activity_id: Number(recruitment.activity_id),
            title: recruitment.activity_name,
            category: recruitment.activity_category,
            topic_category: recruitment.activity_topic_category,
            organizer: recruitment.activity_organizer,
            application_period_end: recruitment.activity_application_period_end,
          });
        }
      } catch (error: any) {
        Alert.alert('조회 실패', error?.response?.data?.message || '모집글을 불러오지 못했습니다.', [
          { text: '확인', onPress: () => navigation.goBack() },
        ]);
      } finally {
        setInitializing(false);
      }
    };

    fetchRecruitment();
  }, [categoryProgress, defaultEnd, isEditing, navigation, recruitmentId, today, user?.id]);

  useEffect(() => {
    if (!activityPickerVisible) return;
    const fetchActivities = async () => {
      setLoadingActivities(true);
      try {
        const requests = [axios.get<Activity[]>(`${BASE_URL}/api/activities/open`)];
        if (user?.id) {
          requests.push(axios.get<Activity[]>(`${BASE_URL}/api/favorite-activities`, {
            headers: { 'x-user-id': String(user.id) },
          }));
        }
        const [openResponse, favoriteResponse] = await Promise.all(requests);
        const openList = Array.isArray(openResponse.data) ? openResponse.data : [];
        const openIds = new Set(openList.map((activity) => Number(activity.activity_id)));
        const favorites = favoriteResponse && Array.isArray(favoriteResponse.data)
          ? favoriteResponse.data.filter((activity) => openIds.has(Number(activity.activity_id)))
          : [];
        setOpenActivities(openList);
        setFavoriteActivities(favorites);
      } catch (error) {
        console.error('팀 활동 후보 조회 오류:', error);
        Alert.alert('오류', '모집 중인 활동을 불러오지 못했습니다.');
      } finally {
        setLoadingActivities(false);
      }
    };
    fetchActivities();
  }, [activityPickerVisible, user?.id]);

  const animateCategory = (toValue: number, onEnd?: () => void) => {
    Animated.timing(categoryProgress, {
      toValue,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onEnd?.();
    });
  };

  const chooseCategory = (category: string) => {
    if (selectedCategory === category) {
      setCategoryCollapsed(false);
      animateCategory(0, () => setSelectedCategory(null));
      return;
    }
    setSelectedCategory(category);
    setCategoryCollapsed(true);
    categoryProgress.setValue(0);
    animateCategory(1);
  };

  const displayedCategories = useMemo(() => {
    if (!selectedCategory) return CATEGORIES;
    if (categoryCollapsed) return [selectedCategory];
    return [selectedCategory, ...CATEGORIES.filter((category) => category !== selectedCategory)];
  }, [categoryCollapsed, selectedCategory]);

  const filteredActivities = useMemo(() => {
    const source = activitySource === 'favorite' ? favoriteActivities : openActivities;
    const keyword = activitySearch.trim().toLowerCase();
    if (!keyword) return source;
    return source.filter((activity) =>
      [activity.title, activity.organizer, activity.category, activity.topic_category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [activitySearch, activitySource, favoriteActivities, openActivities]);

  const selectActivity = (activity: Activity) => {
    setSelectedActivity(activity);
    setActivityPickerVisible(false);
    setActivitySearch('');
    const activityCategory = String(activity.category || '');
    const suggestedCategory = CATEGORIES.some((category) => category === activityCategory)
      ? activityCategory
      : '기타';
    if (!selectedCategory) chooseCategory(suggestedCategory);
  };

  const selectCalendarDate = (date: string) => {
    if (calendarTarget === 'start') {
      setStartDate(date);
      if (date > endDate) setEndDate(date);
    } else if (calendarTarget === 'end') {
      setEndDate(date);
    }
    setCalendarTarget(null);
  };

  const validate = () => {
    if (!user?.id) return Alert.alert('확인', '로그인이 필요합니다.');
    if (!postTitle.trim()) return Alert.alert('확인', '글 제목을 입력하세요.');
    if (!selectedActivity) return Alert.alert('확인', '모집 중인 활동을 선택하세요.');
    if (!selectedCategory) return Alert.alert('확인', '카테고리를 선택하세요.');
    if (!DEPARTMENTS.includes(department)) return Alert.alert('확인', '모집학과를 선택하세요.');
    const memberCount = Number(members);
    if (!Number.isInteger(memberCount) || memberCount < 2 || memberCount > 99) {
      return Alert.alert('확인', '모집 인원은 2명에서 99명 사이로 입력하세요.');
    }
    if (startDate > endDate) return Alert.alert('확인', '종료일은 시작일 이후여야 합니다.');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !user?.id || !selectedActivity || submitting) return;
    setSubmitting(true);
    try {
      await axios.request({
        method: isEditing ? 'put' : 'post',
        url: isEditing
          ? `${BASE_URL}/api/team-recruitments/${recruitmentId}`
          : `${BASE_URL}/api/team-recruitments`,
        data: {
          owner_user_id: user.id,
          activity_id: selectedActivity.activity_id,
          post_name: postTitle.trim(),
          activity_type: selectedCategory,
          qualification_department: department,
          required_members: Number(members),
          activity_start_date: startDate,
          activity_end_date: endDate,
          meeting_type: meetingType,
          memo: conditions.trim(),
        },
        headers: { 'x-user-id': String(user.id) },
      });
      Alert.alert('완료', isEditing ? '모집글이 수정되었습니다.' : '모집글이 등록되었습니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('모집글 저장 실패:', error?.response?.data || error);
      Alert.alert('저장 실패', error?.response?.data?.message || '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const categoryBoxStyle = {
    width: categoryProgress.interpolate({ inputRange: [0, 1], outputRange: ['100%', '58%'] }),
    maxHeight: categoryProgress.interpolate({ inputRange: [0, 1], outputRange: [340, 62] }),
    paddingVertical: categoryProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 3] }),
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {initializing ? <Text style={styles.initializingText}>모집글을 불러오는 중...</Text> : null}
        <InputBox>
          <TextInput
            value={postTitle}
            onChangeText={setPostTitle}
            placeholder="글 제목"
            placeholderTextColor={colors.inputPlaceholder}
            style={styles.input}
          />
        </InputBox>

        <Text style={styles.sectionLabel}>팀 활동</Text>
        {selectedActivity ? (
          <TouchableOpacity style={styles.selectedActivityCard} onPress={() => setActivityPickerVisible(true)}>
            <View style={styles.activityIcon}><Icon name="trophy-outline" size={22} color={colors.primary} /></View>
            <View style={styles.activityInfo}>
              <Text style={styles.selectedActivityTitle} numberOfLines={2}>{selectedActivity.title}</Text>
              <Text style={styles.activityMeta} numberOfLines={1}>
                {[selectedActivity.category, selectedActivity.topic_category].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={styles.changeText}>변경</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.activitySelectButton} onPress={() => setActivityPickerVisible(true)}>
            <Icon name="search" size={20} color={colors.primary} />
            <Text style={styles.activitySelectText}>모집 중인 활동 검색</Text>
            <Icon name="chevron-forward" size={18} color={colors.textSub} />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>카테고리</Text>
        <View style={styles.categoryStage}>
          <Animated.View style={[styles.filterBox, categoryBoxStyle]}>
            <View style={[styles.checkboxGrid, selectedCategory && styles.checkboxGridSelected]}>
              {displayedCategories.map((category) => {
                const selected = selectedCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.checkboxItem, selected && styles.checkboxItemSelected]}
                    onPress={() => chooseCategory(category)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.checkboxSquare, selected && styles.checkboxSquareSelected]}>
                      {selected && <Icon name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={[styles.checkboxLabel, selected && styles.checkboxLabelSelected]}>{category}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </View>
        {selectedCategory && categoryCollapsed && (
          <Text style={styles.categoryHelper}>선택 항목을 누르면 다시 펼쳐집니다.</Text>
        )}

        <Text style={styles.sectionLabel}>팀 조건</Text>
        <SelectField
          label={department}
          placeholder={department === '모집학과'}
          open={departmentOpen}
          items={DEPARTMENTS}
          onToggle={() => setDepartmentOpen((value) => !value)}
          onSelect={(value) => {
            setDepartment(value);
            setDepartmentOpen(false);
          }}
        />

        <View style={styles.conditionRow}>
          <DateField label="시작일" value={startDate} onPress={() => setCalendarTarget('start')} />
          <View style={styles.dateDivider}><Icon name="arrow-forward" size={17} color={colors.textSub} /></View>
          <DateField label="종료일" value={endDate} onPress={() => setCalendarTarget('end')} />
        </View>

        <View style={styles.memberField}>
          <View style={styles.memberIcon}><Icon name="people-outline" size={20} color={colors.primary} /></View>
          <Text style={styles.memberLabel}>모집 인원</Text>
          <TextInput
            value={members}
            onChangeText={(value) => setMembers(value.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.memberInput}
            selectTextOnFocus
          />
          <Text style={styles.memberUnit}>명</Text>
        </View>

        <View style={styles.meetingRow}>
          {(['대면', '비대면', '혼합'] as const).map((type) => {
            const active = meetingType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.meetingButton, active && styles.meetingButtonActive]}
                onPress={() => setMeetingType(type)}
              >
                <Text style={[styles.meetingText, active && styles.meetingTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <InputBox large>
          <TextInput
            value={conditions}
            onChangeText={setConditions}
            placeholder="간단한 자기소개와 찾고 있는 팀원의 조건을 입력하세요"
            placeholderTextColor={colors.inputPlaceholder}
            style={[styles.input, styles.memoInput]}
            multiline
          />
        </InputBox>

        <TouchableOpacity
          style={[styles.submitButton, (submitting || initializing) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || initializing}
        >
          <Text style={styles.submitText}>
            {submitting ? '저장 중...' : isEditing ? '수정 완료' : '모집글 등록'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <ActivityPickerModal
        visible={activityPickerVisible}
        source={activitySource}
        search={activitySearch}
        loading={loadingActivities}
        activities={filteredActivities}
        favoriteCount={favoriteActivities.length}
        onClose={() => setActivityPickerVisible(false)}
        onSourceChange={setActivitySource}
        onSearchChange={setActivitySearch}
        onSelect={selectActivity}
      />

      <MiniCalendarModal
        visible={calendarTarget !== null}
        title={calendarTarget === 'start' ? '활동 시작일' : '활동 종료일'}
        value={calendarTarget === 'start' ? startDate : endDate}
        minDate={calendarTarget === 'end' ? startDate : today}
        onClose={() => setCalendarTarget(null)}
        onSelect={selectCalendarDate}
      />
    </SafeAreaView>
  );
}

function InputBox({ children, large = false }: { children: React.ReactNode; large?: boolean }) {
  return <View style={[styles.inputBox, large && styles.largeInputBox]}>{children}</View>;
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dateField} onPress={onPress}>
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateValueRow}>
        <Icon name="calendar-outline" size={18} color={colors.primary} />
        <Text style={styles.dateValue}>{formatDate(value)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SelectField({
  label,
  placeholder,
  open,
  items,
  onToggle,
  onSelect,
}: {
  label: string;
  placeholder: boolean;
  open: boolean;
  items: string[];
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.selectWrapper}>
      <TouchableOpacity style={styles.selectButton} onPress={onToggle}>
        <Text style={[styles.selectText, placeholder && styles.placeholderText]}>{label}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMain} />
      </TouchableOpacity>
      {open && (
        <View style={styles.selectMenu}>
          {items.map((item) => (
            <TouchableOpacity key={item} style={styles.selectItem} onPress={() => onSelect(item)}>
              <Text style={styles.selectItemText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function ActivityPickerModal({
  visible,
  source,
  search,
  loading,
  activities,
  favoriteCount,
  onClose,
  onSourceChange,
  onSearchChange,
  onSelect,
}: {
  visible: boolean;
  source: ActivitySource;
  search: string;
  loading: boolean;
  activities: Activity[];
  favoriteCount: number;
  onClose: () => void;
  onSourceChange: (source: ActivitySource) => void;
  onSearchChange: (value: string) => void;
  onSelect: (activity: Activity) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.pickerTitle}>팀 활동 선택</Text>
              <Text style={styles.pickerDescription}>현재 접수 중인 활동만 선택할 수 있어요.</Text>
            </View>
            <TouchableOpacity style={styles.pickerClose} onPress={onClose}>
              <Icon name="close" size={21} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          <View style={styles.sourceTabs}>
            <SourceTab label="모집 중" active={source === 'open'} onPress={() => onSourceChange('open')} />
            <SourceTab
              label={`관심 활동${favoriteCount ? ` ${favoriteCount}` : ''}`}
              active={source === 'favorite'}
              onPress={() => onSourceChange('favorite')}
            />
          </View>

          <View style={styles.searchBox}>
            <Icon name="search" size={19} color={colors.textSub} />
            <TextInput
              value={search}
              onChangeText={onSearchChange}
              placeholder="활동명이나 주최기관 검색"
              placeholderTextColor={colors.inputPlaceholder}
              style={styles.searchInput}
            />
          </View>

          <ScrollView style={styles.activityList} keyboardShouldPersistTaps="handled">
            {loading ? (
              <Text style={styles.emptyText}>활동을 불러오는 중...</Text>
            ) : activities.length === 0 ? (
              <View style={styles.activityEmpty}>
                <Icon name={source === 'favorite' ? 'heart-outline' : 'search-outline'} size={28} color={colors.primary} />
                <Text style={styles.emptyTitle}>
                  {source === 'favorite' ? '접수 중인 관심 활동이 없어요' : '검색 결과가 없어요'}
                </Text>
                <Text style={styles.emptyText}>정보 탭에서 활동을 저장하거나 다른 검색어를 입력해보세요.</Text>
              </View>
            ) : (
              activities.map((activity) => (
                <TouchableOpacity
                  key={activity.activity_id}
                  style={styles.activityRow}
                  onPress={() => onSelect(activity)}
                >
                  <View style={styles.activityRowBody}>
                    <Text style={styles.activityRowTitle} numberOfLines={2}>{activity.title}</Text>
                    <Text style={styles.activityRowMeta} numberOfLines={1}>
                      {[activity.organizer, activity.category, activity.topic_category].filter(Boolean).join(' · ')}
                    </Text>
                    {activity.application_period_end ? (
                      <Text style={styles.activityDeadline}>접수 마감 {String(activity.application_period_end).slice(0, 10)}</Text>
                    ) : null}
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SourceTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.sourceTab, active && styles.sourceTabActive]} onPress={onPress}>
      <Text style={[styles.sourceTabText, active && styles.sourceTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 42 },
  sectionLabel: { marginBottom: 9, color: colors.textSub, fontSize: 13, fontWeight: '800' },
  inputBox: {
    minHeight: 50,
    marginBottom: 16,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: colors.inputBackground,
  },
  largeInputBox: { height: 142, paddingVertical: 12 },
  input: { flex: 1, color: colors.textMain, fontSize: 15 },
  memoInput: { height: '100%', textAlignVertical: 'top', lineHeight: 21 },
  activitySelectButton: {
    minHeight: 58,
    marginBottom: 18,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.primarySurface,
  },
  activitySelectText: { flex: 1, color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  selectedActivityCard: {
    minHeight: 76,
    marginBottom: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
  },
  activityIcon: {
    width: 44,
    height: 44,
    marginRight: 11,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  activityInfo: { flex: 1 },
  selectedActivityTitle: { color: colors.textMain, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  activityMeta: { marginTop: 4, color: colors.textSub, fontSize: 12 },
  changeText: { marginLeft: 10, color: colors.primary, fontSize: 12, fontWeight: '800' },
  categoryStage: { alignItems: 'center', marginBottom: 4 },
  filterBox: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.primarySurface,
  },
  checkboxGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  checkboxGridSelected: { justifyContent: 'center' },
  checkboxItem: {
    width: '50%',
    minHeight: 47,
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxItemSelected: { justifyContent: 'center' },
  checkboxSquare: {
    width: 18,
    height: 18,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: colors.textSub,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSquareSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxLabel: { color: colors.textMain, fontSize: 13, fontWeight: '700' },
  checkboxLabelSelected: { color: colors.primaryDark, fontWeight: '800' },
  categoryHelper: { marginBottom: 16, color: colors.textSub, fontSize: 11, textAlign: 'center' },
  selectWrapper: { marginBottom: 12, zIndex: 20 },
  selectButton: {
    minHeight: 50,
    paddingHorizontal: 15,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBackground,
  },
  selectText: { color: colors.textMain, fontSize: 14, fontWeight: '700' },
  placeholderText: { color: colors.inputPlaceholder },
  selectMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  selectItem: { paddingHorizontal: 15, paddingVertical: 12 },
  selectItemText: { color: colors.textMain, fontSize: 14 },
  conditionRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  dateField: {
    flex: 1,
    minHeight: 68,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  dateDivider: { width: 34, alignItems: 'center' },
  dateLabel: { color: colors.textSub, fontSize: 11, fontWeight: '700' },
  dateValueRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateValue: { color: colors.textMain, fontSize: 13, fontWeight: '800' },
  memberField: {
    minHeight: 54,
    marginBottom: 12,
    paddingHorizontal: 13,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
  },
  memberIcon: {
    width: 34,
    height: 34,
    marginRight: 9,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  memberLabel: { flex: 1, color: colors.textMain, fontSize: 14, fontWeight: '700' },
  memberInput: {
    width: 54,
    height: 38,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 11,
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
  },
  memberUnit: { marginLeft: 7, color: colors.textSub, fontSize: 13, fontWeight: '700' },
  meetingRow: {
    marginBottom: 16,
    padding: 4,
    borderRadius: 14,
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
  },
  meetingButton: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  meetingButtonActive: { backgroundColor: colors.primary },
  meetingText: { color: colors.textSub, fontSize: 13, fontWeight: '700' },
  meetingTextActive: { color: '#FFFFFF', fontWeight: '800' },
  submitButton: {
    minHeight: 54,
    marginTop: 3,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  initializingText: { marginBottom: 14, color: colors.textSub, fontSize: 13, textAlign: 'center' },
  pickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 40, 0.42)' },
  pickerCard: {
    height: '84%',
    paddingTop: 19,
    paddingHorizontal: 18,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
  },
  pickerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  pickerTitle: { color: colors.textMain, fontSize: 20, fontWeight: '800' },
  pickerDescription: { marginTop: 5, color: colors.textSub, fontSize: 12 },
  pickerClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
  sourceTabs: {
    marginTop: 18,
    padding: 4,
    borderRadius: 13,
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
  },
  sourceTab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  sourceTabActive: { backgroundColor: '#FFFFFF' },
  sourceTabText: { color: colors.textSub, fontSize: 13, fontWeight: '700' },
  sourceTabTextActive: { color: colors.primary, fontWeight: '800' },
  searchBox: {
    minHeight: 48,
    marginTop: 13,
    paddingHorizontal: 13,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
  },
  searchInput: { flex: 1, marginLeft: 8, color: colors.textMain, fontSize: 14 },
  activityList: { marginTop: 8 },
  activityRow: {
    minHeight: 86,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityRowBody: { flex: 1, paddingRight: 10 },
  activityRowTitle: { color: colors.textMain, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  activityRowMeta: { marginTop: 5, color: colors.textSub, fontSize: 11 },
  activityDeadline: { marginTop: 5, color: colors.primary, fontSize: 11, fontWeight: '700' },
  activityEmpty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 12, color: colors.textMain, fontSize: 15, fontWeight: '800' },
  emptyText: { marginTop: 7, color: colors.textSub, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
