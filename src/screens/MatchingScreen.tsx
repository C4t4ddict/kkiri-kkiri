// MatchingScreen.tsx
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';

import { useFocusEffect } from '@react-navigation/native';
import AppHeader from '../components/AppHeader';
import NotificationBell from '../components/NotificationBell';
import AppRefreshControl from '../components/AppRefreshControl';
import { MATCHING_ACTIVITY_CATEGORIES } from '../constants/activityCategories';

const BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

type Recruitment = {
  recruitment_id: number;
  team_id?: number;
  post_name: string;            // 제목
  activity_type: string;           // 공모전/비교과/...
  qualification_department?: string;
  qualification_student_number?: string;
  qualification_age?: number;
  required_members: number;        // 필요 인원(정원)
  activity_period?: string;        // "8주" 등 사람이 읽는 기간 텍스트
  meeting_type?: '대면' | '비대면' | '혼합' | string;
  memo?: string;
  status?: string;
  created_at?: string;
};

type Application = {
  application_id: number;
  recruitment_id: number;
  applicant_id: number;
  memo?: string;
  status?: string; // 'pending' | 'approved' | 'rejected' 등일 수 있음
  created_at?: string;
};

const MatchingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const [searchText, setSearchText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMeetingType, setSelectedMeetingType] = useState('전체');
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { user } = useAuth();

  const fetchAll = useCallback(async () => {
    try {
      const [rRes, aRes] = await Promise.all([
        axios.get(`${BASE_URL}/api/team-recruitments`),          // 또는 with-count
        axios.get(`${BASE_URL}/api/applications`),
      ]);
      setRecruitments(rRes.data || []);
      setApplications(aRes.data || []);
    } catch (e) {
      console.error('매칭 데이터 불러오기 오류:', e);
    }
  }, []);

  // 화면에 다시 포커스될 때마다 새로고침
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const categories = useMemo(() => {
    const values = new Set<string>(MATCHING_ACTIVITY_CATEGORIES);
    recruitments.forEach((recruitment) => {
      if (recruitment.activity_type) values.add(recruitment.activity_type);
    });
    return Array.from(values);
  }, [recruitments]);

  // ---- 현재 인원 집계 (status가 cancel/rejected가 아닌 것만 카운트) ----
  const headcountsByRecruitment = useMemo(() => {
    const map = new Map<number, number>();
    for (const app of applications) {
      const s = (app.status || '').toLowerCase();
      if (s === 'rejected' || s === 'canceled' || s === 'cancelled') continue;
      map.set(app.recruitment_id, (map.get(app.recruitment_id) || 0) + 1);
    }
    return map;
  }, [applications]);

  // ---- 필터 적용 ----
  const filtered = useMemo(() => {
    let list = [...recruitments];

    if (selectedCategories.length > 0) {
      list = list.filter((r) => selectedCategories.includes(r.activity_type));
    }

    if (selectedMeetingType !== '전체') {
      list = list.filter((r) => r.meeting_type === selectedMeetingType);
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (r) =>
          r.post_name?.toLowerCase().includes(q) ||
          r.memo?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [recruitments, searchText, selectedCategories, selectedMeetingType]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 로고 + 알림 */}
      <AppHeader actions={
        <NotificationBell />
      } />

      {/* 검색창 */}
      <View style={styles.searchContainer}>
        <Icon name="search-outline" size={20} color="#667085" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="검색어를 입력하세요"
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#667085"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>활동 유형</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          <TouchableOpacity
            style={[styles.filterChip, selectedCategories.length === 0 && styles.filterChipSelected]}
            onPress={() => setSelectedCategories([])}
          >
            <Text style={[styles.filterChipText, selectedCategories.length === 0 && styles.filterChipTextSelected]}>전체</Text>
          </TouchableOpacity>
          {categories.map((cat) => {
            const selected = selectedCategories.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, selected && styles.filterChipSelected]}
                onPress={() => toggleCategory(cat)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.meetingFilterRow}>
          {['전체', '대면', '비대면', '혼합'].map((meetingType) => {
            const selected = selectedMeetingType === meetingType;
            return (
              <TouchableOpacity
                key={meetingType}
                style={[styles.meetingChip, selected && styles.meetingChipSelected]}
                onPress={() => setSelectedMeetingType(meetingType)}
              >
                <Text style={[styles.meetingChipText, selected && styles.meetingChipTextSelected]}>{meetingType}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.resultCount}>모집글 {filtered.length}개</Text>
      </View>

      {/* 리스트 */}
      <ScrollView
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filtered.map((r) => {
          const current = headcountsByRecruitment.get(r.recruitment_id) || 0;
          return (
            <TouchableOpacity
              key={r.recruitment_id}
              style={styles.item}
              // 상세 페이지가 있다면 아래 라우트 이름만 바꿔서 사용하세요.
              onPress={() => navigation.navigate('MatchingDetail', { id: r.recruitment_id })}
              activeOpacity={0.8}
            >
              <Text style={styles.itemTitle} numberOfLines={1}>
                {r.post_name}
              </Text>

              <Text style={styles.itemSub} numberOfLines={1}>
                {r.activity_type || '-'} | {r.meeting_type || '-'} | {r.activity_period || '-'}
              </Text>

              <Text style={styles.itemMeta}>
                인원 : [{current}/{r.required_members ?? 0}]
              </Text>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 104 }} />
      </ScrollView>
      <TouchableOpacity
        style={styles.createFab}
        onPress={() => navigation.navigate('TeamMake', { user })}
        activeOpacity={0.85}
      >
        <Icon name="add" size={22} color="#FFFFFF" />
        <Text style={styles.createBtnText}>팀 만들기</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  bellIcon: {
    width: 25,
    height: 25,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  searchInput: {
    fontSize: 16,
    color: '#101828',
    flex: 1,
  },
  filterSection: {
    marginBottom: 8,
  },
  filterLabel: {
    marginHorizontal: 20,
    marginBottom: 9,
    color: '#344054',
    fontSize: 13,
    fontWeight: '700',
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterChipSelected: {
    borderColor: '#7A5AF8',
    backgroundColor: '#F4F1FF',
  },
  filterChipText: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: '#6941C6',
  },
  meetingFilterRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#F2F4F7',
  },
  meetingChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 9,
  },
  meetingChipSelected: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  meetingChipText: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
  },
  meetingChipTextSelected: {
    color: '#6941C6',
    fontWeight: '800',
  },
  resultCount: {
    marginHorizontal: 20,
    marginTop: 12,
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    color: '#101828',
  },
  itemSub: {
    fontSize: 14,
    color: '#475467',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 14,
    color: '#475467',
  },
  createFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#7A5AF8',
    shadowColor: '#7A5AF8',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 9,
    elevation: 7,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 6,
  },
});

export default MatchingScreen;
