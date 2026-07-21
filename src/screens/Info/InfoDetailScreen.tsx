import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Platform,
  Linking,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import colors from '../../config/colors';
import ApplicationStatusBadge from '../../components/ApplicationStatusBadge';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../../context/AuthContext';

const BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
};

const formatDateRange = (startDate?: string | null, endDate?: string | null) => {
  const start = formatDate(startDate || '');
  const end = formatDate(endDate || '');
  return [start, end].filter(Boolean).join(' ~ ');
};

const formatDetails = (details?: string | null) => {
  if (!details) return '등록된 세부 내용이 없습니다.';
  return String(details)
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s*■\s*/g, '\n\n')
    .replace(
      /\s*(총상금|지원\s*자격|접수\s*방법|시상\s*내역|유의\s*사항|문의처|활동\s*내용|모집\s*기간|공모\s*주제|공모\s*일정|작품\s*요건|공모전\s*상금\s*및\s*부상)\s*[-:：]?\s*/g,
      '\n\n$1\n'
    )
    .replace(/\s*-\s*(?=(예선|본선|최종|영상|출품|최우수상|우수상|참가상))/g, '\n• ')
    .replace(/([.!?])(?=[가-힣A-Z])/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const ActivityDetailScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProp<{ params: { id: number } }, 'params'>>();
  const { id } = route.params;
  const { user } = useAuth();

  const [activity, setActivity] = useState<any>(null);
  const [posterAspectRatio, setPosterAspectRatio] = useState(3 / 4);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [recruitments, setRecruitments] = useState<any[]>([]);

  useEffect(() => {
    const fetchActivityDetail = async () => {
      try {
        const [activityResponse, recruitmentResponse] = await Promise.all([
          axios.get(`${BASE_URL}/api/activities/${id}`),
          axios.get(`${BASE_URL}/api/activities/${id}/recruitments`),
        ]);
        setActivity(activityResponse.data);
        setRecruitments(Array.isArray(recruitmentResponse.data) ? recruitmentResponse.data : []);
      } catch (error) {
        console.error('활동 상세 조회 오류:', error);
      }
    };

    fetchActivityDetail();
  }, [id]);

  useEffect(() => {
    if (!user?.id) return;

    axios
      .get<number[]>(`${BASE_URL}/api/favorite-activities/ids`, {
        headers: { 'x-user-id': String(user.id) },
      })
      .then((res) => setIsFavorite((res.data || []).map(Number).includes(Number(id))))
      .catch((error) => console.error('관심 활동 상태 조회 오류:', error));
  }, [id, user?.id]);

  useEffect(() => {
    if (!activity?.main_image_url) return;
    Image.getSize(
      activity.main_image_url,
      (width, height) => {
        if (width > 0 && height > 0) setPosterAspectRatio(width / height);
      },
      () => setPosterAspectRatio(3 / 4)
    );
  }, [activity?.main_image_url]);

  if (!activity) return <Text style={styles.loadingText}>로딩 중...</Text>;

  const externalUrl = activity.official_url || activity.source_url;
  const openExternalUrl = async () => {
    if (!externalUrl) return;
    try {
      await Linking.openURL(externalUrl);
    } catch (error) {
      Alert.alert('오류', '원문 페이지를 열 수 없습니다.');
    }
  };

  const toggleFavorite = async () => {
    if (!user?.id || savingFavorite) return;

    setSavingFavorite(true);
    try {
      const config = { headers: { 'x-user-id': String(user.id) } };
      if (isFavorite) {
        await axios.delete(`${BASE_URL}/api/favorite-activities/${id}`, config);
      } else {
        await axios.post(`${BASE_URL}/api/favorite-activities/${id}`, {}, config);
      }
      setIsFavorite((value) => !value);
    } catch (error: any) {
      Alert.alert('저장 실패', error?.response?.data?.message || '관심 활동을 저장하지 못했습니다.');
    } finally {
      setSavingFavorite(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headingBlock}>
        <View style={styles.headingTopRow}>
          <Text style={styles.eyebrow}>활동 정보</Text>
          <TouchableOpacity
            style={[styles.favoriteButton, isFavorite && styles.favoriteButtonSelected]}
            onPress={toggleFavorite}
            disabled={savingFavorite}
            activeOpacity={0.75}
          >
            <Icon name={isFavorite ? 'heart' : 'heart-outline'} size={18} color={colors.primary} />
            <Text style={styles.favoriteButtonText}>{isFavorite ? '저장됨' : '저장'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{activity.title}</Text>
          {Number(activity.open_recruitment_count) > 0 && (
            <View style={styles.recruitmentBadge}>
              <Text style={styles.recruitmentBadgeText}>+{activity.open_recruitment_count}</Text>
            </View>
          )}
        </View>
      </View>

      {activity.main_image_url && (
        <View style={styles.posterCard}>
          <Image
            source={{ uri: activity.main_image_url }}
            style={[styles.image, { aspectRatio: posterAspectRatio }]}
            resizeMode="contain"
          />
        </View>
      )}

      <View style={styles.infoContainer}>
        <Text style={styles.cardTitle}>상세 정보</Text>
        <InfoRow label="모집대상" value={activity.target_audience} />
        <InfoRow label="주최" value={activity.organizer} />
        <InfoRow label="분류" value={[activity.category, activity.topic_category].filter(Boolean).join(' · ')} />
        <InfoRow label="장소" value={activity.location} />
        <InfoRow
          label="운영기간"
          value={formatDateRange(activity.operation_period_start, activity.operation_period_end)}
        />
        <ApplicationPeriodRow
          value={formatDateRange(activity.application_period_start, activity.application_period_end)}
          start={activity.application_period_start}
          end={activity.application_period_end}
        />
        <InfoRow label="문의" value={activity.contact} />
        <InfoRow
          label="다드림포인트"
          value={activity.points != null ? `${activity.points.toLocaleString()}P` : null}
        />

      </View>

      <View style={styles.detailsCard}>
        <Text style={styles.sectionTitle}>세부 내용</Text>
        <Text style={styles.detailsText} selectable>{formatDetails(activity.details)}</Text>

        {externalUrl && (
          <TouchableOpacity style={styles.sourceButton} onPress={openExternalUrl} activeOpacity={0.8}>
            <Text style={styles.sourceButtonText}>
              {activity.official_url ? '주최사 홈페이지 보기' : '원문 보기'}
            </Text>
          </TouchableOpacity>
        )}
        {activity.source_name && (
          <Text style={styles.sourceText}>출처: {activity.source_name}</Text>
        )}
      </View>

      {recruitments.length > 0 && (
        <View style={styles.recruitmentSection}>
          <View style={styles.recruitmentHeadingRow}>
            <Text style={styles.sectionTitle}>현재 모집 중인 팀</Text>
            <View style={styles.recruitmentCountPill}>
              <Text style={styles.recruitmentCountText}>{recruitments.length}개</Text>
            </View>
          </View>
          {recruitments.map((recruitment) => (
            <TouchableOpacity
              key={recruitment.recruitment_id}
              style={styles.recruitmentCard}
              onPress={() => navigation.navigate('MatchingDetail', { id: recruitment.recruitment_id })}
              activeOpacity={0.78}
            >
              <View style={styles.recruitmentCardBody}>
                <Text style={styles.recruitmentTitle} numberOfLines={2}>{recruitment.post_name}</Text>
                <Text style={styles.recruitmentMeta} numberOfLines={1}>
                  {[recruitment.activity_type, recruitment.meeting_type, `${recruitment.required_members}명 모집`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {recruitment.memo ? (
                  <Text style={styles.recruitmentMemo} numberOfLines={2}>{recruitment.memo}</Text>
                ) : null}
              </View>
              <Icon name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

// 라벨:값 한 줄로 구성
const InfoRow = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.boldLabel}>{label}</Text>
      <Text style={styles.rowText}>{value}</Text>
    </View>
  );
};

const ApplicationPeriodRow = ({
  value,
  start,
  end,
}: {
  value?: string | null;
  start?: string | null;
  end?: string | null;
}) => {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.boldLabel}>신청기간</Text>
      <View style={styles.applicationValue}>
        <Text style={styles.applicationText}>{value}</Text>
        <ApplicationStatusBadge start={start} end={end} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 40,
  },
  headingBlock: {
    marginBottom: 18,
  },
  headingTopRow: {
    minHeight: 36,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  favoriteButton: {
    minWidth: 78,
    minHeight: 34,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
  },
  favoriteButtonSelected: {
    backgroundColor: colors.primarySurface,
  },
  favoriteButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    flexShrink: 1,
    fontSize: 24,
    lineHeight: 33,
    fontWeight: '800',
    color: colors.textMain,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recruitmentBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  recruitmentBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  loadingText: {
    padding: 20,
  },
  posterCard: {
    width: '100%',
    marginBottom: 18,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
  },
  image: {
    width: '100%',
    backgroundColor: '#F2F4F7',
  },
  infoContainer: {
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  cardTitle: {
    marginBottom: 8,
    color: colors.textMain,
    fontSize: 17,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMain,
    lineHeight: 21,
  },
  applicationValue: {
    flex: 1,
    gap: 6,
  },
  applicationText: {
    fontSize: 14,
    color: colors.textMain,
    lineHeight: 21,
  },
  boldLabel: {
    width: 82,
    marginRight: 10,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.textSub,
  },
  detailsCard: {
    padding: 17,
    borderRadius: 18,
    backgroundColor: colors.primarySurface,
  },
  recruitmentSection: {
    marginTop: 16,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  recruitmentHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recruitmentCountPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.primarySurface,
  },
  recruitmentCountText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
  },
  recruitmentCard: {
    minHeight: 82,
    marginTop: 10,
    padding: 13,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
  },
  recruitmentCardBody: { flex: 1, paddingRight: 10 },
  recruitmentTitle: {
    color: colors.textMain,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  recruitmentMeta: {
    marginTop: 5,
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  recruitmentMemo: {
    marginTop: 6,
    color: colors.textSub,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textMain,
    marginBottom: 12,
  },
  detailsText: {
    fontSize: 14,
    color: '#344054',
    lineHeight: 24,
  },
  sourceButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginTop: 20,
    paddingVertical: 12,
  },
  sourceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  sourceText: {
    color: '#98A2B3',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default ActivityDetailScreen;
