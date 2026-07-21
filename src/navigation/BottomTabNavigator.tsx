// src/navigation/BottomTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import InfoScreen from '../screens/Info/InfoScreen';
import ActivityScreen from '../screens/ActivityScreen';
import MatchingScreen from '../screens/MatchingScreen';
import MyPageScreen from '../screens/MyPageScreen';
import { Text, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '../config/colors';

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
    initialRouteName="홈"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home-outline';
           switch (route.name) {
            case '홈': iconName = 'home-outline'; break;
            case '정보': iconName = 'book-outline'; break;
            case '활동': iconName = 'pencil-outline'; break;
            case '매칭': iconName = 'school-outline'; break;
            case '마이페이지': iconName = 'person-outline'; break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMain,
        tabBarLabelStyle: { fontSize: 12 },
        headerShown: false,
        tabBarStyle: {
          left: 0, // 좌우 여백 없이 화면 전체 너비 사용
          right: 0, // 좌우 여백 없이 화면 전체 너비 사용
          borderTopLeftRadius: 20, // 왼쪽 위 모서리만 둥글게
          borderTopRightRadius: 20, // 오른쪽 위 모서리만 둥글게
          borderRadius: 0, // 기존 borderRadius 제거 (혹시 모르니)
          height: Platform.OS === 'ios' ? 90 : 70, // iOS는 바닥바를 포함하여 높이 조절
          backgroundColor: '#fff',
          // 그림자 효과 조정
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -5 }, // 그림자를 위쪽으로 살짝 이동하여 전체적인 느낌을 줍니다.
          shadowOpacity: 0.1, // 그림자 투명도 낮춤
          shadowRadius: 5, // 그림자 번짐 정도 높임
          elevation: 8, // 안드로이드 그림자 강도 높임
          paddingBottom: Platform.OS === 'ios' ? 20 : 0, // iOS 안전 영역 고려 패딩 추가
        },
        tabBarIconStyle: {
          marginTop: 5, // 아이콘 위쪽에 5px 여백 추가 (원하는 값으로 조절)
        },
        tabBarLabel: ({ color }) => (
          <Text style={{ color, fontSize: 12, fontWeight: '700', marginBottom: Platform.OS === 'ios' ? 0 : 5 }}>
            {route.name}
          </Text>
        ),
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen name="홈" component={HomeScreen} />
      <Tab.Screen name="정보" component={InfoScreen} />
      <Tab.Screen name="활동" component={ActivityScreen} />
      <Tab.Screen name="매칭" component={MatchingScreen} />
      <Tab.Screen name="마이페이지" component={MyPageScreen} />
    </Tab.Navigator>
  );
}
