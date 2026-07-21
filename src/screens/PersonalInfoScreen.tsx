import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function PersonalInfoScreen() {
  const { user, setUser } = useAuth();
  const [department, setDepartment] = useState('');
  const [studentId, setStudentId] = useState('');
  const [birth, setBirth] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setDepartment(user?.department || '');
    setStudentId(user?.studentId || '');
    setBirth(user?.birth ? String(user.birth).slice(0, 10) : '');
  }, [user?.birth, user?.department, user?.studentId]);

  const saveProfile = async () => {
    if (!user?.id || savingProfile) return;
    if (birth && !DATE_PATTERN.test(birth.trim())) {
      Alert.alert('입력 확인', '생년월일은 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }

    setSavingProfile(true);
    try {
      const response = await fetch(`${BASE_URL}/api/user/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user.id),
        },
        body: JSON.stringify({
          department: department.trim(),
          student_number: studentId.trim(),
          birth_date: birth.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || '개인정보를 저장하지 못했습니다.');
      }

      setUser({
        ...user,
        department: department.trim(),
        studentId: studentId.trim(),
        birth: birth.trim(),
      });
      Alert.alert('저장 완료', '개인정보가 수정되었습니다.');
    } catch (error) {
      Alert.alert('저장 실패', error instanceof Error ? error.message : '서버 오류가 발생했습니다.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (!user?.id || savingPassword) return;
    if (!currentPassword || newPassword.length < 4) {
      Alert.alert('입력 확인', '현재 비밀번호와 4자 이상의 새 비밀번호를 입력해주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('입력 확인', '새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch(`${BASE_URL}/api/user/${user.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user.id),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || '비밀번호를 변경하지 못했습니다.');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('변경 완료', '비밀번호가 안전하게 변경되었습니다.');
    } catch (error) {
      Alert.alert('변경 실패', error instanceof Error ? error.message : '서버 오류가 발생했습니다.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}><Text style={styles.helperText}>로그인이 필요합니다.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Icon name="person-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.introText}>
              <Text style={styles.introTitle}>개인정보</Text>
              <Text style={styles.helperText}>계정 정보와 비밀번호를 한곳에서 관리해요.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>계정 정보</Text>
            <Field label="아이디(이메일)" value={user.email} editable={false} />
            <Field label="학과" value={department} onChangeText={setDepartment} placeholder="학과 입력" />
            <Field label="학번" value={studentId} onChangeText={setStudentId} placeholder="학번 입력" />
            <Field
              label="생년월일"
              value={birth}
              onChangeText={setBirth}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={savingProfile}>
              <Text style={styles.primaryButtonText}>{savingProfile ? '저장 중...' : '개인정보 저장'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>비밀번호 수정</Text>
            <Field
              label="현재 비밀번호"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="현재 비밀번호"
              secureTextEntry
            />
            <Field
              label="새 비밀번호"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="4자 이상 입력"
              secureTextEntry
            />
            <Field
              label="새 비밀번호 확인"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="한 번 더 입력"
              secureTextEntry
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={savePassword} disabled={savingPassword}>
              <Text style={styles.secondaryButtonText}>{savingPassword ? '변경 중...' : '비밀번호 변경'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numbers-and-punctuation';
};

function Field({ label, editable = true, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        editable={editable}
        placeholderTextColor={colors.inputPlaceholder}
        style={[styles.input, !editable && styles.readOnlyInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 50, gap: 14 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { marginBottom: 2, flexDirection: 'row', alignItems: 'center' },
  introIcon: {
    width: 48,
    height: 48,
    marginRight: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  introText: { flex: 1 },
  introTitle: { color: colors.textMain, fontSize: 19, fontWeight: '800' },
  helperText: { marginTop: 4, color: colors.textSub, fontSize: 13, lineHeight: 19 },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  cardTitle: { marginBottom: 16, color: colors.textMain, fontSize: 17, fontWeight: '800' },
  field: { marginBottom: 14 },
  label: { marginBottom: 7, color: colors.textSub, fontSize: 13, fontWeight: '700' },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.textMain,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
  },
  readOnlyInput: { color: colors.textSub, backgroundColor: colors.inputBackground },
  primaryButton: {
    height: 48,
    marginTop: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    height: 48,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  secondaryButtonText: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
});
