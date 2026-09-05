import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { ApiError, api, assetUrl, formatCoins } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useAppNavigation } from '../navTypes';
import { radius, useTheme } from '../theme';
import { Card, Field, PrimaryButton, Row, Screen, Txt } from '../ui';

const QUICK = [100, 500, 1000, 2000, 5000, 10000];

export default function AddFundScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { user, refreshUser, settings } = useAuth();
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [proof, setProof] = useState<{ uri: string; base64: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const min = settings?.minDeposit ?? 100;
  const payment = settings?.payment;
  const needsProof = !!payment?.requireProof && !payment?.autoApprove;
  const qr = assetUrl(payment?.qrUrl);

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const pickProof = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return Alert.alert('Permission needed', 'Allow photo access to attach your payment screenshot.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    setProof({ uri: asset.uri, base64: `data:image/jpeg;base64,${asset.base64}` });
  };

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < min) {
      return Alert.alert('Add coins', `Minimum add amount is ${min} coins`);
    }
    if (needsProof) {
      if (!/^[A-Za-z0-9]{6,30}$/.test(utr.trim())) {
        return Alert.alert('UTR needed', 'Enter the UTR / reference number shown in your payment app');
      }
      if (!proof) return Alert.alert('Screenshot needed', 'Attach a screenshot of your payment');
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/wallet/deposit', {
        amount: value,
        method: 'upi',
        utr: utr.trim(),
        proof: proof?.base64,
      });
      await refreshUser();
      Alert.alert('Add coins', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const payLine = (label: string, value: string) => (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
      <Txt size={13} color={colors.textMuted}>
        {label}
      </Txt>
      <Row style={{ gap: 10 }}>
        <Txt size={14} weight="700">
          {value}
        </Txt>
        <Pressable onPress={() => copy(value, label)} hitSlop={8}>
          <Feather name="copy" size={17} color={colors.primary} />
        </Pressable>
      </Row>
    </Row>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgAlt }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Add Fund" back />
      <Screen scroll>
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary + '55' }}>
          <Txt size={13} color={colors.textMuted}>
            Current balance
          </Txt>
          <Txt size={28} weight="800" color={colors.primary} style={{ marginTop: 4 }}>
            {formatCoins(user?.balance ?? 0)} coins
          </Txt>
        </Card>

        {payment && (payment.upiId || qr) ? (
          <Card>
            <Txt size={15} weight="800" style={{ marginBottom: 10 }}>
              Pay here
            </Txt>

            {qr ? (
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <Image
                  source={{ uri: qr }}
                  style={{
                    width: 210,
                    height: 210,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  resizeMode="contain"
                />
              </View>
            ) : null}

            {payment.upiId ? payLine('UPI ID', payment.upiId) : null}
            {payment.upiNumber ? payLine('UPI number', payment.upiNumber) : null}
            {payment.upiName ? (
              <Row style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
                <Txt size={13} color={colors.textMuted}>
                  Account name
                </Txt>
                <Txt size={14} weight="700">
                  {payment.upiName}
                </Txt>
              </Row>
            ) : null}

            {payment.note ? (
              <Txt size={12.5} color={colors.textMuted} style={{ marginTop: 10, lineHeight: 19 }}>
                {payment.note}
              </Txt>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <Field
            label="Amount"
            icon="plus-circle"
            placeholder={`Minimum ${min} coins`}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />

          <Row style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {QUICK.map((q) => (
              <Pressable
                key={q}
                onPress={() => setAmount(String(q))}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgAlt,
                }}
              >
                <Txt size={13.5} weight="700">
                  {formatCoins(q)}
                </Txt>
              </Pressable>
            ))}
          </Row>

          {needsProof ? (
            <>
              <Field
                label="UTR / Reference number"
                icon="hash"
                placeholder="e.g. 412345678901"
                autoCapitalize="characters"
                maxLength={30}
                value={utr}
                onChangeText={setUtr}
              />

              <Txt size={13} weight="600" color={colors.textMuted} style={{ marginBottom: 6 }}>
                Payment screenshot
              </Txt>
              <Pressable
                onPress={pickProof}
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: proof ? colors.primary : colors.border,
                  borderRadius: radius.md,
                  padding: proof ? 10 : 22,
                  alignItems: 'center',
                  marginBottom: 16,
                  backgroundColor: colors.bgAlt,
                }}
              >
                {proof ? (
                  <>
                    <Image
                      source={{ uri: proof.uri }}
                      style={{ width: '100%', height: 190, borderRadius: radius.sm }}
                      resizeMode="contain"
                    />
                    <Txt size={12.5} color={colors.primary} weight="700" style={{ marginTop: 10 }}>
                      Tap to change
                    </Txt>
                  </>
                ) : (
                  <>
                    <Feather name="upload" size={26} color={colors.primary} />
                    <Txt size={13.5} weight="600" style={{ marginTop: 8 }}>
                      Attach payment screenshot
                    </Txt>
                    <Txt size={12} color={colors.textMuted} style={{ marginTop: 3 }}>
                      JPG or PNG
                    </Txt>
                  </>
                )}
              </Pressable>
            </>
          ) : null}

          <PrimaryButton
            title={needsProof ? 'SUBMIT REQUEST' : 'ADD COINS'}
            onPress={submit}
            loading={loading}
          />
        </Card>

        <Txt size={12.5} color={colors.textMuted} style={{ lineHeight: 19, paddingHorizontal: 4 }}>
          {needsProof
            ? 'Your request goes to the admin for verification. Coins are credited once your payment is confirmed.'
            : 'These are virtual coins used only inside this app. They carry no monetary value and cannot be exchanged for money.'}
        </Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
