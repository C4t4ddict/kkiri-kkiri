// HomeScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, Image,
  TouchableOpacity, Platform, ActivityIndicator, Alert, SafeAreaView
} from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types'; // 경로: src/screens 기준
import AppHeader from '../components/AppHeader';
import { HOME_ACTIVITY_CATEGORIES } from '../constants/activityCategories';

type RootNav = StackNavigationProp<RootStackParamList>;
// const H_PADDING = 22; // ← 화면 좌우 공통 여백
const LIST_H_PADDING = 28;  // ← '모집중' 이하 좌우 여백(더 넓게)

type Activity = {
  activity_id: number;
  title: string;
  category: string;
  topic_category?: string | null;
  source_name?: string | null;
  main_image_url?: string | null;
  application_period_end?: string | null;
  created_at?: string;
};

const BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function HomeScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const rootNav = useNavigation<RootNav>(); // ← 루트 스택 네비게이터

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 필요시 서버에 status=open 같은 필터를 붙여도 됨
        const res = await axios.get<Activity[]>(`${BASE_URL}/api/activities`);
        if (mounted) setActivities(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.error(e);
        Alert.alert('오류', '활동 목록을 불러오지 못했습니다.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 오늘 기준 모집 중(신청 마감일이 오늘 이후)이면 true
  const isOpen = (a: Activity) => {
    if (!a.application_period_end) return true; // 마감일이 없으면 노출
    const end = new Date(a.application_period_end);
    const today = new Date();
    end.setHours(23, 59, 59, 999);
    return end.getTime() >= today.getTime();
  };

  // 상단 배너(이미지 있는 최신 항목)
  const bannerItems = useMemo(
    () =>
      activities
        .filter(isOpen)
        .filter(a => !!a.main_image_url)
        .sort((a, b) =>
          (a.application_period_end ?? '9999').localeCompare(b.application_period_end ?? '9999')
        )
        .slice(0, 12),
    [activities]
  );

  const openActivities = useMemo(() => activities.filter(isOpen), [activities]);
  const listSource = openActivities.length > 0 ? openActivities : activities;

  const categories = useMemo(() => {
    const dbCategories = Array.from(new Set(
      listSource
        .map(activity => activity.topic_category || activity.category)
        .filter((category): category is string => !!category)
    ));
    const ordered = HOME_ACTIVITY_CATEGORIES.filter(category => dbCategories.includes(category));
    const orderedSet = new Set<string>(ordered);
    const custom = dbCategories.filter(category => !orderedSet.has(category));
    return [...ordered, ...custom];
  }, [listSource]);

  // 카테고리별 모집중 리스트(최대 5개씩)
  const groupedOpen = useMemo(() => {
    const byCat: Record<string, Activity[]> = {};
    categories.forEach(cat => {
      byCat[cat] = listSource
        .filter(a => (a.topic_category || a.category) === cat)
        .sort((a, b) =>
          openActivities.length > 0
            ? (a.application_period_end ?? '').localeCompare(b.application_period_end ?? '')
            : (b.created_at ?? '').localeCompare(a.created_at ?? '')
        )
        .slice(0, 5);
    });
    return byCat;
  }, [categories, listSource, openActivities.length]);

  const goDetail = (id: number) => {
    // 스택 라우트명이 다르면 여기만 수정
    // e.g. navigation.navigate('ActivityDetail', { id })
    // @ts-ignore
    navigation.navigate('InfoDetail', { id });
  };

  const goCategory = (category: string) => {
    // @ts-ignore
    navigation.navigate('정보', { initialCategory: category, filterNonce: Date.now() });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <AppHeader actions={
        <TouchableOpacity onPress={() => rootNav.navigate('Notifications')}>
          <Image source={require('../assets/bell.png')} style={styles.bellIcon} resizeMode="contain" />
        </TouchableOpacity>
      } />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* 헤더와 활동 사이 여유 공간 */}
        <View style={{ height: 20 }} />

        {/* 활동 - 배너 */}
        <Text style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>활동</Text>
        <FlatList
          horizontal
          data={bannerItems}
          keyExtractor={item => String(item.activity_id)}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingRight: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.posterCard}
              onPress={() => goDetail(item.activity_id)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: item.main_image_url! }}
                style={styles.bannerImage}
                resizeMode="cover"
              />
              <Text style={styles.posterCategory} numberOfLines={1}>
                {item.topic_category || item.category}
              </Text>
              <Text style={styles.posterTitle} numberOfLines={2}>{item.title}</Text>
            </TouchableOpacity>
          )}
        />

        {/* 모집중 */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={styles.sectionHeader}>모집중</Text>
        </View>
        {/* 구분선은 목록 여백에 맞춰 정렬 */}
        <View style={[styles.divider, { marginHorizontal: 20 }]} />

       {/* 모집중 목록 */}
        <View style={[styles.listWrapper, { paddingHorizontal: LIST_H_PADDING }]}>
          {categories.map((cat, idx) => {
            const list = groupedOpen[cat] || [];
            return (
              <View
                key={cat}
                style={[styles.categoryBox, idx > 0 && styles.categoryGap]} // ← 섹션 간격
              >
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryTitle}>{cat}</Text>
                  <TouchableOpacity onPress={() => goCategory(cat)} style={styles.moreButton}>
                    <Text style={styles.more}>더보기</Text>
                    <Text style={styles.moreChevron}>›</Text>
                  </TouchableOpacity>
                </View>

                {list.length === 0 ? (
                  <Text style={styles.emptyRow}>현재 모집 중인 항목이 없습니다.</Text>
                ) : (
                  list.map(item => (
                    <TouchableOpacity
                      key={item.activity_id}
                      style={styles.row}
                      onPress={() => goDetail(item.activity_id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  //bell: { fontSize: 18 },
  bellIcon: {
    width: 25,
    height: 25,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 10,
  },
  bannerImage: {
    width: 138,
    height: 194,
    borderRadius: 14,
    backgroundColor: '#EEE',
  },
  posterCard: {
    width: 138,
  },
  posterCategory: {
    marginTop: 9,
    color: '#7A5AF8',
    fontSize: 11,
    fontWeight: '700',
  },
  posterTitle: {
    marginTop: 3,
    color: '#101828',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  recruitmentHeaderWrapper: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  divider: {
    height: 1,
    backgroundColor: '#E4E7EC',
    marginTop: 6,
    marginBottom: 8,
  },
  listWrapper: {
   
  },
  categoryBox: { marginTop: 4 },
  categoryGap: { marginTop:18},
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 8,
  },
  categoryTitle: { fontSize: 16, fontWeight: '700', color: '#101828' },
  moreButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  more: { fontSize: 13, color: '#667085' },
  moreChevron: { marginLeft: 3, fontSize: 18, color: '#98A2B3', lineHeight: 18 },
  row: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEFF3',
  },
  rowTitle: { fontSize: 14, color: '#101828' },
  emptyRow: { paddingVertical: 8, color: '#667085' },
});
