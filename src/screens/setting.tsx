import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
// @react-navigation/native 의존성 제거

interface User {
  user_id: number;
  email: string;
  name: string;
  department?: string;
  student_number?: string;
  birth_date?: string;
  profile_picture?: string;
}

interface SettingProps {
  user: User;
  onLogout: () => void;
  onGoBack: () => void; // 뒤로가기 함수 추가
}

const Setting = ({ user, onLogout, onGoBack }: SettingProps) => {
  const [settings, setSettings] = useState({
    teamMatching: true,
    activityNotifications: true,
    activityUpdates: true,
    publicProfile: true,
  });
  const [loading, setLoading] = useState(false);

  const toggleSwitch = (setting: keyof typeof settings) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      [setting]: !prevSettings[setting],
    }));
    
    // 실제로는 여기서 설정을 서버에 저장할 수 있습니다
    // saveUserSettings(setting, !settings[setting]);
    console.log(`설정 변경: ${setting} = ${!settings[setting]}`);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '회원 탈퇴',
      '정말로 회원 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없으며 모든 데이터가 삭제됩니다.',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '탈퇴',
          onPress: confirmDeleteAccount,
          style: 'destructive',
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      setLoading(true);
      
      // 서버에 회원탈퇴 요청
      const response = await fetch(`http://10.0.2.2:3000/api/delete-user/${user.user_id}`, {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
  },
});

      const data = await response.json();
      
      setLoading(false);
      
      if (data.success) {
        Alert.alert(
          '탈퇴 완료',
          '회원 탈퇴가 완료되었습니다.',
          [
            {
              text: '확인',
              onPress: () => {
                // 로그아웃 처리 및 로그인 화면으로 이동
                onLogout();
              }
            }
          ]
        );
      } else {
        Alert.alert('오류', data.message || '회원 탈퇴 처리에 실패했습니다.');
      }
    } catch (error) {
      setLoading(false);
      console.error('회원 탈퇴 에러:', error);
      Alert.alert('오류', '서버 연결에 실패했습니다.');
    }
  };

  // 뒤로가기 함수를 사용하여 이전 화면으로 이동
  const handleGoBack = () => {
    onGoBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Text style={styles.backIcon}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={styles.headerRight} />
      </View>

      {/* 계정 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>계정</Text>
        
        <View style={styles.itemContainer}>
          <Text style={styles.itemLabel}>아이디</Text>
          <Text style={styles.itemValue}>{user.email}</Text>
        </View>
        
        <TouchableOpacity style={styles.itemContainer}>
          <Text style={styles.itemLabel}>비밀번호 변경</Text>
          <Text style={styles.itemArrow}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* 알림 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>
        
        <View style={styles.itemContainer}>
          <Text style={styles.itemLabel}>팀/팀원 매칭</Text>
          <Switch
            trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E7EB"
            onValueChange={() => toggleSwitch('teamMatching')}
            value={settings.teamMatching}
          />
        </View>
        
        <View style={styles.itemContainer}>
          <Text style={styles.itemLabel}>활동 게시글</Text>
          <Switch
            trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E7EB"
            onValueChange={() => toggleSwitch('activityNotifications')}
            value={settings.activityNotifications}
          />
        </View>
        
        <View style={styles.itemContainer}>
          <Text style={styles.itemLabel}>활동 할 일</Text>
          <Switch
            trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E7EB"
            onValueChange={() => toggleSwitch('activityUpdates')}
            value={settings.activityUpdates}
          />
        </View>
        
        <View style={styles.itemContainer}>
          <Text style={styles.itemLabel}>공지사항</Text>
          <Switch
            trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E7EB"
            onValueChange={() => toggleSwitch('publicProfile')}
            value={settings.publicProfile}
          />
        </View>
      </View>

      {/* 회원탈퇴 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>회원탈퇴</Text>
        
        <TouchableOpacity 
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={styles.deleteAccountText}>회원탈퇴</Text>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    padding: 10,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerRight: {
    width: 44, // 왼쪽 버튼과 균형을 맞추기 위한 빈 공간
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 15,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  itemLabel: {
    fontSize: 16,
    color: '#1F2937',
  },
  itemValue: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  itemArrow: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  deleteAccountButton: {
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteAccountText: {
    fontSize: 16,
    color: '#EF4444',
  },
});

export default Setting;
