import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../config/colors';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  minDate?: string;
  onClose: () => void;
  onSelect: (date: string) => void;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const toDate = (value?: string) => {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateString = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export default function MiniCalendarModal({
  visible,
  title,
  value,
  minDate,
  onClose,
  onSelect,
}: Props) {
  const [monthDate, setMonthDate] = useState(() => {
    const selected = toDate(value);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });

  useEffect(() => {
    if (!visible) return;
    const selected = toDate(value || minDate);
    setMonthDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [minDate, value, visible]);

  const dates = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1;
      return day > 0 && day <= lastDate ? new Date(year, month, day) : null;
    });
  }, [monthDate]);

  const minimum = minDate ? toDate(minDate) : null;
  minimum?.setHours(0, 0, 0, 0);

  const shiftMonth = (amount: number) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.selectedDate}>{value || '날짜를 선택해주세요'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={20} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthButton}>
              <Icon name="chevron-back" size={20} color={colors.textMain} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {monthDate.getFullYear()}년 {monthDate.getMonth() + 1}월
            </Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthButton}>
              <Icon name="chevron-forward" size={20} color={colors.textMain} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((weekday, index) => (
              <Text
                key={weekday}
                style={[
                  styles.weekday,
                  index === 0 && styles.sunday,
                  index === 6 && styles.saturday,
                ]}
              >
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.dateGrid}>
            {dates.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} style={styles.dateCell} />;
              const dateString = toDateString(date);
              const selected = dateString === value;
              const disabled = Boolean(minimum && date.getTime() < minimum.getTime());
              return (
                <TouchableOpacity
                  key={dateString}
                  style={[styles.dateCell, selected && styles.selectedCell]}
                  disabled={disabled}
                  onPress={() => onSelect(dateString)}
                >
                  <Text
                    style={[
                      styles.dateText,
                      selected && styles.selectedText,
                      disabled && styles.disabledText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 40, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: { color: colors.textMain, fontSize: 18, fontWeight: '800' },
  selectedDate: { marginTop: 5, color: colors.primary, fontSize: 13, fontWeight: '700' },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
  monthRow: {
    marginTop: 18,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  monthLabel: { color: colors.textMain, fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekday: {
    width: '14.285%',
    paddingBottom: 8,
    color: colors.textSub,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  sunday: { color: '#E25555' },
  saturday: { color: '#5275C9' },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dateCell: {
    width: '14.285%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCell: { backgroundColor: colors.primary },
  dateText: { color: colors.textMain, fontSize: 13, fontWeight: '600' },
  selectedText: { color: '#FFFFFF', fontWeight: '800' },
  disabledText: { color: '#D0D5DD' },
});
