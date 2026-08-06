import React, { useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function SchoolEmailVerificationScreen() {
  const { user, setUser } = useAuth();
  const [email, setEmail] = useState(user?.school_email || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const verified = Boolean(user?.school_email_verified || user?.schoolEmailVerified);

  const requestCode = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/school-email/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '인증 코드를 보내지 못했습니다');
      setCodeSent(true);
      if (data.development_code) setCode(String(data.development_code));
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '인증 코드를 보내지 못했습니다');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/school-email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '학교 인증을 완료하지 못했습니다');
      setUser({ ...data.user, authToken: user.authToken });
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '학교 인증을 완료하지 못했습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.iconBox}><Icon name="school-outline" size={28} color={colors.primary} /></View>
          <Text style={styles.title}>학교 이메일 인증</Text>
          <Text style={styles.description}>인증하면 같은 학교의 팀 모집글을 확인하고 작성할 수 있어요.</Text>
        </View>

        {verified ? (
          <View style={styles.verifiedCard}>
            <Icon name="checkmark-circle" size={24} color="#12B76A" />
            <View style={styles.verifiedCopy}>
              <Text style={styles.verifiedTitle}>학교 인증 완료</Text>
              <Text style={styles.verifiedEmail}>{user?.school_email || user?.schoolEmail}</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.label}>학교 이메일</Text>
            <View style={styles.inline}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="name@university.ac.kr"
                placeholderTextColor="#98A2B3"
                style={styles.input}
              />
              <TouchableOpacity style={styles.smallButton} disabled={busy} onPress={requestCode}>
                <Text style={styles.smallButtonText}>{codeSent ? '재전송' : '코드 전송'}</Text>
              </TouchableOpacity>
            </View>
            {codeSent ? (
              <>
                <Text style={styles.label}>인증 코드</Text>
                <TextInput
                  value={code}
                  onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="6자리 코드"
                  placeholderTextColor="#98A2B3"
                  style={styles.codeInput}
                />
                <TouchableOpacity style={styles.verifyButton} disabled={busy || code.length !== 6} onPress={verify}>
                  <Text style={styles.verifyButtonText}>{busy ? '확인 중...' : '학교 인증 완료'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </>
        )}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 22 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  iconBox: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySurface },
  title: { marginTop: 14, color: colors.textMain, fontSize: 21, fontWeight: '900' },
  description: { marginTop: 8, maxWidth: 300, textAlign: 'center', color: colors.textSub, fontSize: 13, lineHeight: 19 },
  label: { marginTop: 18, marginBottom: 7, color: '#475467', fontSize: 12, fontWeight: '800' },
  inline: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 13, color: colors.textMain },
  codeInput: { height: 52, paddingHorizontal: 15, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 13, color: colors.textMain, fontSize: 18, letterSpacing: 7 },
  smallButton: { minWidth: 84, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.primarySurface },
  smallButtonText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  verifyButton: { height: 50, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary },
  verifyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  message: { marginTop: 14, color: colors.primaryDark, fontSize: 13, lineHeight: 19 },
  verifiedCard: { flexDirection: 'row', alignItems: 'center', marginTop: 18, padding: 18, borderWidth: 1, borderColor: '#ABEFC6', borderRadius: 16, backgroundColor: '#ECFDF3' },
  verifiedCopy: { marginLeft: 12 },
  verifiedTitle: { color: '#067647', fontSize: 15, fontWeight: '900' },
  verifiedEmail: { marginTop: 4, color: '#475467', fontSize: 13 },
});
