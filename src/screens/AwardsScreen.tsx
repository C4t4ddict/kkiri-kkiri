import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import AppRefreshControl from '../components/AppRefreshControl';
import colors from '../config/colors';
import { useAuth } from '../context/AuthContext';

type AwardItem = {
  portfolio_id: number;
  team_id: number;
  activity_name: string;
  activity_type: string;
  period?: string | null;
  is_awarded: boolean;
  award_title?: string | null;
  has_prize: boolean;
  prize_amount: number;
  tax_applied: boolean;
  net_prize_amount: number;
};

type AwardSummary = {
  award_count: number;
  total_net_prize: number;
};

const API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';

const formatWon = (value: number) => `${Math.round(value || 0).toLocaleString('ko-KR')}원`;
const calculateNet = (item: AwardItem) =>
  Math.round(Number(item.prize_amount || 0) * (item.tax_applied ? 0.78 : 1));

export default function AwardsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AwardItem[]>([]);
  const [summary, setSummary] = useState<AwardSummary>({ award_count: 0, total_net_prize: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const applyResponse = useCallback((data: any) => {
    setItems(Array.isArray(data?.items) ? data.items : []);
    setSummary({
      award_count: Number(data?.summary?.award_count || 0),
      total_net_prize: Number(data?.summary?.total_net_prize || 0),
    });
  }, []);

  const fetchAwards = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/awards`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '수상내역을 불러오지 못했습니다');
      applyResponse(data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '수상내역을 불러오지 못했습니다');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyResponse, user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchAwards();
    }, [fetchAwards]),
  );

  const updateItem = (portfolioId: number, patch: Partial<AwardItem>) => {
    setItems((current) => current.map((item) => {
      if (item.portfolio_id !== portfolioId) return item;
      const next = { ...item, ...patch };
      if (!next.is_awarded) {
        next.award_title = '';
        next.has_prize = false;
        next.prize_amount = 0;
        next.tax_applied = false;
      } else if (!next.has_prize) {
        next.prize_amount = 0;
        next.tax_applied = false;
      }
      next.net_prize_amount = calculateNet(next);
      return next;
    }));
  };

  const saveAward = async (item: AwardItem) => {
    if (!user?.id || savingId) return;
    setSavingId(item.portfolio_id);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/awards/${item.portfolio_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '수상내역을 저장하지 못했습니다');
      applyResponse(data);
      Alert.alert('저장 완료', '수상내역이 반영되었습니다.');
    } catch (saveError) {
      Alert.alert('저장 실패', saveError instanceof Error ? saveError.message : '서버 오류가 발생했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>수상 경험을 불러오고 있어요</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={() => fetchAwards(true)} />}
      >
        <View style={styles.summarySection}>
          <Text style={styles.eyebrow}>MY AWARDS</Text>
          <Text style={styles.heading}>참여 경험의 결과를 기록하세요</Text>
          <Text style={styles.description}>수상 기록과 실제 받은 상금을 활동별로 관리할 수 있어요.</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIconBox}>
                <Icon name="trophy" size={21} color={colors.primary} />
              </View>
              <Text style={styles.summaryLabel}>수상 횟수</Text>
              <Text style={styles.summaryValue}>{summary.award_count}회</Text>
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIconBox}>
                <Icon name="cash-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.summaryLabel}>받은 금액 총합</Text>
              <Text style={styles.summaryValueSmall}>{formatWon(summary.total_net_prize)}</Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchAwards()}>
              <Text style={styles.retryText}>다시 불러오기</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="ribbon-outline" size={36} color={colors.primary} />
            <Text style={styles.emptyTitle}>기록할 지난 활동이 없어요</Text>
            <Text style={styles.emptyDescription}>활동을 마무리하면 이곳에서 수상 여부를 기록할 수 있습니다.</Text>
          </View>
        ) : items.map((item) => (
          <View key={item.portfolio_id} style={styles.awardCard}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.cardHeadingCopy}>
                <Text style={styles.activityType}>{item.activity_type || '팀 활동'}</Text>
                <Text style={styles.activityName}>{item.activity_name}</Text>
                {item.period ? <Text style={styles.period}>{item.period}</Text> : null}
              </View>
              <View style={[styles.statusBadge, item.is_awarded && styles.statusBadgeActive]}>
                <Text style={[styles.statusText, item.is_awarded && styles.statusTextActive]}>
                  {item.is_awarded ? '수상' : '미기록'}
                </Text>
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>수상했어요</Text>
                <Text style={styles.settingDescription}>입상 또는 수상한 활동이면 켜주세요.</Text>
              </View>
              <Switch
                value={item.is_awarded}
                onValueChange={(value) => updateItem(item.portfolio_id, { is_awarded: value })}
                trackColor={{ false: '#D0D5DD', true: colors.primaryLight }}
                thumbColor={item.is_awarded ? colors.primary : '#FFFFFF'}
              />
            </View>

            {item.is_awarded ? (
              <>
                <Text style={styles.inputLabel}>수상명</Text>
                <TextInput
                  value={item.award_title || ''}
                  onChangeText={(value) => updateItem(item.portfolio_id, { award_title: value })}
                  placeholder="예: 대상, 최우수상, 장려상"
                  placeholderTextColor="#98A2B3"
                  maxLength={120}
                  style={styles.input}
                />

                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>상금이 있어요</Text>
                    <Text style={styles.settingDescription}>현금으로 받은 상금이 있으면 켜주세요.</Text>
                  </View>
                  <Switch
                    value={item.has_prize}
                    onValueChange={(value) => updateItem(item.portfolio_id, { has_prize: value })}
                    trackColor={{ false: '#D0D5DD', true: colors.primaryLight }}
                    thumbColor={item.has_prize ? colors.primary : '#FFFFFF'}
                  />
                </View>
              </>
            ) : null}

            {item.is_awarded && item.has_prize ? (
              <>
                <Text style={styles.inputLabel}>상금</Text>
                <View style={styles.amountInputRow}>
                  <TextInput
                    value={item.prize_amount ? String(item.prize_amount) : ''}
                    onChangeText={(value) => updateItem(item.portfolio_id, {
                      prize_amount: Number(value.replace(/[^\d]/g, '')) || 0,
                    })}
                    placeholder="받기로 한 상금 입력"
                    placeholderTextColor="#98A2B3"
                    keyboardType="number-pad"
                    style={styles.amountInput}
                  />
                  <Text style={styles.wonSuffix}>원</Text>
                </View>

                <View style={styles.taxBox}>
                  <View style={styles.settingRowCompact}>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingTitle}>제세공과금 22% 적용</Text>
                      <Text style={styles.settingDescription}>세금을 제한 실제 수령액으로 계산합니다.</Text>
                    </View>
                    <Switch
                      value={item.tax_applied}
                      onValueChange={(value) => updateItem(item.portfolio_id, { tax_applied: value })}
                      trackColor={{ false: '#D0D5DD', true: colors.primaryLight }}
                      thumbColor={item.tax_applied ? colors.primary : '#FFFFFF'}
                    />
                  </View>
                  <View style={styles.amountSummaryRow}>
                    <View>
                      <Text style={styles.amountSummaryLabel}>입력 상금</Text>
                      <Text style={styles.amountSummaryValue}>{formatWon(item.prize_amount)}</Text>
                    </View>
                    <Icon name="arrow-forward" size={18} color={colors.textSub} />
                    <View style={styles.netAmountBox}>
                      <Text style={styles.amountSummaryLabel}>실수령액</Text>
                      <Text style={styles.netAmount}>{formatWon(calculateNet(item))}</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.saveButton, savingId === item.portfolio_id && styles.saveButtonDisabled]}
              onPress={() => saveAward(item)}
              disabled={savingId !== null}
              activeOpacity={0.78}
            >
              {savingId === item.portfolio_id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>이 활동 저장</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FC' },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FC' },
  loadingText: { marginTop: 12, color: colors.textSub, fontSize: 14 },
  summarySection: { marginBottom: 20 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  heading: { marginTop: 7, color: colors.textMain, fontSize: 24, fontWeight: '900', lineHeight: 32 },
  description: { marginTop: 7, color: colors.textSub, fontSize: 13, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  summaryCard: {
    flex: 1,
    minHeight: 132,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E7E1FF',
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
  },
  summaryIconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.primarySurface,
  },
  summaryLabel: { marginTop: 12, color: colors.textSub, fontSize: 11, fontWeight: '700' },
  summaryValue: { marginTop: 3, color: colors.textMain, fontSize: 24, fontWeight: '900' },
  summaryValueSmall: { marginTop: 5, color: colors.textMain, fontSize: 17, fontWeight: '900' },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: { marginTop: 12, color: colors.textMain, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { marginTop: 7, color: colors.textSub, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.primary },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  awardCard: {
    marginBottom: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeadingCopy: { flex: 1 },
  activityType: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  activityName: { marginTop: 5, color: colors.textMain, fontSize: 19, lineHeight: 26, fontWeight: '900' },
  period: { marginTop: 5, color: colors.textSub, fontSize: 11 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#F2F4F7' },
  statusBadgeActive: { backgroundColor: colors.primarySurface },
  statusText: { color: colors.textSub, fontSize: 10, fontWeight: '800' },
  statusTextActive: { color: colors.primary },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 17,
    paddingTop: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  settingRowCompact: { flexDirection: 'row', alignItems: 'center' },
  settingCopy: { flex: 1, paddingRight: 12 },
  settingTitle: { color: colors.textMain, fontSize: 14, fontWeight: '800' },
  settingDescription: { marginTop: 3, color: colors.textSub, fontSize: 11, lineHeight: 16 },
  inputLabel: { marginTop: 16, marginBottom: 7, color: colors.textMain, fontSize: 12, fontWeight: '800' },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.textMain,
    fontSize: 14,
    backgroundColor: '#FAFAFC',
  },
  amountInputRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: '#FAFAFC',
  },
  amountInput: { flex: 1, paddingHorizontal: 14, color: colors.textMain, fontSize: 15, fontWeight: '700' },
  wonSuffix: { paddingRight: 14, color: colors.textSub, fontSize: 13, fontWeight: '700' },
  taxBox: { marginTop: 14, padding: 14, borderRadius: 17, backgroundColor: colors.primarySurface },
  amountSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.primaryLight,
  },
  amountSummaryLabel: { color: colors.textSub, fontSize: 10, fontWeight: '700' },
  amountSummaryValue: { marginTop: 4, color: colors.textMain, fontSize: 13, fontWeight: '800' },
  netAmountBox: { alignItems: 'flex-end' },
  netAmount: { marginTop: 4, color: colors.primaryDark, fontSize: 15, fontWeight: '900' },
  saveButton: {
    minHeight: 48,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  saveButtonDisabled: { opacity: 0.55 },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
