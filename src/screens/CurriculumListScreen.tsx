import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../config/colors';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import ScreenState from '../components/ScreenState';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

type CurriculumSummary = {
  curriculum_id: number;
  title: string;
  role_title?: string;
  summary: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  duration_weeks: number;
  weekly_hours: number;
  goal_count: number;
  participant_count: number;
  organization_name: string;
  organization_logo_url?: string;
  brand_color?: string;
  is_verified?: boolean;
};

const difficultyMeta = {
  BEGINNER: { label: '입문', background: '#ECFDF3', color: '#027A48' },
  INTERMEDIATE: { label: '중급', background: '#FFF7E8', color: '#B54708' },
  ADVANCED: { label: '심화', background: '#FEF3F2', color: '#B42318' },
};

export default function CurriculumListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [curricula, setCurricula] = useState<CurriculumSummary[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await axios.get<CurriculumSummary[]>(`${API_BASE_URL}/api/curricula`, {
        headers: user?.id ? { 'x-user-id': String(user.id) } : undefined,
      });
      setCurricula(Array.isArray(response.data) ? response.data : []);
      setError(false);
    } catch (loadError) {
      console.warn('기업 커리큘럼 조회 실패:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => curricula.filter((item) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [item.title, item.summary, item.role_title, item.organization_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    return matchesQuery && (difficulty === 'ALL' || item.difficulty === difficulty);
  }), [curricula, difficulty, search]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Icon name="sparkles" size={24} color="#FFFFFF" /></View>
          <Text style={styles.heroEyebrow}>ENTERPRISE LEARNING</Text>
          <Text style={styles.heroTitle}>가고 싶은 기업의 기준을{`\n`}내 활동으로 시작하세요</Text>
          <Text style={styles.heroDescription}>기업이 설계한 기술 목표를 개인 또는 팀 일정으로 바꿔 꾸준히 완주할 수 있어요.</Text>
          <View style={styles.heroStats}>
            <View><Text style={styles.heroStatValue}>{curricula.length}</Text><Text style={styles.heroStatLabel}>공개 로드맵</Text></View>
            <View style={styles.heroDivider} />
            <View><Text style={styles.heroStatValue}>{curricula.reduce((sum, item) => sum + item.goal_count, 0)}</Text><Text style={styles.heroStatLabel}>학습 목표</Text></View>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Icon name="search-outline" size={19} color={colors.textSub} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="기업, 직무, 기술 검색"
            placeholderTextColor="#98A2B3"
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {[
            ['ALL', '전체'],
            ['BEGINNER', '입문'],
            ['INTERMEDIATE', '중급'],
            ['ADVANCED', '심화'],
          ].map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.filterChip, difficulty === value && styles.filterChipActive]}
              onPress={() => setDifficulty(value)}
            >
              <Text style={[styles.filterText, difficulty === value && styles.filterTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionEyebrow}>CURRICULUM</Text><Text style={styles.sectionTitle}>기업 커리큘럼</Text></View>
          <Text style={styles.resultCount}>{filtered.length}개</Text>
        </View>

        {loading ? <ScreenState kind="loading" /> : null}
        {!loading && error && curricula.length === 0 ? <ScreenState kind="error" onRetry={load} /> : null}
        {!loading && !error && filtered.length === 0 ? (
          <ScreenState kind="empty" title="조건에 맞는 커리큘럼이 없어요" description="다른 기업이나 기술을 검색해보세요." />
        ) : null}

        {filtered.map((item) => {
          const level = difficultyMeta[item.difficulty] || difficultyMeta.BEGINNER;
          const brandColor = /^#[0-9A-F]{6}$/i.test(item.brand_color || '') ? item.brand_color : colors.primary;
          return (
            <TouchableOpacity
              key={item.curriculum_id}
              activeOpacity={0.82}
              style={styles.card}
              onPress={() => navigation.navigate('CurriculumDetail', { id: item.curriculum_id })}
            >
              <View style={[styles.cardAccent, { backgroundColor: brandColor }]} />
              <View style={styles.companyRow}>
                <View style={[styles.companyLogo, { backgroundColor: `${brandColor}18` }]}>
                  <Text style={[styles.companyLogoText, { color: brandColor }]}>{item.organization_name.slice(0, 1)}</Text>
                </View>
                <View style={styles.companyCopy}>
                  <View style={styles.verifiedRow}>
                    <Text style={styles.companyName}>{item.organization_name}</Text>
                    {item.is_verified ? <Icon name="checkmark-circle" size={15} color="#2E90FA" /> : null}
                  </View>
                  <Text style={styles.roleTitle}>{item.role_title || '기술 직무 공통'}</Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: level.background }]}>
                  <Text style={[styles.levelText, { color: level.color }]}>{level.label}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}><Icon name="calendar-clear-outline" size={15} color={colors.textSub} /><Text style={styles.metaText}>{item.duration_weeks}주</Text></View>
                <View style={styles.metaItem}><Icon name="time-outline" size={15} color={colors.textSub} /><Text style={styles.metaText}>주 {item.weekly_hours}시간</Text></View>
                <View style={styles.metaItem}><Icon name="checkbox-outline" size={15} color={colors.textSub} /><Text style={styles.metaText}>{item.goal_count}개 목표</Text></View>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.participantText}>{item.participant_count > 0 ? `${item.participant_count}명이 학습 중` : '첫 번째 학습자가 되어보세요'}</Text>
                <View style={styles.openButton}><Text style={styles.openButtonText}>자세히</Text><Icon name="arrow-forward" size={15} color={colors.primary} /></View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FB' },
  content: { padding: 16, paddingBottom: 42 },
  hero: { overflow: 'hidden', padding: 24, borderRadius: 26, backgroundColor: '#2F2457' },
  heroIcon: { width: 45, height: 45, marginBottom: 20, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  heroEyebrow: { color: '#CFC4FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { marginTop: 8, color: '#FFFFFF', fontSize: 25, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  heroDescription: { marginTop: 12, color: '#DDD7F6', fontSize: 13, lineHeight: 20 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 24 },
  heroStatValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  heroStatLabel: { marginTop: 2, color: '#CFC8E7', fontSize: 10, fontWeight: '700' },
  heroDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, minHeight: 48, color: colors.textMain, fontSize: 14 },
  filters: { gap: 8, paddingVertical: 14 },
  filterChip: { paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: '#FFFFFF' },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  filterText: { color: colors.textSub, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: colors.primaryDark },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 },
  sectionEyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { marginTop: 3, color: colors.textMain, fontSize: 21, fontWeight: '900' },
  resultCount: { color: colors.textSub, fontSize: 12, fontWeight: '700' },
  card: { overflow: 'hidden', marginBottom: 12, padding: 18, borderWidth: 1, borderColor: '#E7E7EF', borderRadius: 20, backgroundColor: '#FFFFFF' },
  cardAccent: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4 },
  companyRow: { flexDirection: 'row', alignItems: 'center' },
  companyLogo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  companyLogoText: { fontSize: 17, fontWeight: '900' },
  companyCopy: { flex: 1, marginLeft: 11 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  companyName: { color: colors.textMain, fontSize: 13, fontWeight: '800' },
  roleTitle: { marginTop: 3, color: colors.textSub, fontSize: 10 },
  levelBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  levelText: { fontSize: 9, fontWeight: '900' },
  cardTitle: { marginTop: 17, color: colors.textMain, fontSize: 18, lineHeight: 25, fontWeight: '900', letterSpacing: -0.4 },
  cardSummary: { marginTop: 7, color: colors.textSub, fontSize: 12, lineHeight: 19 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: colors.textSub, fontSize: 10, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#F0F1F4' },
  participantText: { color: '#98A2B3', fontSize: 10 },
  openButton: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  openButtonText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
});
