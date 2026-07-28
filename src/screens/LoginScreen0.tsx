import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';

// ✅ React Navigation import 추가
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { useAuth } from '../context/AuthContext';

// ✅ Navigation 타입 정의
type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

interface LoginScreenProps {
  onLoginSuccess?: (user: any) => void;
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
  onShowSignUp?: () => void;
}

const LoginScreen = ({ 
  onLoginSuccess, 
  onNavigateToForgotPassword,
}: LoginScreenProps = {}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Navigation hook 추가
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { setUser } = useAuth();

  // ✅ API URL 설정
  const API_URL = Platform.OS === 'android' 
    ? 'http://10.0.2.2:3000/api/login' 
    : 'http://localhost:3000/api/login';

  // 로그인 API 호출 함수
  const loginAPI = async (email: string, password: string) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '로그인 실패');
      }

      return data;
    } catch (error) {
      console.error('로그인 API 에러:', error);
      throw error;
    }
  };
  
  const handleLogin = async () => {
    // 입력값 검증
    if (!email.trim()) {
      Alert.alert('알림', '이메일을 입력해주세요.');
      return;
    }

    if (!password.trim()) {
      Alert.alert('알림', '비밀번호를 입력해주세요.');
      return;
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('알림', '올바른 이메일 형식을 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      // API 호출
      const result = await loginAPI(email, password);

      if (result.success) {
        setUser({ ...result.user, authToken: result.token });
        
        Alert.alert(
          '로그인 성공', 
          `${result.user.name}님, 환영합니다!`,
          [
            {
              text: '확인',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'MainTabs' }],
                });
                
                // 기존 콜백도 호출 (호환성 유지)
                if (onLoginSuccess) {
                  onLoginSuccess(result.user);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('로그인 실패', result.message);
      }
    } catch (error: any) {
      console.error('로그인 에러:', error);
      
      // 네트워크 에러 처리
      if (error.message.includes('Network request failed') || 
          error.message.includes('fetch')) {
        Alert.alert(
          '연결 오류', 
          '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.'
        );
      } else {
        Alert.alert('로그인 실패', error.message || '알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 비밀번호 찾기
  const handleForgotPassword = () => {
    console.log('비밀번호 찾기');
    
    Alert.alert(
      '비밀번호 찾기',
      '비밀번호 찾기 기능을 구현하시겠습니까?',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '확인',
          onPress: () => {
            if (onNavigateToForgotPassword) {
              onNavigateToForgotPassword();
            } else {
              Alert.alert('알림', '비밀번호 찾기 페이지로 이동합니다.');
            }
          },
        },
      ]
    );
  };

  const handleSignUp = () => {
    console.log('회원가입 페이지로 이동');
    
    // ✅ RegisterScreen으로 이동
    navigation.navigate('Register');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.content}>
          {/* 로고/타이틀 영역 */}
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>끼리끼리</Text>
          </View>

          {/* 입력 폼 영역 */}
          <View style={styles.formContainer}>
            {/* 이메일 입력 */}
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  emailFocused && styles.inputFocused
                ]}
                placeholder="이메일"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* 비밀번호 입력 */}
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  passwordFocused && styles.inputFocused
                ]}
                placeholder="비밀번호"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* 로그인 버튼 */}
            <TouchableOpacity 
              style={[
                styles.loginButton,
                loading && styles.loginButtonDisabled
              ]} 
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>로그인</Text>
              )}
            </TouchableOpacity>

            {/* 비밀번호 찾기 */}
            <TouchableOpacity 
              style={styles.forgotPasswordButton} 
              onPress={handleForgotPassword}
              disabled={loading}
            >
              <Text style={styles.forgotPasswordText}>비밀번호를 잊으셨나요?</Text>
            </TouchableOpacity>
          </View>

          {/* 하단 회원가입 영역 */}
          <View style={styles.bottomContainer}>
            <Text style={styles.signUpPrompt}>계정이 없으신가요? </Text>
            <TouchableOpacity onPress={handleSignUp} disabled={loading}>
              <Text style={styles.signUpText}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
    marginBottom: 80,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#8B5CF6',
    letterSpacing: 2,
  },
  formContainer: {
    justifyContent: 'center',
    marginBottom: 80,
  },
  inputContainer: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  inputFocused: {
    borderColor: '#8B5CF6',
    backgroundColor: '#FFFFFF',
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  loginButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 40,
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginTop: 20,
  },
  forgotPasswordText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
  },
  signUpPrompt: {
    color: '#6B7280',
    fontSize: 14,
  },
  signUpText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
