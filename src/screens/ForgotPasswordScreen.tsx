import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import CustomTextInput from '../components/CustomTextInput';
import colors from '../config/colors';
import { RootStackParamList } from '../types';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
type Step = 'EMAIL' | 'CODE' | 'PASSWORD';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<Step>('EMAIL');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [message, setMessage] = useState('가입한 이메일로 인증 코드를 보내드려요.');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestCode = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '인증 코드를 전송하지 못했습니다');
      const developmentCode = __DEV__ ? data.development_code : undefined;
      if (developmentCode) setCode(String(developmentCode));
      setMessage(developmentCode
        ? `개발 환경 인증 코드가 입력되었습니다: ${developmentCode}`
        : data.message);
      setStep('CODE');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '요청에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '인증 코드가 올바르지 않습니다');
      setResetToken(data.reset_token);
      setMessage('새 비밀번호를 입력해주세요.');
      setStep('PASSWORD');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '인증에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (password.length < 4) return setError('비밀번호는 4자 이상 입력해주세요.');
    if (password !== passwordConfirm) return setError('비밀번호가 일치하지 않습니다.');
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_token: resetToken, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '비밀번호를 변경하지 못했습니다');
      navigation.replace('Login');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '변경에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>끼리끼리</Text>
          <Text style={styles.title}>비밀번호 찾기</Text>
          <Text style={styles.description}>{message}</Text>

          <CustomTextInput
            label="이메일"
            value={email}
            onChangeText={setEmail}
            editable={step === 'EMAIL'}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {step === 'CODE' ? (
            <CustomTextInput
              label="인증 코드"
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
            />
          ) : null}
          {step === 'PASSWORD' ? (
            <>
              <CustomTextInput label="새 비밀번호" value={password} onChangeText={setPassword} secureTextEntry />
              <CustomTextInput
                label="새 비밀번호 확인"
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                secureTextEntry
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            disabled={submitting}
            onPress={step === 'EMAIL' ? requestCode : step === 'CODE' ? verifyCode : resetPassword}
          >
            <Text style={styles.buttonText}>
              {submitting ? '처리 중...' : step === 'EMAIL' ? '인증 코드 보내기' : step === 'CODE' ? '인증하기' : '비밀번호 변경'}
            </Text>
          </TouchableOpacity>
          {step === 'CODE' ? (
            <TouchableOpacity onPress={() => setStep('EMAIL')}><Text style={styles.link}>이메일 다시 입력</Text></TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  logo: { color: colors.primary, fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 36 },
  title: { color: colors.textMain, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  description: { color: colors.textSub, fontSize: 14, lineHeight: 20, marginBottom: 24 },
  error: { color: '#D92D20', fontSize: 13, marginTop: 4 },
  button: { marginTop: 20, padding: 16, borderRadius: 13, alignItems: 'center', backgroundColor: colors.primary },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  link: { marginTop: 18, textAlign: 'center', color: colors.primary, fontWeight: '700' },
});
