import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
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
import { hasSchoolAccess } from '../utils/accountPolicy';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ImageAsset = {
  uri: string;
  type?: string;
  fileName?: string;
};

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const MENU_ROW_HEIGHT = 62;

type MenuItem = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function DraggableMenuRow({ item, index, total, onDrop }: {
  item: MenuItem;
  index: number;
  total: number;
  onDrop: (key: string, targetIndex: number) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { translateY.setValue(0); setDragging(true); },
    onPanResponderMove: Animated.event([null, { dy: translateY }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      const targetIndex = clamp(index + Math.round(gesture.dy / MENU_ROW_HEIGHT), 0, total - 1);
      onDrop(item.key, targetIndex);
      Animated.spring(translateY, { toValue: 0, damping: 19, stiffness: 180, useNativeDriver: true })
        .start(() => setDragging(false));
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start(() => setDragging(false));
    },
  }), [index, item.key, onDrop, total, translateY]);

  return (
    <Animated.View style={[styles.editRow, dragging && styles.editRowDragging, { transform: [{ translateY }] }]}>
      <View style={styles.editIcon}><Icon name={item.icon} size={19} color={colors.primary} /></View>
      <Text style={styles.editLabel}>{item.label}</Text>
      <Animated.View style={[styles.dragHandle, dragging && styles.dragHandleActive]} {...responder.panHandlers}>
        <Icon name="reorder-three-outline" size={25} color={dragging ? '#FFFFFF' : colors.textSub} />
      </Animated.View>
    </Animated.View>
  );
}

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
  email_verified: Boolean(raw.email_verified),
  emailVerified: Boolean(raw.email_verified ?? raw.emailVerified),
  account_type: raw.account_type ?? raw.accountType ?? 'GENERAL',
  accountType: raw.account_type ?? raw.accountType ?? 'GENERAL',
  school_domain: raw.school_domain ?? raw.schoolDomain ?? null,
  schoolDomain: raw.school_domain ?? raw.schoolDomain ?? null,
  school_name: raw.school_name ?? raw.schoolName ?? null,
  schoolName: raw.school_name ?? raw.schoolName ?? null,
  school_email: raw.school_email ?? raw.schoolEmail ?? null,
  schoolEmail: raw.school_email ?? raw.schoolEmail ?? null,
  school_email_verified: Boolean(raw.school_email_verified ?? raw.schoolEmailVerified),
  schoolEmailVerified: Boolean(raw.school_email_verified ?? raw.schoolEmailVerified),
  school_access_enabled: Boolean(
    raw.school_access_enabled
    ?? raw.schoolAccessEnabled
    ?? ((raw.school_email_verified ?? raw.schoolEmailVerified) && (raw.school_domain ?? raw.schoolDomain)),
  ),
  schoolAccessEnabled: Boolean(
    raw.school_access_enabled
    ?? raw.schoolAccessEnabled
    ?? ((raw.school_email_verified ?? raw.schoolEmailVerified) && (raw.school_domain ?? raw.schoolDomain)),
  ),
  school_verified_at: raw.school_verified_at ?? null,
  friend_code: raw.friend_code ?? raw.friendCode ?? null,
  friendCode: raw.friend_code ?? raw.friendCode ?? null,
});

export default function MyPageScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, setUser } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOrder, setMenuOrder] = useState<string[]>([]);
  const [editingMenus, setEditingMenus] = useState<MenuItem[] | null>(null);
  const [savingMenuOrder, setSavingMenuOrder] = useState(false);
  const schoolAccessEnabled = hasSchoolAccess(user);

  const fetchMenuOrder = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/menu-preferences`, {
        headers: { 'x-user-id': String(user.id) },
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.order)) setMenuOrder(data.order);
    } catch (error) {
      console.warn('메뉴 순서 조회 오류:', error);
    }
  }, [user?.id]);

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
    fetchMenuOrder();
  }, [fetchMenuOrder, fetchUserData]);

  useEffect(() => {
    setProfileImage(getCorrectImageUrl(user?.profile_picture));
  }, [user?.profile_picture]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchUserData();
      await fetchMenuOrder();
    } finally {
      setRefreshing(false);
    }
  }, [fetchMenuOrder, fetchUserData]);

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
      key: 'my_evaluation',
      label: '나의 평가',
      icon: 'stats-chart-outline',
      onPress: () => navigation.navigate('MyPage4', { user }),
    },
    {
      key: 'team_evaluation',
      label: '팀원평가',
      icon: 'people-outline',
      onPress: () => navigation.navigate('MyPage2', { user }),
    },
    {
      key: 'settings',
      label: '설정',
      icon: 'settings-outline',
      onPress: () => navigation.navigate('Settings', { user }),
    },
    {
      key: 'favorites',
      label: '관심 활동',
      icon: 'heart-outline',
      onPress: () => navigation.navigate('FavoriteActivities'),
    },
    {
      key: 'my_recruitments',
      label: '나의 모집',
      icon: 'megaphone-outline',
      onPress: () => navigation.navigate('MyRecruitments'),
    },
    {
      key: 'my_applications',
      label: '나의 지원',
      icon: 'paper-plane-outline',
      onPress: () => navigation.navigate('MyApplications'),
    },
    {
      key: 'awards',
      label: '수상내역',
      icon: 'trophy-outline',
      onPress: () => navigation.navigate('Awards'),
    },
    {
      key: 'friends',
      label: '친구',
      icon: 'people-circle-outline',
      onPress: () => navigation.navigate('Friends'),
    },
    {
      key: 'school_verification',
      label: '학교 인증',
      icon: schoolAccessEnabled ? 'school' : 'school-outline',
      onPress: () => navigation.navigate('SchoolEmailVerification'),
    },
    {
      key: 'developer_feedback',
      label: '개발자에게 한마디',
      icon: 'chatbubble-ellipses-outline',
      onPress: () => navigation.navigate('DeveloperFeedback'),
    },
    ...(user.is_admin ? [{
      key: 'admin',
      label: '운영 관리',
      icon: 'shield-checkmark-outline',
      onPress: () => navigation.navigate('AdminScreen'),
    }] : []),
  ] as MenuItem[];

  const orderedMenuItems = [...menuItems].sort((first, second) => {
    const firstOrder = menuOrder.indexOf(first.key);
    const secondOrder = menuOrder.indexOf(second.key);
    if (firstOrder < 0 && secondOrder < 0) return 0;
    if (firstOrder < 0) return 1;
    if (secondOrder < 0) return -1;
    return firstOrder - secondOrder;
  });

  const moveMenu = (key: string, targetIndex: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingMenus((current) => {
      if (!current) return current;
      const fromIndex = current.findIndex((item) => item.key === key);
      if (fromIndex < 0 || fromIndex === targetIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const saveMenuOrder = async () => {
    if (!editingMenus || !user.id || savingMenuOrder) return;
    setSavingMenuOrder(true);
    try {
      const order = editingMenus.map((item) => item.key);
      const response = await fetch(`${API_BASE_URL}/api/menu-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ order }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '메뉴 순서를 저장하지 못했습니다');
      setMenuOrder(order);
      setEditingMenus(null);
    } catch (error) {
      Alert.alert('저장 실패', error instanceof Error ? error.message : '메뉴 순서를 저장하지 못했습니다');
    } finally {
      setSavingMenuOrder(false);
    }
  };

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
          <TouchableOpacity style={styles.schoolStatus} onPress={() => navigation.navigate('SchoolEmailVerification')}>
            <Icon
              name={schoolAccessEnabled ? 'checkmark-circle' : 'school-outline'}
              size={14}
              color={schoolAccessEnabled ? '#12B76A' : colors.textSub}
            />
            <Text style={[
              styles.schoolStatusText,
              schoolAccessEnabled && styles.schoolStatusVerified,
            ]}>
              {schoolAccessEnabled
                ? `${user.school_name || '학교'} 인증됨`
                : '학교 이메일 추가'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuHeading}>
          <Text style={styles.menuHeadingTitle}>내 메뉴</Text>
          <TouchableOpacity style={styles.menuEditButton} onPress={() => setEditingMenus(orderedMenuItems)}>
            <Icon name="options-outline" size={15} color={colors.primary} />
            <Text style={styles.menuEditText}>편집</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.menuGrid}>
          {orderedMenuItems.map((item) => (
            <TouchableOpacity key={item.key} style={styles.menuCard} onPress={item.onPress} activeOpacity={0.72}>
              <View style={styles.menuIconContainer}>
                <Icon name={item.icon || 'ellipse-outline'} size={28} color={colors.primary} />
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
      <Modal visible={Boolean(editingMenus)} transparent animationType="slide" onRequestClose={() => setEditingMenus(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.menuEditor}>
            <View style={styles.editorHeader}>
              <View>
                <Text style={styles.editorTitle}>메뉴 순서 편집</Text>
                <Text style={styles.editorDescription}>오른쪽 버튼을 누른 채 위아래로 이동하세요.</Text>
              </View>
              <Pressable onPress={() => setEditingMenus(null)}><Icon name="close" size={24} color={colors.textMain} /></Pressable>
            </View>
            <ScrollView style={styles.editorList}>
              {(editingMenus || []).map((item, index) => (
                <DraggableMenuRow key={item.key} item={item} index={index} total={editingMenus?.length || 0} onDrop={moveMenu} />
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.editorSave} disabled={savingMenuOrder} onPress={saveMenuOrder}>
              <Text style={styles.editorSaveText}>{savingMenuOrder ? '저장 중...' : '순서 저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 36 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: colors.textSub },
  profileSection: { alignItems: 'center', paddingTop: 44, paddingBottom: 42 },
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
  schoolStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#F2F4F7' },
  schoolStatusText: { color: colors.textSub, fontSize: 10, fontWeight: '800' },
  schoolStatusVerified: { color: '#067647' },
  imageEditButton: { padding: 6 },
  pencilIcon: { width: 17, height: 17, resizeMode: 'contain' },
  menuHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 18 },
  menuHeadingTitle: { color: colors.textMain, fontSize: 17, fontWeight: '900' },
  menuEditButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.primarySurface },
  menuEditText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    columnGap: 10,
    rowGap: 22,
  },
  menuCard: {
    width: '31%',
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  menuIconContainer: {
    width: 56,
    height: 56,
    marginBottom: 9,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  menuText: { color: '#344054', fontSize: 13, fontWeight: '700' },
  logoutButtonWrapper: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 14 },
  logoutButton: { paddingVertical: 10, paddingHorizontal: 4 },
  logoutText: { color: '#98A2B3', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.45)' },
  menuEditor: { maxHeight: '82%', padding: 21, paddingBottom: 32, borderTopLeftRadius: 27, borderTopRightRadius: 27, backgroundColor: '#FFFFFF' },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  editorTitle: { color: colors.textMain, fontSize: 19, fontWeight: '900' },
  editorDescription: { marginTop: 5, color: colors.textSub, fontSize: 11 },
  editorList: { maxHeight: 490 },
  editRow: { height: MENU_ROW_HEIGHT - 6, flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: '#EAECF0', borderRadius: 14, backgroundColor: '#FFFFFF' },
  editRowDragging: { zIndex: 20, borderColor: colors.primaryLight, shadowColor: colors.primaryDark, shadowOpacity: 0.2, shadowOffset: { width: 0, height: 7 }, shadowRadius: 11, elevation: 8 },
  editIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySurface },
  editLabel: { flex: 1, marginLeft: 11, color: colors.textMain, fontSize: 13, fontWeight: '800' },
  dragHandle: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F4F7' },
  dragHandleActive: { backgroundColor: colors.primary },
  editorSave: { height: 50, marginTop: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary },
  editorSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
