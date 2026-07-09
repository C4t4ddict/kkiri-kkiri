import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Image, Alert, ScrollView, Platform
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext'; // ✅ 전역 user
import { User } from '../types';

// 필요하다면 App.tsx 타입 말고 로컬 선언으로 최소화
type RootStackParamList = {
  Login: undefined;
  Settings: { user: User };
};

type NavProp = StackNavigationProp<RootStackParamList>;

const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const formatDate = (value?: string) => {
  if (!value) return '정보 없음';
  // 이미 yyyy-MM-dd면 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const d = new Date(value);               // 서버가 주는 ISO를 Date로 파싱
  if (isNaN(d.getTime())) return value;    // 혹시 모를 예외
  const y = d.getFullYear();               // ✅ 로컬 기준 (getUTC* 아님)
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function MyPageScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, setUser } = useAuth();          // ✅ 전역에서만 가져옴
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<keyof User | null>(null);
  const [editValue, setEditValue] = useState('');

  // 사용자 정보 불러오기 (전역 user가 있을 때만)
  const fetchUserData = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/${user.id}`);
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user); // ✅ 전역 갱신
        setProfileImage(data.user.profile_picture || null);
      } else {
        Alert.alert('오류', data.message || '사용자 정보를 불러오는데 실패했습니다.');
      }
    } catch (e) {
      Alert.alert('오류', '서버 연결에 실패했습니다.');
    }
  };

  useEffect(() => {
    fetchUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleImagePicker = () => {
    Alert.alert('프로필 사진 변경', '어떤 방식으로 변경하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '랜덤 이미지',
        onPress: () => {
          const randomId = Math.floor(Math.random() * 1000);
          setProfileImage(`https://picsum.photos/300/300?random=${randomId}`);
        },
      },
      {
        text: '기본 이미지',
        onPress: () => {
          setProfileImage('https://via.placeholder.com/120x120/8B5CF6/FFFFFF?text=USER');
        },
      },
    ]);
  };

  const toDateOnly = (iso?: string) => {
    if (!iso) return '';
    return iso.split('T')[0];            // "2000-11-10"
  };

  const isDateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

  const startEditing = (field: keyof User, value?: string) => {
    setEditingField(field);
    if (field === 'birth') setEditValue(formatDate(value));  // ✅
    else setEditValue(value ?? '');
  };

  const finishEditing = () => {
    if (!editingField || !user) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingField(null);
      setEditValue('');
      return;
    }

    if (editingField === 'birth') {
      if (!isDateOnly(trimmed)) {
        Alert.alert('형식 오류', '생년월일은 YYYY-MM-DD 형식으로 입력하세요.');
        return;
      }
      // 서버가 DATE 컬럼이면 그대로 보내면 됨
      updateUserInfo(editingField, trimmed);
      return;
    }

    updateUserInfo(editingField, trimmed);
  };

  const updateUserInfo = async (field: keyof User, value: string) => {
    if (!user?.id) return;
    try {
      const url = `${API_BASE_URL}/api/user/${user.id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('성공', '정보가 업데이트되었습니다.');
        await fetchUserData();
      } else {
        Alert.alert('오류', data.message || '업데이트 실패');
      }
    } catch (e) {
      Alert.alert('오류', '서버 오류가 발생했습니다.');
    } finally {
      setEditingField(null);
      setEditValue('');
    }
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => {
          setUser(null); // ✅ 전역 초기화
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            })
          );
        },
      },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>로그인이 필요합니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView>
        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            <Image
              source={
                profileImage
                  ? { uri: profileImage }
                  : { uri: 'https://via.placeholder.com/300/E5E7EB/9CA3AF?text=Profile' }
              }
              style={styles.profileImage}
            />
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.userName}>{user.name}</Text>
            <TouchableOpacity style={styles.imageEditButton} onPress={handleImagePicker}>
              <Text style={styles.editIcon}>수정</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={styles.tab}>
            <View style={styles.tabIconContainer}>
              <Image source={require('../assets/eval.png')} style={styles.tabIcon} />
            </View>
            <Text style={styles.tabText}>나의 평가</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tab}>
            <View style={styles.tabIconContainer}>
              <Image source={require('../assets/team.png')} style={styles.tabIcon} />
            </View>
            <Text style={styles.tabText}>팀원찾기</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tab}
            onPress={() => navigation.navigate('Settings', { user })}
          >
            <View style={styles.tabIconContainer}>
              <Image source={require('../assets/settings.png')} style={styles.tabIcon} />
            </View>
            <Text style={styles.tabText}>설정</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSectionContainer}>
          <View style={styles.infoCard}>
            {([
              ['이메일', 'email'],
              ['학과', 'department'],
              ['학번', 'studentId'],
              ['생년월일', 'birth'],
            ] as const).map(([label, field]) => (
              <View key={field} style={styles.infoItem}>
                <Text style={styles.infoLabel}>{label}</Text>
                <View style={styles.infoValueContainer}>
                  <Text style={styles.infoValue}>
                    {field === 'birth'
                      ? formatDate(user.birth)
                      : (user[field] as string) || '정보 없음'}
                  </Text>
                  <TouchableOpacity
                    style={styles.editIconButton}
                    onPress={() => startEditing(field, user[field] as string | undefined)}
                  >
                    <Text style={styles.editIcon}>수정</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {editingField && (
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContainer}>
            <Text style={styles.editModalTitle}>
              {{
                email: '이메일',
                department: '학과',
                studentId: '학번',
                birth: '생년월일',
                id: 'ID',
                user_id: 'ID',
                name: '이름',
                student_number: '학번',
                birth_date: '생년월일',
                profile_picture: '프로필',
              }[editingField]}{' '}
              편집
            </Text>
            <TextInput
              style={styles.editModalInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder="정보를 입력하세요"
              onSubmitEditing={finishEditing}
            />
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setEditingField(null);
                  setEditValue('');
                }}
              >
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={finishEditing}>
                <Text style={styles.saveText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: '#6B7280' },
  profileSection: { alignItems: 'center', paddingVertical: 20 },
  profileImageContainer: { width: 180, height: 180, borderRadius: 90, overflow: 'hidden', marginBottom: 10 },
  profileImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  nameContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginRight: 10 },
  imageEditButton: { padding: 5 },
  editIcon: { fontSize: 16 },
  infoSectionContainer: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 20 },
  infoCard: { width: 300, backgroundColor: '#F2F4F8', borderRadius: 12, padding: 20 },
  infoItem: { marginBottom: 15 },
  infoLabel: { fontSize: 14, color: '#6B7280', marginBottom: 5 },
  infoValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 5,
  },
  infoValue: { flex: 1, fontSize: 16, color: '#1F2937' },
  editIconButton: { padding: 5 },
  logoutButton: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 20 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
  editModalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  editModalContainer: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, width: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5,
  },
  editModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  editModalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, padding: 10, fontSize: 16, marginBottom: 15 },
  editModalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  cancelButton: { paddingHorizontal: 15, paddingVertical: 8, marginRight: 10 },
  saveButton: { backgroundColor: '#8B5CF6', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
  cancelText: { color: '#6B7280', fontSize: 14 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },

  tabContainer: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  paddingVertical: 10,
  borderBottomWidth: 1,
  borderColor: '#E5E7EB',
  backgroundColor: '#FFFFFF',
},

tab: {
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  paddingVertical: 8,
},

tabIconContainer: {
  marginBottom: 4,
  alignItems: 'center',
},

tabIcon: {
  width: 24,
  height: 24,
  resizeMode: 'contain',
},

tabText: {
  fontSize: 12,
  color: '#6B7280',
},

});
