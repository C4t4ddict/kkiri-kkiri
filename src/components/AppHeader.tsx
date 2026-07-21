import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import colors from '../config/colors';

type Props = {
  actions?: ReactNode;
  lowered?: boolean;
};

export default function AppHeader({ actions, lowered = true }: Props) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  return (
    <View style={[styles.header, lowered && styles.headerLowered]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="홈으로 이동"
        hitSlop={10}
        onPress={() => navigation.navigate('홈')}
        style={({ pressed }) => [styles.brandButton, pressed && styles.brandPressed]}
      >
        <Text style={styles.brand}>끼리끼리</Text>
      </Pressable>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  headerLowered: {
    paddingTop: 23,
  },
  brandButton: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  brandPressed: {
    opacity: 0.65,
  },
  brand: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  actions: {
    minWidth: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
