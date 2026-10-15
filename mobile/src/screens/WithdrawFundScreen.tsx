import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';
import { ApiError, type BankDetails, type WithdrawStatus, api, formatCoins } from '../api';
import { useAuth } from '../auth';
import { NoticeSections, WalletContacts } from '../components/AppContent';
import { Header } from '../components/Header';
import { radius, useTheme } from '../theme';
import { Card, Field, PrimaryButton, Row, Screen, Txt } from '../ui';

type PayoutMode = 'bank' | 'paytm';

export default function WithdrawFundScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { user, refreshUser, settings } = useAuth();
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [status, setStatus] = useState<WithdrawStatus | null>(null);
  const [mode, setMode] = useState<PayoutMode>('bank');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const min = status?.minWithdraw ?? settings?.minWithdraw ?? 500;
  const hasBank = !!(bank?.accountNo && bank?.ifsc);
  const hasPaytm = !!bank?.paytm;
  const closed = status ? !status.open : false;

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([
      api.get<{ bank: BankDetails | null }>('/wallet/bank').catch(() => ({ bank: null })),
      api.get<WithdrawStatus>('/wallet/withdraw-status').catch(() => null),
    ]);
    setBank(b.bank);
    setStatus(s);
    // default to bank transfer; Paytm when that is all the user has saved
    if (b.bank) setMode(b.bank.accountNo && b.bank.ifsc ? 'bank' : 'paytm');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (closed) return Alert.alert('Withdraw', status?.message ?? 'Withdraw requests are closed today');
    const value = Number(amount);
    if (!Number.isFinite(value) || value < min) {
      return Alert.alert('Withdraw', `Minimum withdraw amount is ${min} coins`);
    }
    if (value > (user?.balance ?? 0)) return Alert.alert('Withdraw', 'Insufficient balance');
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/wallet/withdraw', { amount: value, mode });
      await refreshUser();
      Alert.alert('Withdraw', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const modeButton = (value: PayoutMode, label: string, detail: string) => {
    const active = mode === value;
    return (
      <Pressable
        key={value}
        onPress={() => setMode(value)}
        style={{
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 8,
          borderRadius: radius.md,
          alignItems: 'center',
          backgroundColor: active ? colors.primary : colors.bgAlt,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.border,
        }}
      >
        <Txt size={14} weight="700" color={active ? '#FFFFFF' : colors.text}>
          {label}
        </Txt>
        <Txt size={11.5} color={active ? '#FFFFFF' : colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
          {detail}
        </Txt>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Withdraw Fund" back />
      <Screen
        scroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), refreshUser()]);
              setRefreshing(false);
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary + '55' }}>
          <Txt size={13} color={colors.textMuted}>
            Withdrawable balance
          </Txt>
          <Txt size={28} weight="800" color={colors.primary} style={{ marginTop: 4 }}>
            {formatCoins(user?.balance ?? 0)} coins
          </Txt>
        </Card>

        {closed ? (
          // no shadow: Android draws elevation through a see-through background as a grey box
          <Card
            style={{
              backgroundColor: colors.danger + '15',
              borderColor: colors.danger + '55',
              elevation: 0,
              shadowOpacity: 0,
            }}
          >
            <Txt size={14} weight="800" color={colors.danger} style={{ marginBottom: 4 }}>
              Withdraw is closed today{status?.dayName ? ` (${status.dayName})` : ''}
            </Txt>
            <Txt size={13.5} style={{ lineHeight: 20 }}>
              {status?.message}
            </Txt>
          </Card>
        ) : null}

        {bank && (hasBank || hasPaytm) ? (
          <Card>
            <Txt size={14} weight="700" style={{ marginBottom: 10 }}>
              Pay me by
            </Txt>
            <Row style={{ gap: 10 }}>
              {hasBank ? modeButton('bank', 'Bank Transfer', `${bank.bankName} · ${bank.accountNo}`) : null}
              {hasPaytm ? modeButton('paytm', 'Paytm', bank.paytm) : null}
            </Row>
          </Card>
        ) : (
          <Card>
            <Txt size={14} weight="700" style={{ marginBottom: 6 }}>
              No payout details
            </Txt>
            <Txt size={13} color={colors.textMuted} style={{ marginBottom: 12 }}>
              Add your bank account or Paytm number before requesting a withdrawal.
            </Txt>
            <PrimaryButton
              title="ADD DETAILS"
              variant="outline"
              onPress={() => navigation.navigate('AddBank')}
            />
          </Card>
        )}

        <Card>
          <Field
            label="Amount"
            icon="minus-circle"
            placeholder={`Minimum ${min} coins`}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <PrimaryButton
            title="REQUEST WITHDRAW"
            onPress={submit}
            loading={loading}
            disabled={!bank || !(hasBank || hasPaytm) || closed}
          />
        </Card>

        <NoticeSections sections={settings?.noticeBoard ?? []} />
        <WalletContacts contacts={settings?.walletContacts} />

        <Txt size={12.5} color={colors.textMuted} style={{ lineHeight: 19, paddingHorizontal: 4 }}>
          Withdrawals are virtual: the coins are put on hold and an operator marks the request approved or
          rejected. No real money is transferred.
        </Txt>
      </Screen>
    </View>
  );
}
