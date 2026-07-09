// src/navigation/BottomTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import InfoScreen from '../screens/Info/InfoScreen';
import TodoScreen from '../TodoScreen';
import MatchingScreen from '../MatchingScreen';
import MyPage1 from '../screens/mypage1';
import { Text, Platform, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext'; // ✅ 전역 user
import { useNavigation } from '@react-navigation/native';


const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  const { user, setUser } = useAuth();
  const navigation = useNavigation<any>();

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
        tabBarActiveTintColor: '#7A5AF8',
        tabBarInactiveTintColor: '#000',
        tabBarLabelStyle: { fontSize: 12 },
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          height: Platform.OS === 'ios' ? 90 : 70,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 8,
          paddingBottom: Platform.OS === 'ios' ? 20 : 0,
        },
        tabBarIconStyle: {
          marginTop: 5,
        },
        tabBarLabel: ({ focused, color }) => (
          <Text style={{ color, fontSize: 12, marginBottom: Platform.OS === 'ios' ? 0 : 5 }}>
            {route.name}
          </Text>
        ),
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen name="홈" component={HomeScreen} />
      <Tab.Screen name="정보" component={InfoScreen} />
      <Tab.Screen name="활동" component={TodoScreen} />
      <Tab.Screen name="매칭" component={MatchingScreen} />
      <Tab.Screen name="마이페이지">
        {() =>
          user ? (
            <MyPage1
              user={user as any}
              onLogout={() => {
                setUser(null);
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              }}
              onUpdateUser={updatedUser => setUser(updatedUser as any)}
              onNavigateToSetting={() => navigation.navigate('Setting', { user })}
              onNavigateToEvaluation={() => navigation.navigate('MyPage4', { user })}
              onNavigateToTeamEvaluation={() => navigation.navigate('MyPage2', { user })}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text>로그인이 필요합니다.</Text>
            </View>
          )
        }
      </Tab.Screen>
    </Tab.Navigator>
  );
}
