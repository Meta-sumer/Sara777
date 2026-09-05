import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { ApiError, type BankDetails, api, formatCoins } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Field, PrimaryButton, Row, Screen, Txt } from '../ui';

export default function WithdrawFundScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { user, refreshUser, settings } = useAuth();
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const min = settings?.minWithdraw ?? 500;

  const loadBank = useCallback(async () => {
    try {
      const res = await api.get<{ bank: BankDetails | null }>('/wallet/bank');
      setBank(res.bank);
    } catch {
      setBank(null);
    }
  }, []);

  useEffect(() => {
    loadBank();
  }, [loadBank]);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < min) {
      return Alert.alert('Withdraw', `Minimum withdraw amount is ${min} coins`);
    }
    if (value > (user?.balance ?? 0)) return Alert.alert('Withdraw', 'Insufficient balance');
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/wallet/withdraw', { amount: value });
      await refreshUser();
      Alert.alert('Withdraw', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Withdraw Fund" back />
      <Screen scroll>
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary + '55' }}>
          <Txt size={13} color={colors.textMuted}>
            Withdrawable balance
          </Txt>
          <Txt size={28} weight="800" color={colors.primary} style={{ marginTop: 4 }}>
            {formatCoins(user?.balance ?? 0)} coins
          </Txt>
        </Card>

        {bank ? (
          <Card>
            <Txt size={14} weight="700" style={{ marginBottom: 8 }}>
              Payout details
            </Txt>
            {bank.bankName ? (
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Txt size={13} color={colors.textMuted}>
                  {bank.bankName}
                </Txt>
                <Txt size={13} weight="600">
                  {bank.accountNo}
                </Txt>
              </Row>
            ) : null}
            {bank.paytm || bank.phonepe || bank.gpay ? (
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Txt size={13} color={colors.textMuted}>
                  UPI
                </Txt>
                <Txt size={13} weight="600">
                  {bank.paytm || bank.phonepe || bank.gpay}
                </Txt>
              </Row>
            ) : null}
          </Card>
        ) : (
          <Card>
            <Txt size={14} weight="700" style={{ marginBottom: 6 }}>
              No payout details
            </Txt>
            <Txt size={13} color={colors.textMuted} style={{ marginBottom: 12 }}>
              Add your payout details before requesting a withdrawal.
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
          <PrimaryButton title="REQUEST WITHDRAW" onPress={submit} loading={loading} disabled={!bank} />
        </Card>

        <Txt size={12.5} color={colors.textMuted} style={{ lineHeight: 19, paddingHorizontal: 4 }}>
          Withdrawals are virtual: the coins are put on hold and an operator marks the request approved or
          rejected. No real money is transferred.
        </Txt>
      </Screen>
    </View>
  );
}
