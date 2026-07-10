import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import colors from '../config/colors';

type Notice = {
  id: string;
  title: string;
  meta: string;
};

const notices: Notice[] = [
  { id: 'notice-1', title: '공지사항입니다.', meta: '6일 전 | 홍길동' },
  { id: 'notice-2', title: '노트북, 필기구 꼭 챙겨주세요', meta: '6일 전 | 홍길동' },
  { id: 'notice-3', title: '중간고사 기간은 한 주 쉬고 다음주부터 진행합니다.', meta: '6일 전 | 홍길동' },
];

export default function NoticeBoard() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>공지사항</Text>
        <Image source={require('../assets/pencil-01.png')} style={styles.editIcon} resizeMode="contain" />
      </View>
      <View style={styles.list}>
        {notices.map((notice, index) => (
          <View key={notice.id} style={[styles.noticeRow, index < notices.length - 1 && styles.noticeDivider]}>
            <Text style={styles.noticeTitle} numberOfLines={1}>{notice.title}</Text>
            <Text style={styles.noticeMeta}>{notice.meta}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySurface,
    borderRadius: 26,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 30,
    marginBottom: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 42,
  },
  title: {
    fontSize: 17,
    color: colors.textMain,
    fontWeight: '500',
  },
  editIcon: {
    width: 24,
    height: 24,
    marginLeft: 16,
    opacity: 0.65,
  },
  list: {
    gap: 0,
  },
  noticeRow: {
    paddingVertical: 14,
  },
  noticeDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#D8D6E4',
  },
  noticeTitle: {
    color: '#111111',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  noticeMeta: {
    marginTop: 8,
    color: '#98A2B3',
    fontSize: 15,
    fontWeight: '700',
  },
});
