import React, { useCallback, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, ParamListBase, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function NotificationBell() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
        headers: { 'x-user-id': String(user.id) },
      });
      const data = await response.json();
      setUnreadCount(response.ok ? Number(data?.count || 0) : 0);
    } catch {
      setUnreadCount(0);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    loadUnreadCount();
  }, [loadUnreadCount]));

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={unreadCount ? `읽지 않은 알림 ${unreadCount}개` : '알림'}
      activeOpacity={0.7}
      hitSlop={8}
      onPress={() => navigation.navigate('Notifications')}
      style={styles.button}
    >
      <Image source={require('../assets/bell.png')} style={styles.icon} resizeMode="contain" />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { position: 'relative', width: 31, height: 31, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 25, height: 25 },
  badge: {
    position: 'absolute', top: -4, right: -8, minWidth: 17, height: 17, paddingHorizontal: 4,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', lineHeight: 12 },
});
