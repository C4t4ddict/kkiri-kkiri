import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { RootStackParamList } from '../types';
import { WidgetPref, WidgetId, DEFAULT_WIDGET_PREFS } from '../constants/widgets';
import { loadWidgetPrefs, saveWidgetPrefs, toggleVisible } from '../utils/widgetPrefs';
import colors from '../config/colors';

type ActivitySettingRoute = RouteProp<RootStackParamList, 'ActivitySettingScreen'>;

type WidgetMeta = {
  title: string;
  description: string;
  icon: string;
};

type DraggableWidgetRowProps = {
  item: WidgetPref;
  index: number;
  total: number;
  onToggle: (id: WidgetId) => void;
  onDrop: (id: WidgetId, targetIndex: number) => void;
};

const ROW_HEIGHT = 92;

const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  ring: {
    title: '링그래프',
    description: '전체 목표 진행률을 한눈에 확인해요',
    icon: 'stats-chart-outline',
  },
  issue: {
    title: '이슈트래커',
    description: '오늘 진행할 팀 목표를 상태별로 보여줘요',
    icon: 'checkmark-done-outline',
  },
  notice: {
    title: '공지사항',
    description: '팀 공지와 새 댓글을 빠르게 확인해요',
    icon: 'megaphone-outline',
  },
  calendar: {
    title: '캘린더',
    description: '활동 일정을 달력으로 정리해요',
    icon: 'calendar-outline',
  },
  heatmap: {
    title: '히트맵',
    description: '월별 활동 빈도를 색상으로 확인해요',
    icon: 'grid-outline',
  },
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeOrder(items: WidgetPref[]) {
  return items.map((item, index) => ({ ...item, order: (index + 1) * 10 }));
}

function DraggableWidgetRow({
  item,
  index,
  total,
  onToggle,
  onDrop,
}: DraggableWidgetRowProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const itemId = item.id;

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        translateY.stopAnimation();
        translateY.setValue(0);
        setDragging(true);
      },
      onPanResponderMove: Animated.event([null, { dy: translateY }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        const offset = Math.round(gestureState.dy / ROW_HEIGHT);
        const targetIndex = clamp(index + offset, 0, total - 1);
        const settledOffset = gestureState.dy - ((targetIndex - index) * ROW_HEIGHT);

        translateY.setValue(settledOffset);
        onDrop(itemId, targetIndex);
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 190,
          mass: 0.8,
          useNativeDriver: true,
        }).start(() => setDragging(false));
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 190,
          mass: 0.8,
          useNativeDriver: true,
        }).start(() => setDragging(false));
      },
    }),
    [index, itemId, onDrop, total, translateY],
  );

  const meta = WIDGET_META[item.id];

  return (
    <Animated.View
      style={[
        styles.widgetCard,
        dragging && styles.widgetCardDragging,
        { transform: [{ translateY }] },
      ]}
    >
      <View style={styles.widgetIconBox}>
        <Icon name={meta.icon} size={21} color={colors.primary} />
      </View>
      <View style={styles.widgetCopy}>
        <Text style={styles.widgetTitle}>{meta.title}</Text>
        <Text style={styles.widgetDescription} numberOfLines={2}>
          {meta.description}
        </Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`${meta.title} 표시`}
        accessibilityState={{ checked: true }}
        onPress={() => onToggle(item.id)}
        style={({ pressed }) => [styles.visibilityButton, pressed && styles.pressed]}
      >
        <Icon name="eye-outline" size={19} color={colors.primary} />
      </Pressable>
      <Animated.View
        accessibilityRole="adjustable"
        accessibilityLabel={`${meta.title} 위치 이동`}
        style={[styles.dragHandle, dragging && styles.dragHandleActive]}
        {...panResponder.panHandlers}
      >
        <Icon name="reorder-three-outline" size={25} color={dragging ? '#FFFFFF' : colors.textSub} />
      </Animated.View>
    </Animated.View>
  );
}

function HiddenWidgetRow({ item, onToggle }: Pick<DraggableWidgetRowProps, 'item' | 'onToggle'>) {
  const meta = WIDGET_META[item.id];

  return (
    <View style={[styles.widgetCard, styles.hiddenCard]}>
      <View style={[styles.widgetIconBox, styles.hiddenIconBox]}>
        <Icon name={meta.icon} size={21} color={colors.textSub} />
      </View>
      <View style={styles.widgetCopy}>
        <Text style={styles.widgetTitle}>{meta.title}</Text>
        <Text style={styles.widgetDescription} numberOfLines={1}>{meta.description}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${meta.title} 보이기`}
        onPress={() => onToggle(item.id)}
        style={({ pressed }) => [styles.showButton, pressed && styles.pressed]}
      >
        <Icon name="add" size={17} color={colors.primary} />
        <Text style={styles.showButtonText}>보이기</Text>
      </Pressable>
    </View>
  );
}

export default function ActivitySettingScreen() {
  const navigation = useNavigation();
  const route = useRoute<ActivitySettingRoute>();
  const teamId = route.params?.teamId ?? null;
  const [prefs, setPrefs] = useState<WidgetPref[]>(DEFAULT_WIDGET_PREFS);

  const visible = useMemo(
    () => prefs.filter(pref => pref.visible).sort((a, b) => a.order - b.order),
    [prefs],
  );
  const hidden = useMemo(
    () => prefs.filter(pref => !pref.visible).sort((a, b) => a.order - b.order),
    [prefs],
  );

  useEffect(() => {
    loadWidgetPrefs(teamId).then(setPrefs);
  }, [teamId]);

  const onToggle = (id: WidgetId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPrefs(current => {
      const toggled = toggleVisible(current, id);
      const nextVisible = toggled.filter(pref => pref.visible).sort((a, b) => a.order - b.order);
      const nextHidden = toggled.filter(pref => !pref.visible).sort((a, b) => a.order - b.order);
      return normalizeOrder([...nextVisible, ...nextHidden]);
    });
  };

  const onDrop = (id: WidgetId, targetIndex: number) => {
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setPrefs(current => {
      const currentVisible = current
        .filter(pref => pref.visible)
        .sort((a, b) => a.order - b.order);
      const fromIndex = currentVisible.findIndex(pref => pref.id === id);
      if (fromIndex < 0 || fromIndex === targetIndex) return current;

      const nextVisible = [...currentVisible];
      const [moved] = nextVisible.splice(fromIndex, 1);
      nextVisible.splice(targetIndex, 0, moved);
      const currentHidden = current
        .filter(pref => !pref.visible)
        .sort((a, b) => a.order - b.order);
      return normalizeOrder([...nextVisible, ...currentHidden]);
    });
  };

  const onSave = async () => {
    await saveWidgetPrefs(prefs, teamId);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Icon name="options-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>활동 위젯 편집</Text>
            <Text style={styles.introDescription}>
              위치 이동 버튼을 길게 누른 채 드래그해 원하는 순서로 배치하세요.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>사용 중인 위젯</Text>
          <Text style={styles.sectionCount}>{visible.length}개</Text>
        </View>
        <View style={styles.listGap}>
          {visible.length === 0 ? (
            <Text style={styles.empty}>표시 중인 위젯이 없습니다.</Text>
          ) : visible.map((item, index) => (
            <DraggableWidgetRow
              key={item.id}
              item={item}
              index={index}
              total={visible.length}
              onToggle={onToggle}
              onDrop={onDrop}
            />
          ))}
        </View>

        <View style={[styles.sectionHeader, styles.hiddenSectionHeader]}>
          <Text style={styles.sectionTitle}>숨긴 위젯</Text>
          <Text style={styles.sectionCount}>{hidden.length}개</Text>
        </View>
        <View style={styles.listGap}>
          {hidden.length === 0 ? (
            <Text style={styles.empty}>숨긴 위젯이 없습니다.</Text>
          ) : hidden.map(item => (
            <HiddenWidgetRow key={item.id} item={item} onToggle={onToggle} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={onSave}
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
        >
          <Text style={styles.saveButtonText}>변경사항 저장</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FC',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 120,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E3FF',
    borderRadius: 18,
    backgroundColor: colors.primarySurface,
  },
  introIcon: {
    width: 44,
    height: 44,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  introCopy: {
    flex: 1,
  },
  introTitle: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '800',
  },
  introDescription: {
    marginTop: 4,
    color: colors.textSub,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
  },
  hiddenSectionHeader: {
    marginTop: 28,
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionCount: {
    color: colors.textSub,
    fontSize: 12,
    fontWeight: '700',
  },
  listGap: {
    gap: 10,
  },
  widgetCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    zIndex: 1,
  },
  widgetCardDragging: {
    borderColor: colors.primaryLight,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 20,
  },
  hiddenCard: {
    opacity: 0.82,
    backgroundColor: '#FCFCFD',
    shadowOpacity: 0,
    elevation: 0,
  },
  widgetIconBox: {
    width: 42,
    height: 42,
    marginRight: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.primarySurface,
  },
  hiddenIconBox: {
    backgroundColor: '#F2F4F7',
  },
  widgetCopy: {
    flex: 1,
    paddingRight: 8,
  },
  widgetTitle: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: '800',
  },
  widgetDescription: {
    marginTop: 3,
    color: colors.textSub,
    fontSize: 11,
    lineHeight: 16,
  },
  visibilityButton: {
    width: 38,
    height: 38,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.primarySurface,
  },
  dragHandle: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#F2F4F7',
  },
  dragHandleActive: {
    backgroundColor: colors.primary,
  },
  showButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D9D2FF',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  showButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.58,
  },
  empty: {
    paddingVertical: 18,
    color: colors.textSub,
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  saveButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  saveButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
