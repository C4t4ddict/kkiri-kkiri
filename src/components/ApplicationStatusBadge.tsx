import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getApplicationStatus } from '../utils/activityApplicationStatus';

type Props = {
  start?: string | null;
  end?: string | null;
};

export default function ApplicationStatusBadge({ start, end }: Props) {
  const status = getApplicationStatus(start, end);
  return (
    <View style={[styles.badge, styles[status.tone]]}>
      <Text style={[styles.label, styles[`${status.tone}Text`]]}>{status.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
  },
  open: { backgroundColor: '#F0FDF4' },
  scheduled: { backgroundColor: '#F4F0FF' },
  closed: { backgroundColor: '#F2F4F7' },
  openText: { color: '#15803D' },
  scheduledText: { color: '#6941C6' },
  closedText: { color: '#667085' },
});
