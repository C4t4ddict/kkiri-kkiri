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

const ActivityDetailScreen = () => {
  const route = useRoute<RouteProp<{ params: { id: number } }, 'params'>>();
  const { id } = route.params;

  const [activity, setActivity] = useState<any>(null);

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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{activity.title}</Text>

      {activity.main_image_url && (
        <Image source={{ uri: activity.main_image_url }} style={styles.image} />
      )}

      <View style={styles.infoContainer}>
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

        <Text style={styles.sectionTitle}>세부 내용</Text>
        <Text style={styles.detailsText}>{activity.details}</Text>

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
    <Text style={styles.rowText}>
      <Text style={styles.boldLabel}>{label}: </Text>
      {value}
    </Text>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#101828',
    marginBottom: 12,
  },
  loadingText: {
    padding: 20,
  },
  image: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#eee',
  },
  infoContainer: {
    marginBottom: 24,
  },
  rowText: {
    fontSize: 14,
    color: '#101828',
    marginBottom: 6,
    lineHeight: 20,
  },
  boldLabel: {
    fontWeight: 'bold',
    color: '#101828',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#344054',
    marginTop: 12,
    marginBottom: 6,
  },
  detailsText: {
    fontSize: 14,
    color: '#101828',
    lineHeight: 22,
  },
  sourceButton: {
    alignItems: 'center',
    backgroundColor: '#7A5AF8',
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
