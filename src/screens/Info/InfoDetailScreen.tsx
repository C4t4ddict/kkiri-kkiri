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
import { RouteProp, useRoute } from '@react-navigation/native';
import axios from 'axios';
import colors from '../../config/colors';

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
  const route = useRoute<RouteProp<{ params: { id: number } }, 'params'>>();
  const { id } = route.params;

  const [activity, setActivity] = useState<any>(null);
  const [posterAspectRatio, setPosterAspectRatio] = useState(3 / 4);

  useEffect(() => {
    const fetchActivityDetail = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/activities/${id}`);
        setActivity(res.data);
      } catch (error) {
        console.error('활동 상세 조회 오류:', error);
      }
    };

    fetchActivityDetail();
  }, [id]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headingBlock}>
        <Text style={styles.eyebrow}>활동 정보</Text>
        <Text style={styles.title}>{activity.title}</Text>
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
        <InfoRow
          label="신청기간"
          value={formatDateRange(activity.application_period_start, activity.application_period_end)}
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
  eyebrow: {
    marginBottom: 7,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    fontSize: 24,
    lineHeight: 33,
    fontWeight: '800',
    color: colors.textMain,
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
