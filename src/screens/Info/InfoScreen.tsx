import React, { useEffect, useMemo, useState } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import AppHeader from '../../components/AppHeader';
import { ACTIVITY_FILTER_CATEGORIES } from '../../constants/activityCategories';

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

  const [searchText, setSearchText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    fetchActivities();
  }, []);

  useEffect(() => {
    const initialCategory = route.params?.initialCategory;
    if (typeof initialCategory === 'string' && initialCategory) {
      setSelectedCategories([initialCategory]);
    }
  }, [route.params?.filterNonce, route.params?.initialCategory]);

  const fetchActivities = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/activities`);
      setActivities(res.data);
    } catch (error) {
      console.error('활동 불러오기 오류:', error);
    }
  };

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
      <ScrollView style={styles.activityList}>
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
              <Text style={styles.activityTitle}>{item.title}</Text>
              <Text style={styles.activityCategory}>
                {[item.category, item.topic_category].filter(Boolean).join(' · ')}
              </Text>
              {applicationPeriod && (
                <Text style={styles.activityText}>신청: {applicationPeriod}</Text>
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
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 6,
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
