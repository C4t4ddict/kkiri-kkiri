import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
} from 'react-native';
import axios from 'axios';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import AppHeader from '../../components/AppHeader';
import AppRefreshControl from '../../components/AppRefreshControl';
import ApplicationStatusBadge from '../../components/ApplicationStatusBadge';
import { ACTIVITY_FILTER_CATEGORIES } from '../../constants/activityCategories';
import { useAuth } from '../../context/AuthContext';
import colors from '../../config/colors';

const BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

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

const InfoScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<any>();
  const { user } = useAuth();

  const [searchText, setSearchText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const initialCategory = route.params?.initialCategory;
    if (typeof initialCategory === 'string' && initialCategory) {
      setSelectedCategories([initialCategory]);
    }
  }, [route.params?.filterNonce, route.params?.initialCategory]);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/activities`);
      setActivities(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('활동 불러오기 오류:', error);
    }
  }, []);

  const fetchFavoriteIds = useCallback(async () => {
    if (!user?.id) {
      setFavoriteIds(new Set());
      return;
    }

    try {
      const res = await axios.get<number[]>(`${BASE_URL}/api/favorite-activities/ids`, {
        headers: { 'x-user-id': String(user.id) },
      });
      setFavoriteIds(new Set((res.data || []).map(Number)));
    } catch (error) {
      console.error('관심 활동 불러오기 오류:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useFocusEffect(
    useCallback(() => {
      fetchFavoriteIds();
    }, [fetchFavoriteIds])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchActivities(), fetchFavoriteIds()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchActivities, fetchFavoriteIds]);

  const filteredActivities = useMemo(() => {
    let filtered = activities;

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((item) => {
        const sourceCategories = Array.isArray(item.source_categories)
          ? item.source_categories
          : [];
        return selectedCategories.some((category) =>
          item.category === category ||
          item.topic_category === category ||
          sourceCategories.includes(category)
        );
      });
    }

    if (searchText.trim()) {
      const keyword = searchText.toLowerCase();
      filtered = filtered.filter((item) =>
        [item.title, item.organizer, item.topic_category]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword))
      );
    }

    return filtered;
  }, [activities, searchText, selectedCategories]);

  const filterCategories = useMemo(() => {
    const selected = ACTIVITY_FILTER_CATEGORIES.filter((category) =>
      selectedCategories.includes(category)
    );
    const rest = ACTIVITY_FILTER_CATEGORIES.filter((category) =>
      !selectedCategories.includes(category)
    );
    return [...selected, ...rest];
  }, [selectedCategories]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 로고 + 종 아이콘 */}
      <AppHeader actions={
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <Image source={require('../../assets/bell.png')} style={styles.bellIcon} resizeMode="contain" />
        </TouchableOpacity>
      } />

      {/* 검색창 */}
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          onPress={() => setSelectedCategories([])}
          style={[styles.filterChip, selectedCategories.length === 0 && styles.filterChipSelected]}
        >
          <Text style={[styles.filterChipText, selectedCategories.length === 0 && styles.filterChipTextSelected]}>
            전체
          </Text>
        </TouchableOpacity>
        {filterCategories.map((cat) => {
          const selected = selectedCategories.includes(cat);
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => toggleCategory(cat)}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 활동 리스트 */}
      <ScrollView
        style={styles.activityList}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filteredActivities.length === 0 && (
          <View style={styles.emptyState}>
            <Icon name="search-outline" size={30} color="#98A2B3" />
            <Text style={styles.emptyTitle}>조건에 맞는 활동이 없어요</Text>
            <Text style={styles.emptyDescription}>다른 카테고리나 검색어를 선택해보세요.</Text>
          </View>
        )}
        {filteredActivities.map((item) => {
          const applicationPeriod = formatDateRange(
            item.application_period_start,
            item.application_period_end
          );
          const operationPeriod = formatDateRange(
            item.operation_period_start,
            item.operation_period_end
          );
          return (
            <TouchableOpacity
              key={item.activity_id}
              style={styles.activityItem}
              onPress={() => navigation.navigate('InfoDetail', { id: item.activity_id })}
            >
              <View style={styles.activityHeadingRow}>
                <Text style={styles.activityTitle} numberOfLines={2}>{item.title}</Text>
                {favoriteIds.has(Number(item.activity_id)) && (
                  <Icon name="heart" size={22} color={colors.primary} style={styles.favoriteIcon} />
                )}
              </View>
              <Text style={styles.activityCategory}>
                {[item.category, item.topic_category].filter(Boolean).join(' · ')}
              </Text>
              {applicationPeriod && (
                <View style={styles.applicationRow}>
                  <Text style={styles.activityText}>신청: {applicationPeriod}</Text>
                  <ApplicationStatusBadge
                    start={item.application_period_start}
                    end={item.application_period_end}
                  />
                </View>
              )}
              {operationPeriod && (
                <Text style={styles.activityText}>운영: {operationPeriod}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
    paddingHorizontal: 0,
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
  searchIcon: {
    marginRight: 8,
  },
  activityItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  activityList: {
    flex: 1,
  },
  activityTitle: {
    flex: 1,
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 6,
  },
  activityHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  favoriteIcon: {
    marginTop: 1,
  },
  activityCategory: {
    fontSize: 12,
    color: '#7A5AF8',
    fontWeight: '600',
    marginBottom: 8,
  },
  activityText: {
    fontSize: 14,
    color: '#555',
  },
  applicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 3,
  },
  filterScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterChipSelected: {
    borderColor: '#7A5AF8',
    backgroundColor: '#F4F0FF',
  },
  filterChipText: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: '#6941C6',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  emptyTitle: {
    marginTop: 12,
    color: '#344054',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDescription: {
    marginTop: 6,
    color: '#98A2B3',
    fontSize: 13,
  },
});

export default InfoScreen;
