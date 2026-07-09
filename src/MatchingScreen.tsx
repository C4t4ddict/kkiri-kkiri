import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

const BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const categories = ['공모전', '비교과', '경진대회', '동아리', '소모임', '기타'];

type Recruitment = {
  recruitment_id: number;
  team_id?: number | null;
  post_name: string;
  activity_type: string;
  required_members: number;
  activity_period?: string | null;
  meeting_type?: string | null;
  memo?: string | null;
  status?: string | null;
};

type Application = {
  application_id: number;
  recruitment_id: number;
  applicant_id: number;
  status?: string | null;
};

export default function MatchingScreen() {
  const navigation = useNavigation<any>();
  const [searchText, setSearchText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [recruitmentResponse, applicationResponse] = await Promise.all([
        fetch(`${BASE_URL}/api/team-recruitments`),
        fetch(`${BASE_URL}/api/applications`),
      ]);

      if (!recruitmentResponse.ok || !applicationResponse.ok) {
        throw new Error('매칭 데이터를 불러오지 못했습니다.');
      }

      setRecruitments(await recruitmentResponse.json());
      setApplications(await applicationResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '매칭 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const headcountsByRecruitment = useMemo(() => {
    const map = new Map<number, number>();

    applications.forEach(application => {
      const status = (application.status || '').toUpperCase();
      if (status === 'REJECTED' || status === 'CANCELED' || status === 'CANCELLED') return;
      map.set(application.recruitment_id, (map.get(application.recruitment_id) || 0) + 1);
    });

    return map;
  }, [applications]);

  const filteredRecruitments = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return recruitments.filter(recruitment => {
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(recruitment.activity_type);
      const matchesKeyword =
        keyword.length === 0 ||
        recruitment.post_name?.toLowerCase().includes(keyword) ||
        recruitment.memo?.toLowerCase().includes(keyword);

      return matchesCategory && matchesKeyword;
    });
  }, [recruitments, searchText, selectedCategories]);

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(item => item !== category)
        : [...prev, category]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>끼리끼리</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} hitSlop={10}>
          <Icon name="notifications-outline" size={24} color="#101828" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search-outline" size={20} color="#667085" style={styles.searchIcon} />
        <TextInput
          placeholder="검색어를 입력하세요"
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#667085"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterBox}>
        <View style={styles.checkboxGrid}>
          {categories.map(category => {
            const selected = selectedCategories.includes(category);

            return (
              <TouchableOpacity
                key={category}
                style={styles.checkboxItem}
                onPress={() => toggleCategory(category)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkboxSquare, selected && styles.checkboxSquareSelected]}>
                  {selected && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>{category}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7A5AF8" />
          <Text style={styles.centerText}>매칭 데이터를 불러오는 중...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchAll}>
            <Text style={styles.retryText}>다시 불러오기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredRecruitments.map(recruitment => {
            const currentMembers = headcountsByRecruitment.get(recruitment.recruitment_id) || 0;

            return (
              <TouchableOpacity
                key={recruitment.recruitment_id}
                style={styles.item}
                activeOpacity={0.85}
              >
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {recruitment.post_name}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  {recruitment.activity_type || '-'} | {recruitment.meeting_type || '-'} |{' '}
                  {recruitment.activity_period || '-'}
                </Text>
                <Text style={styles.itemMeta}>
                  인원 : [{currentMembers}/{recruitment.required_members ?? 0}]
                </Text>
              </TouchableOpacity>
            );
          })}

          {filteredRecruitments.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>모집글이 없습니다.</Text>
              <Text style={styles.emptyText}>검색어나 카테고리를 다시 확인해주세요.</Text>
            </View>
          )}

          <View style={styles.createButtonWrap}>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('TeamFind')}
              activeOpacity={0.85}
            >
              <Text style={styles.createButtonText}>팀 만들기</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  logo: { fontSize: 20, fontWeight: '700', color: '#7A5AF8' },
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
  searchIcon: { marginRight: 8 },
  searchInput: { fontSize: 16, color: '#101828', flex: 1 },
  filterBox: {
    backgroundColor: '#F9F5FF',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 12,
    marginHorizontal: 20,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  checkboxItem: {
    width: '32%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#7A5AF8',
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareSelected: { backgroundColor: '#7A5AF8' },
  checkMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  checkboxLabel: { fontSize: 12, color: '#101828' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  centerText: { marginTop: 12, color: '#667085' },
  errorText: { color: '#EF4444', marginBottom: 16, textAlign: 'center' },
  retryButton: { backgroundColor: '#7A5AF8', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 120 },
  item: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  itemTitle: { fontSize: 17, fontWeight: '800', color: '#101828', marginBottom: 6 },
  itemSub: { fontSize: 13, color: '#667085', marginBottom: 8 },
  itemMeta: { fontSize: 13, color: '#7A5AF8', fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: 24, borderRadius: 16, backgroundColor: '#F9FAFB' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#667085' },
  createButtonWrap: { alignItems: 'center', marginTop: 16, marginBottom: 24 },
  createButton: {
    backgroundColor: '#7A5AF8',
    borderRadius: 999,
    paddingHorizontal: 34,
    paddingVertical: 14,
  },
  createButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
