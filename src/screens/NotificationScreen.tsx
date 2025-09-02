// src/screens/NotificationScreen.tsx
import React, { useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, FlatList, StyleSheet, Platform } from 'react-native';

type Notice = {
  id: string;
  channel: string;   // 예: '2025-1 학습공동체'
  title: string;     // 예: '팀에 합류되었습니다'
  time: string;      // 예: '1분전'
};

const sampleActivities: Notice[] = [
  { id: '1', channel: '2025-1 학습공동체', title: '팀에 합류되었습니다', time: '1분전' },
  { id: '2', channel: '2025-1 학습공동체', title: '팀에 합류되었습니다', time: '1분전' },
  { id: '3', channel: '2025-1 학습공동체', title: '팀에 합류되었습니다', time: '1분전' },
];

const sampleNotices: Notice[] = [
  { id: 'n1', channel: '공지', title: '서비스 점검 안내 (8/12 02:00~03:00)', time: '1일전' },
  { id: 'n2', channel: '공지', title: '개인정보 처리방침 개정 안내', time: '3일전' },
];

export default function NotificationScreen() {
  const [tab, setTab] = useState<'활동' | '공지'>('활동');
  const data = tab === '활동' ? sampleActivities : sampleNotices;

  const renderItem = ({ item }: { item: Notice }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.channel}>{item.channel}</Text>
        <Text style={styles.time}>{item.time}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* 탭 */}
      <View style={styles.tabs}>
        {/* 회색 베이스 라인(가로 전체) */}
        <View style={styles.tabBaseLine} />

        {(['활동', '공지'] as const).map(t => {
            const active = tab === t;
            return (
            <TouchableOpacity
                key={t}
                style={styles.tabBtn}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
            >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
            );
        })}

        {/* 활성 탭 검정 언더라인 (가로 전체를 2등분 중 선택 영역만) */}
        <View
            style={[
            styles.tabActiveBar,
            tab === '활동' ? { left: 0 } : { left: '50%' },
            ]}
        />
        </View>

        {/* --- 목록 영역(간격↑) --- */}
        <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
            <View style={styles.card}>
            <View style={styles.cardTop}>
                <Text style={styles.channel}>{item.channel}</Text>
                <Text style={styles.time}>{item.time}</Text>
            </View>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            </View>
        )}
        // 간격은 카드 padding으로 주고, 라인은 카드의 borderBottom으로 통일
        ItemSeparatorComponent={() => null}
        contentContainerStyle={{ paddingBottom: 16 }}
        />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // 탭: 화면 중앙 정렬 + 2등분
  tabs: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  tabBtn: {
    flex: 1,                 // 2등분
    alignItems: 'center',
    paddingVertical: 12,     // 텍스트 주변 여유
  },
  tabText: { fontSize: 16, color: '#98A2B3' },
  tabTextActive: { color: '#101828', fontWeight: '700' },

  // 가로 전체 회색 라인
  tabBaseLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: '#E4E7EC',
  },
  // 활성 탭 검정 언더라인(절반 너비)
  tabActiveBar: {
    position: 'absolute',
    bottom: 0,
    width: '50%',            // 화면의 절반
    height: 2,               // 검정 바 두께
    backgroundColor: '#111111',
    borderRadius: 1,
  },

  // 카드(알림) 간격/라인
  card: {
    paddingHorizontal: 20,
    //paddingVertical: 25,     // ← 간격 키움
    paddingTop:15,
    paddingBottom:30,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E7EC',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  channel: { fontSize: 12, color: '#98A2B3' },
  time: { fontSize: 12, color: '#98A2B3' },
  title: { fontSize: 15, color: '#101828' },
});