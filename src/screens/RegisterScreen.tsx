import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, SafeAreaView } from 'react-native';
import CustomTextInput from '../components/CustomTextInput';
import colors from '../config/colors';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App.tsx'; // 실제 경로로 수정

type RegisterScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Register'>;

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function RegisterScreen() {
  const nav = useNavigation<RegisterScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [studentId, setStudentId] = useState('');
  const [birth, setBirth] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const pwMismatch = passwordConfirm && password !== passwordConfirm;
  const isSchoolEmail = /@(?:[^@.]+\.)*ac\.kr$/i.test(email.trim());

  const updateEmail = (value: string) => {
    setEmail(value);
    setCodeSent(false);
    setEmailVerified(false);
    setVerificationCode('');
  };

  const requestVerificationCode = async () => {
    if (!email.trim()) return Alert.alert('확인', '이메일을 입력해주세요.');
    setVerifying(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/email-verification/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '인증 코드를 전송하지 못했습니다.');
      setCodeSent(true);
      const developmentCode = __DEV__ ? result.development_code : undefined;
      if (developmentCode) setVerificationCode(String(developmentCode));
      Alert.alert(
        '인증 코드 전송',
        developmentCode
          ? `개발 환경 인증 코드 ${developmentCode}가 입력되었습니다.`
          : '이메일로 전송된 6자리 코드를 입력해주세요.',
      );
    } catch (error) {
      Alert.alert('전송 실패', error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setVerifying(false);
    }
  };

  const verifyEmail = async () => {
    if (!/^\d{6}$/.test(verificationCode)) return Alert.alert('확인', '6자리 인증 코드를 입력해주세요.');
    setVerifying(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/email-verification/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '인증에 실패했습니다.');
      setEmailVerified(true);
      Alert.alert('인증 완료', '이메일 인증이 완료되었습니다.');
    } catch (error) {
      Alert.alert('인증 실패', error instanceof Error ? error.message : '인증 코드를 확인해주세요.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !passwordConfirm || !name) {
      Alert.alert('입력 오류', '모든 필수 항목을 입력해주세요.');
      return;
    }

    if (password !== passwordConfirm) {
      Alert.alert('비밀번호 불일치', '비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!emailVerified) {
      Alert.alert('이메일 인증 필요', '이메일 인증을 먼저 완료해주세요.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name,
          department,
          studentId,
          birth,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        Alert.alert(
        '회원가입 성공',
        '이제 로그인할 수 있습니다.',
        [
          {
            text: '확인',
            onPress: () => nav.navigate('Login'),  // 'Login'은 로그인 화면의 라우트 이름
          },
        ],
        { cancelable: false }
      );
      } else {
        Alert.alert('회원가입 실패', result.message || '서버 오류 발생');
      }
    } catch (error) {
      console.error('회원가입 오류:', error);
      Alert.alert('에러', '서버와 연결할 수 없습니다.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>끼리끼리</Text>

        <CustomTextInput
            label="이메일"
            value={email}
            onChangeText={updateEmail}
            editable={!emailVerified}
            autoCapitalize="none"       // ✅ 첫 글자 대문자 방지
            keyboardType="email-address"
            autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.verifyButton, (verifying || emailVerified) && styles.disabledButton]}
          onPress={requestVerificationCode}
          disabled={verifying || emailVerified}
        >
          <Text style={styles.verifyButtonText}>
            {emailVerified ? '이메일 인증 완료' : codeSent ? '인증 코드 다시 받기' : '인증 코드 받기'}
          </Text>
        </TouchableOpacity>
        {codeSent && !emailVerified ? (
          <>
            <CustomTextInput
              label="인증 코드"
              value={verificationCode}
              onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.codeButton} onPress={verifyEmail} disabled={verifying}>
              <Text style={styles.codeButtonText}>{verifying ? '확인 중...' : '인증 확인'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <Text style={styles.accountGuide}>
          {isSchoolEmail
            ? '학교 계정 · 이메일 인증 후 본교 및 전국 모집을 이용할 수 있어요.'
            : '일반 계정 · 전국 모집 활동만 이용할 수 있어요.'}
        </Text>
        <CustomTextInput
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
        />
        <CustomTextInput
            label="비밀번호 확인"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            error={pwMismatch ? '비밀번호가 일치하지 않습니다' : undefined}
        />
        <CustomTextInput label="이름" value={name} onChangeText={setName} />
        <CustomTextInput label="학과" value={department} onChangeText={setDepartment} />
        <CustomTextInput label="학번" value={studentId} onChangeText={setStudentId} />
        <CustomTextInput label="생년월일" value={birth} onChangeText={setBirth} />

        <TouchableOpacity style={styles.button} onPress={handleRegister}>
            <Text style={styles.buttonText}>회원가입</Text>
        </TouchableOpacity>
        </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    alignSelf: 'center',
    marginVertical: 30,
    color: colors.primary,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  verifyButton: {
    marginTop: -4,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
  },
  verifyButtonText: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  codeButton: { marginTop: -4, marginBottom: 10, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12 },
  codeButtonText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  accountGuide: { marginBottom: 16, color: colors.textSub, fontSize: 12, lineHeight: 18 },
  disabledButton: { opacity: 0.62 },
});
