import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import HomeScreen from '../screens/HomeScreen';
import InfoScreen from '../screens/Info/InfoScreen';
import ActivityScreen from '../screens/ActivityScreen';
import MatchingScreen from '../screens/MatchingScreen';
import MyPageScreen from '../screens/MyPageScreen';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';
import {
  getTutorialPendingStorageKey,
  getTutorialStorageKey,
  shouldShowTutorial,
  TUTORIAL_STEPS,
} from '../onboarding/tutorial';

const Tab = createBottomTabNavigator();

const TAB_META: Record<string, { icon: string }> = {
  홈: { icon: 'home-outline' },
  정보: { icon: 'book-outline' },
  활동: { icon: 'pencil-outline' },
  매칭: { icon: 'school-outline' },
  마이페이지: { icon: 'person-outline' },
};

function TutorialTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useAuth();
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = TUTORIAL_STEPS[stepIndex];

  useEffect(() => {
    let active = true;
    setTutorialVisible(false);
    setStepIndex(0);
    if (!user?.id)
      return () => {
        active = false;
      };

    Promise.all([
      AsyncStorage.getItem(getTutorialStorageKey(user.id)),
      AsyncStorage.getItem(getTutorialPendingStorageKey(user.id)),
    ])
      .then(([completed, pending]) => {
        if (!active || !shouldShowTutorial(completed, pending)) return;
        navigation.navigate(TUTORIAL_STEPS[0].tab);
        setTutorialVisible(true);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [navigation, user?.id]);

  const moveToStep = (nextIndex: number) => {
    const nextStep = TUTORIAL_STEPS[nextIndex];
    if (!nextStep) return;
    navigation.navigate(nextStep.tab);
    setStepIndex(nextIndex);
  };

  const finishTutorial = async () => {
    setTutorialVisible(false);
    if (user?.id) {
      await Promise.all([
        AsyncStorage.setItem(getTutorialStorageKey(user.id), 'completed'),
        AsyncStorage.removeItem(getTutorialPendingStorageKey(user.id)),
      ]).catch(() => undefined);
    }
  };

  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key].options;
          const isFocused = state.index === index;
          const meta = TAB_META[route.name] || TAB_META.홈;
          const color = isFocused ? colors.primary : colors.textMain;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented)
              navigation.navigate(route.name);
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={
                options.tabBarAccessibilityLabel || `${route.name} 탭`
              }
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
            >
              <Ionicons name={meta.icon} size={25} color={color} />
              <Text style={[styles.tabLabel, { color }]}>{route.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={tutorialVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={finishTutorial}
      >
        <View style={styles.tutorialBackdrop} accessibilityViewIsModal>
          <View style={styles.tutorialCard}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.tutorialContent}
            >
              <View style={styles.tutorialTopRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>
                    {stepIndex + 1} / {TUTORIAL_STEPS.length}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="튜토리얼 건너뛰기"
                  onPress={finishTutorial}
                >
                  <Text style={styles.skipText}>건너뛰기</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.tutorialIcon}>
                <Ionicons
                  name={currentStep.icon}
                  size={28}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.eyebrow}>{currentStep.eyebrow}</Text>
              <Text style={styles.tutorialTitle}>{currentStep.title}</Text>
              <Text style={styles.tutorialDescription}>
                {currentStep.description}
              </Text>

              <View style={styles.pointList}>
                {currentStep.points.map(point => (
                  <View key={point} style={styles.pointRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.primary}
                    />
                    <Text style={styles.pointText}>{point}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.currentTabPill}>
                <Ionicons
                  name={currentStep.icon}
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.currentTabText}>
                  지금 보고 있는 곳 · {currentStep.tab}
                </Text>
              </View>

              <View style={styles.progressRow}>
                {TUTORIAL_STEPS.map((step, index) => (
                  <View
                    key={step.tab}
                    style={[
                      styles.progressDot,
                      index === stepIndex && styles.progressDotActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={stepIndex === 0}
                  onPress={() => moveToStep(stepIndex - 1)}
                  style={[
                    styles.previousButton,
                    stepIndex === 0 && styles.previousButtonDisabled,
                  ]}
                >
                  <Text style={styles.previousText}>이전</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() =>
                    isLastStep ? finishTutorial() : moveToStep(stepIndex + 1)
                  }
                  style={styles.nextButton}
                >
                  <Text style={styles.nextText}>
                    {isLastStep ? '시작하기' : '다음'}
                  </Text>
                  <Ionicons
                    name={isLastStep ? 'checkmark' : 'arrow-forward'}
                    size={18}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const renderTutorialTabBar = (props: BottomTabBarProps) => (
  <TutorialTabBar {...props} />
);

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="홈"
      tabBar={renderTutorialTabBar}
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
    >
      <Tab.Screen name="홈" component={HomeScreen} />
      <Tab.Screen name="정보" component={InfoScreen} />
      <Tab.Screen name="활동" component={ActivityScreen} />
      <Tab.Screen name="매칭" component={MatchingScreen} />
      <Tab.Screen name="마이페이지" component={MyPageScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 90 : 70,
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 5,
  },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  tutorialBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 26 : 16,
    backgroundColor: 'rgba(16, 24, 40, 0.62)',
  },
  tutorialCard: {
    maxHeight: '92%',
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 18,
  },
  tutorialContent: { padding: 22 },
  tutorialTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySurface,
  },
  stepBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  skipText: { color: colors.textSub, fontSize: 13, fontWeight: '700' },
  tutorialIcon: {
    width: 54,
    height: 54,
    marginTop: 20,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  eyebrow: {
    marginTop: 18,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  tutorialTitle: {
    marginTop: 6,
    color: colors.textMain,
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '900',
  },
  tutorialDescription: {
    marginTop: 9,
    color: colors.textSub,
    fontSize: 14,
    lineHeight: 21,
  },
  pointList: { gap: 9, marginTop: 18 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pointText: {
    flex: 1,
    color: colors.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  currentTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primarySurface,
  },
  currentTabText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginTop: 22,
  },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D0D5DD',
  },
  progressDotActive: { width: 22, backgroundColor: colors.primary },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  previousButton: {
    width: 88,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F4F7',
  },
  previousButtonDisabled: { opacity: 0 },
  previousText: { color: colors.textSub, fontSize: 14, fontWeight: '800' },
  nextButton: {
    flex: 1,
    height: 50,
    flexDirection: 'row',
    gap: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  nextText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
