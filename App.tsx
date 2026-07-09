import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider } from './src/context/AuthContext';

import LoginScreen from './src/screens/LoginScreen0'; // ✅ LoginScreen0 사용
import RegisterScreen from './src/screens/RegisterScreen';
import colors from './src/config/colors';

import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import InfoDetailScreen from './src/screens/Info/InfoDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EvaluationScreen from './src/screens/EvaluationScreen';
import TeamFindScreen from './src/screens/TeamFindScreen';
import NotificationScreen from './src/screens/NotificationScreen';

// ✅ 범수 프로젝트 필수 스크린
import HomeScreen from './src/screens/HomeScreen';

// ✅ MyPage 관련 스크린들 추가 - default as 별칭 사용  
import { default as MyPage1 } from './src/screens/mypage1';
import { default as MyPage2 } from './src/screens/mypage2';
import { default as MyPage3 } from './src/screens/mypage3';
import { default as MyPage4 } from './src/screens/mypage4';
import { default as Setting } from './src/screens/setting';

// ✅ User 타입 정의 - mypage 파일들과 동일하게 맞춤
interface User {
  user_id: number;
  email: string;
  name: string;
  department?: string;
  student_number?: string;
  birth_date?: string;
  profile_picture?: string;
}

const Stack = createStackNavigator();

// ✅ 선택된 팀원 인터페이스
interface SelectedMember {
  id: number;
  name: string;
  department: string;
  activity_id: number;
  activity_title: string;
}

// ✅ MyPage 네비게이션 상태 관리를 위한 컨텍스트
let myPageNavigation: {
  currentPage: 'mypage1' | 'mypage2' | 'mypage3' | 'mypage4' | 'setting';
  selectedMember: SelectedMember | null;
  setCurrentPage: (page: 'mypage1' | 'mypage2' | 'mypage3' | 'mypage4' | 'setting') => void;
  setSelectedMember: (member: SelectedMember | null) => void;
} = {
  currentPage: 'mypage1',
  selectedMember: null,
  setCurrentPage: () => {},
  setSelectedMember: () => {}
};

export default function App() {
  // ✅ MyPage 네비게이션 상태
  const [myPageCurrentPage, setMyPageCurrentPage] = useState<'mypage1' | 'mypage2' | 'mypage3' | 'mypage4' | 'setting'>('mypage1');
  const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null);

  // ✅ MyPage 네비게이션 객체 업데이트
  myPageNavigation = {
    currentPage: myPageCurrentPage,
    selectedMember: selectedMember,
    setCurrentPage: setMyPageCurrentPage,
    setSelectedMember: setSelectedMember
  };

  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: true,
            headerTintColor: colors.inputText,
            headerShadowVisible: false,
            headerTitleAlign: 'center',
          }}
        >
          {/* ✅ 로그인 화면 - 앱 시작점 */}
          <Stack.Screen 
            name="Login" 
            component={LoginScreen} 
            options={{ headerShown: false }} 
          />
          
          {/* ✅ 회원가입 화면 */}
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{
              title: '회원가입',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          />
          
          {/* ✅ 로그인 후 메인 홈 화면 */}
          <Stack.Screen
            name="HomeScreen"
            component={HomeScreen}
            options={{
              title: '끼리끼리',
              headerShown: false, // 헤더 숨김 - HomeScreen에서 자체 헤더 사용
            }}
          />
          
          {/* ✅ 기존 React Native 스크린들 */}
          <Stack.Screen
            name="MainTabs"
            component={BottomTabNavigator}
            options={{ headerShown: false }}
          />
          
          {/* ✅ MyPage 관련 스크린들 */}
          <Stack.Screen
            name="MyPage1"
            options={{
              title: '마이페이지',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          >
            {(props: any) => {
              const user = props.route.params?.user;
              return (
                <MyPage1
                  user={user}
                  onLogout={() => {
                    setMyPageCurrentPage('mypage1');
                    setSelectedMember(null);
                    props.navigation.navigate('Login');
                  }}
                  onUpdateUser={(updatedUser: User) => {
                    // 사용자 정보 업데이트 로직
                    console.log('사용자 정보 업데이트:', updatedUser);
                  }}
                  onNavigateToSetting={() => {
                    props.navigation.navigate('Setting', { user });
                  }}
                  onNavigateToEvaluation={() => {
                    props.navigation.navigate('MyPage4', { user });
                  }}
                  onNavigateToTeamEvaluation={() => {
                    props.navigation.navigate('MyPage2', { user });
                  }}
                />
              );
            }}
          </Stack.Screen>

          <Stack.Screen
            name="MyPage2"
            options={{
              title: '팀원평가',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          >
            {(props: any) => {
              const user = props.route.params?.user;
              return (
                <MyPage2
                  user={user}
                  onBack={() => {
                    props.navigation.goBack();
                  }}
                  onNavigateToEvaluation={(member: SelectedMember) => {
                    props.navigation.navigate('MyPage3', { 
                      user,
                      selectedMember: member 
                    });
                  }}
                />
              );
            }}
          </Stack.Screen>

          <Stack.Screen
            name="MyPage3"
            options={{
              title: '팀원평가',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          >
            {(props: any) => {
              const user = props.route.params?.user;
              const selectedMember = props.route.params?.selectedMember;
              return (
                <MyPage3
                  user={user}
                  selectedMember={selectedMember}
                  onBack={() => {
                    props.navigation.goBack();
                  }}
                  onEvaluationComplete={() => {
                    props.navigation.navigate('MyPage1', { user });
                  }}
                />
              );
            }}
          </Stack.Screen>

          <Stack.Screen
            name="MyPage4"
            options={{
              title: '나의 평가',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          >
            {(props: any) => {
              const user = props.route.params?.user;
              return (
                <MyPage4
                  user={user}
                  onBack={() => {
                    props.navigation.goBack();
                  }}
                />
              );
            }}
          </Stack.Screen>

          <Stack.Screen
            name="Setting"
            options={{
              title: '설정',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          >
            {(props: any) => {
              const user = props.route.params?.user;
              return (
                <Setting
                  user={user}
                  onLogout={() => {
                    setMyPageCurrentPage('mypage1');
                    setSelectedMember(null);
                    props.navigation.navigate('Login');
                  }}
                  onGoBack={() => {
                    props.navigation.goBack();
                  }}
                />
              );
            }}
          </Stack.Screen>
          
          <Stack.Screen
            name="InfoDetail"
            component={InfoDetailScreen}
            options={{
              title: '비교과 활동',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          />
          
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              title: '설정',
              headerTitleAlign: 'center',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
              headerTitleStyle: {
                width: '100%',
                textAlign: 'center',
              }
            }}
          />
          
          <Stack.Screen 
            name="Evaluation" 
            component={EvaluationScreen}
            options={{
              title: '평가',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          />
          
          <Stack.Screen 
            name="TeamFind" 
            component={TeamFindScreen}
            options={{
              title: '팀 찾기',
              headerBackTitle: '',
              headerLeftContainerStyle: {
                paddingLeft: 10,
              },
            }}
          />
          
          <Stack.Screen
            name="Notifications"
            component={NotificationScreen}
            options={{
              title: '알림',
              headerBackTitle: '',
              headerTitleAlign: 'center',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}

// ✅ 타입 정의
export type RootStackParamList = {
  // ✅ 인증 관련 스크린
  Login: undefined;
  Register: undefined;
  
  // ✅ 메인 스크린
  HomeScreen: { user: User };
  
  // ✅ 기존 React Native 스크린들
  MainTabs: { screen?: string; params?: any };
  InfoDetail: { id?: number };
  Settings: { user: User };
  Evaluation: undefined;
  TeamFind: undefined;
  Notifications: undefined;
  
  // ✅ MyPage 관련 스크린들
  MyPage1: { user: User };
  MyPage2: { user: User };
  MyPage3: { 
    user: User; 
    selectedMember: {
      id: number;
      name: string;
      department: string;
      activity_id: number;
      activity_title: string;
    }
  };
  MyPage4: { user: User };
  Setting: { user: User };
};

// BottomTab 네비게이터 ParamList
export type BottomTabParamList = {
  Home: undefined;
  Info: undefined;
  Activity: undefined;
  Matching: undefined;
  MyPage: undefined;
};