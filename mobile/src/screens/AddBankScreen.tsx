import { useAppNavigation } from '../navTypes';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ApiError, type BankDetails, api } from '../api';
import { useAuth } from '../auth';
import { ProfileNote } from '../components/AppContent';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Field, PrimaryButton, Screen, Txt } from '../ui';

export default function AddBankScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { settings } = useAuth();
  const [form, setForm] = useState({
    holderName: '',
    bankName: '',
    accountNo: '',
    ifsc: '',
    paytm: '',
    phonepe: '',
    gpay: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ bank: BankDetails | null }>('/wallet/bank')
      .then((res) => {
        if (res.bank) {
          setForm({
            holderName: res.bank.holderName ?? '',
            bankName: res.bank.bankName ?? '',
            accountNo: res.bank.accountNo ?? '',
            ifsc: res.bank.ifsc ?? '',
            paytm: res.bank.paytm ?? '',
            phonepe: res.bank.phonepe ?? '',
            gpay: res.bank.gpay ?? '',
          });
        }
      })
      .catch(() => {});
  }, []);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/wallet/bank', form);
      Alert.alert('Saved', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgAlt }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Add Bank Details" back />
      <Screen scroll>
        <ProfileNote note={settings?.profileNote} />
        <Card>
          <Txt size={14} weight="700" style={{ marginBottom: 12 }}>
            Bank account
          </Txt>
          <Field label="Account Holder Name" icon="user" value={form.holderName} onChangeText={set('holderName')} />
          <Field label="Bank Name" icon="home" value={form.bankName} onChangeText={set('bankName')} />
          <Field
            label="Account Number"
            icon="hash"
            keyboardType="number-pad"
            value={form.accountNo}
            onChangeText={set('accountNo')}
          />
          <Field
            label="IFSC Code"
            icon="code"
            autoCapitalize="characters"
            maxLength={11}
            value={form.ifsc}
            onChangeText={set('ifsc')}
          />
        </Card>

        <Card>
          <Txt size={14} weight="700" style={{ marginBottom: 12 }}>
            UPI numbers (optional)
          </Txt>
          <Field
            label="Paytm"
            icon="smartphone"
            keyboardType="number-pad"
            maxLength={10}
            value={form.paytm}
            onChangeText={set('paytm')}
          />
          <Field
            label="PhonePe"
            icon="smartphone"
            keyboardType="number-pad"
            maxLength={10}
            value={form.phonepe}
            onChangeText={set('phonepe')}
          />
          <Field
            label="Google Pay"
            icon="smartphone"
            keyboardType="number-pad"
            maxLength={10}
            value={form.gpay}
            onChangeText={set('gpay')}
          />
          <PrimaryButton title="SAVE DETAILS" onPress={submit} loading={loading} />
        </Card>

        <Txt size={12.5} color={colors.textMuted} style={{ lineHeight: 19, paddingHorizontal: 4 }}>
          Details are stored for the virtual payout queue only — no payment is processed by this app.
        </Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
