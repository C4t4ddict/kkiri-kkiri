import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList, User } from '../types';
import AppRefreshControl from '../components/AppRefreshControl';
import colors from '../config/colors';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ImageAsset = {
  uri: string;
  type?: string;
  fileName?: string;
};

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const getCorrectImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return null;
  const uploadPath = imageUrl.match(/\/uploads\/[^?#]+/)?.[0];
  return uploadPath ? `${API_BASE_URL}${uploadPath}` : imageUrl;
};

const normalizeUser = (raw: any): User => ({
  id: raw.id ?? raw.user_id,
  email: raw.email,
  name: raw.name,
  department: raw.department ?? '',
  studentId: raw.studentId ?? raw.student_number ?? '',
  birth: raw.birth ?? raw.birth_date ?? '',
  profile_picture: raw.profile_picture ?? undefined,
  is_admin: Boolean(raw.is_admin),
});

export default function MyPageScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, setUser } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUserData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/${user.id}`, {
        headers: { 'x-user-id': String(user.id) },
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.user) {
        throw new Error(data.message || '사용자 정보를 불러오지 못했습니다.');
      }
      const nextUser = { ...normalizeUser(data.user), authToken: user.authToken };
      setUser(nextUser);
      setProfileImage(getCorrectImageUrl(nextUser.profile_picture));
    } catch (error) {
      console.error('사용자 정보 조회 오류:', error);
    }
  }, [setUser, user?.authToken, user?.id]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  useEffect(() => {
    setProfileImage(getCorrectImageUrl(user?.profile_picture));
  }, [user?.profile_picture]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchUserData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchUserData]);

  const uploadProfilePicture = async (image: ImageAsset) => {
    if (!user?.id) return;
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: image.uri,
        type: image.type || 'image/jpeg',
        name: image.fileName || `profile-${user.id}-${Date.now()}.jpg`,
      } as any);

      const response = await fetch(`${API_BASE_URL}/api/upload/profile/${user.id}`, {
        method: 'POST',
        headers: { 'x-user-id': String(user.id) },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || '프로필 사진을 변경하지 못했습니다.');
      }
      await fetchUserData();
    } catch (error) {
      Alert.alert('변경 실패', error instanceof Error ? error.message : '서버 오류가 발생했습니다.');
    }
  };

  const resetProfilePicture = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ profile_picture: null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || '기본 이미지로 변경하지 못했습니다.');
      }
      await fetchUserData();
    } catch (error) {
      Alert.alert('변경 실패', error instanceof Error ? error.message : '서버 오류가 발생했습니다.');
    }
  };

  const handleImagePicker = () => {
    Alert.alert('프로필 사진 변경', '변경 방법을 선택해주세요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '갤러리에서 선택',
        onPress: () => launchImageLibrary(
          { mediaType: 'photo', quality: 0.8, maxWidth: 800, maxHeight: 800, selectionLimit: 1 },
          async (response: ImagePickerResponse) => {
            const image = response.assets?.[0];
            if (response.errorCode) {
              Alert.alert('오류', '갤러리를 열 수 없습니다.');
            } else if (image?.uri) {
              await uploadProfilePicture({ uri: image.uri, type: image.type, fileName: image.fileName });
            }
          }
        ),
      },
      { text: '기본 이미지로 변경', onPress: resetProfilePicture },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => {
          setUser(null);
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
        },
      },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}><Text style={styles.loadingText}>로그인이 필요합니다</Text></View>
      </SafeAreaView>
    );
  }

  const menuItems = [
    {
      label: '나의 평가',
      image: require('../assets/eval.png'),
      onPress: () => navigation.navigate('MyPage4', { user }),
    },
    {
      label: '팀원평가',
      image: require('../assets/team.png'),
      onPress: () => navigation.navigate('MyPage2', { user }),
    },
    {
      label: '설정',
      image: require('../assets/settings.png'),
      onPress: () => navigation.navigate('Settings', { user }),
    },
    {
      label: '관심 활동',
      icon: 'heart-outline',
      onPress: () => navigation.navigate('FavoriteActivities'),
    },
    {
      label: '나의 모집',
      icon: 'megaphone-outline',
      onPress: () => navigation.navigate('MyRecruitments'),
    },
    {
      label: '나의 지원',
      icon: 'paper-plane-outline',
      onPress: () => navigation.navigate('MyApplications'),
    },
    ...(user.is_admin ? [{
      label: '운영 관리',
      icon: 'shield-checkmark-outline',
      onPress: () => navigation.navigate('AdminScreen'),
    }] : []),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} onError={() => setProfileImage(null)} />
            ) : (
              <View style={styles.defaultAvatar}><Icon name="person" size={62} color="#98A2B3" /></View>
            )}
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.userName}>{user.name}</Text>
            <TouchableOpacity style={styles.imageEditButton} onPress={handleImagePicker}>
              <Image source={require('../assets/pencil-01.png')} style={styles.pencilIcon} />
            </TouchableOpacity>
          </View>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>

        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <TouchableOpacity key={item.label} style={styles.menuCard} onPress={item.onPress} activeOpacity={0.72}>
              <View style={styles.menuIconContainer}>
                {item.image ? (
                  <Image source={item.image} style={styles.menuIcon} />
                ) : (
                  <Icon name={item.icon || 'ellipse-outline'} size={27} color={colors.primary} />
                )}
              </View>
              <Text style={styles.menuText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.logoutButtonWrapper}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 36 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: colors.textSub },
  profileSection: { alignItems: 'center', paddingTop: 28, paddingBottom: 25 },
  profileImageContainer: {
    width: 124,
    height: 124,
    marginBottom: 11,
    borderRadius: 62,
    overflow: 'hidden',
    backgroundColor: colors.inputBackground,
  },
  profileImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  defaultAvatar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nameContainer: { flexDirection: 'row', alignItems: 'center' },
  userName: { color: colors.textMain, fontSize: 21, fontWeight: '800' },
  userEmail: { marginTop: 5, color: colors.textSub, fontSize: 13 },
  imageEditButton: { padding: 6 },
  pencilIcon: { width: 17, height: 17, resizeMode: 'contain' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 10 },
  menuCard: {
    width: '31%',
    minHeight: 105,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFF',
  },
  menuIconContainer: {
    width: 46,
    height: 46,
    marginBottom: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  menuIcon: { width: 25, height: 25, resizeMode: 'contain' },
  menuText: { color: '#344054', fontSize: 13, fontWeight: '700' },
  logoutButtonWrapper: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 14 },
  logoutButton: { paddingVertical: 10, paddingHorizontal: 4 },
  logoutText: { color: '#98A2B3', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
