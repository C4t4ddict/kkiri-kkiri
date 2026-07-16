import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import colors from '../config/colors';

type Props = {
  actions?: ReactNode;
  lowered?: boolean;
};

export default function AppHeader({ actions, lowered = true }: Props) {
  return (
    <View style={[styles.header, lowered && styles.headerLowered]}>
      <Text style={styles.brand}>끼리끼리</Text>
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
