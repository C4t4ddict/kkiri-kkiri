import React, { useEffect, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import colors from '../config/colors';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export default function FriendAddScreen() {
  const { user } = useAuth();
  const [myCode, setMyCode] = useState(user?.friend_code || user?.friendCode || '');
  const [friendCode, setFriendCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API_BASE_URL}/api/friends`, { headers: { 'x-user-id': String(user.id) } })
      .then((response) => response.json())
      .then((data) => setMyCode(data.friend_code || ''))
      .catch(() => setMessage('내 친구 코드를 불러오지 못했습니다.'));
  }, [user?.id]);

  const sendRequest = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/friends/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify({ friend_code: friendCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '친구 요청을 보내지 못했습니다');
      setFriendCode('');
      setMessage(`${data.friend_name}님에게 친구 요청을 보냈어요.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '친구 요청을 보내지 못했습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>MY FRIEND CODE</Text>
        <TouchableOpacity style={styles.codeCard} onPress={() => { Clipboard.setString(myCode); setMessage('친구 코드를 복사했어요.'); }}>
          <Text style={styles.code}>{myCode || '불러오는 중'}</Text>
          <Icon name="copy-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.hint}>내 코드를 친구에게 공유하거나 친구 코드를 입력하세요.</Text>

        <Text style={styles.label}>친구 코드 입력</Text>
        <TextInput
          value={friendCode}
          onChangeText={(value) => setFriendCode(value.toUpperCase().replace(/\s/g, '').slice(0, 10))}
          autoCapitalize="characters"
          placeholder="예: A1B2C3D4"
          placeholderTextColor="#98A2B3"
          style={styles.input}
        />
        <TouchableOpacity style={[styles.button, (!friendCode || busy) && styles.disabled]} disabled={!friendCode || busy} onPress={sendRequest}>
          <Text style={styles.buttonText}>{busy ? '요청 중...' : '친구 요청 보내기'}</Text>
        </TouchableOpacity>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 22 },
  eyebrow: { marginTop: 18, color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  codeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, paddingHorizontal: 20, height: 74, borderWidth: 1, borderColor: '#D9D1FF', borderRadius: 19, backgroundColor: '#FAF9FF' },
  code: { color: colors.primaryDark, fontSize: 25, fontWeight: '900', letterSpacing: 4 },
  hint: { marginTop: 9, color: colors.textSub, fontSize: 12, lineHeight: 18 },
  label: { marginTop: 32, marginBottom: 8, color: colors.textMain, fontSize: 14, fontWeight: '900' },
  input: { height: 54, paddingHorizontal: 16, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 14, color: colors.textMain, fontSize: 18, letterSpacing: 3 },
  button: { height: 52, marginTop: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  message: { marginTop: 15, color: colors.primaryDark, fontSize: 13 },
});
