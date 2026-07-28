import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../config/colors';

type Props = {
  kind: 'loading' | 'error' | 'empty';
  title?: string;
  description?: string;
  onRetry?: () => void;
};

const defaults = {
  loading: ['불러오는 중이에요', '잠시만 기다려주세요.'],
  error: ['정보를 불러오지 못했어요', '네트워크 연결을 확인하고 다시 시도해주세요.'],
  empty: ['표시할 내용이 없어요', '새로운 내용이 등록되면 이곳에 표시됩니다.'],
};

export default function ScreenState({ kind, title, description, onRetry }: Props) {
  return (
    <View style={styles.container} accessibilityRole={kind === 'loading' ? 'progressbar' : 'summary'}>
      {kind === 'loading' ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={styles.iconCircle}>
          <Icon name={kind === 'error' ? 'cloud-offline-outline' : 'file-tray-outline'} size={26} color={colors.primary} />
        </View>
      )}
      <Text style={styles.title}>{title || defaults[kind][0]}</Text>
      <Text style={styles.description}>{description || defaults[kind][1]}</Text>
      {kind === 'error' && onRetry ? (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 220, padding: 28, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 14, color: '#101828', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  description: { marginTop: 6, color: '#667085', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
