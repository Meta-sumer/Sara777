import { useAppNavigation } from '../navTypes';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Field, PrimaryButton, Screen, Txt } from '../ui';

export default function MpinScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { user, refreshUser } = useAuth();
  const hasMpin = !!user?.hasMpin;

  const [oldMpin, setOldMpin] = useState('');
  const [mpin, setMpin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (hasMpin && oldMpin.length !== 4) return Alert.alert('MPIN', 'Enter your current 4 digit MPIN');
    if (mpin.length !== 4) return Alert.alert('MPIN', 'MPIN must be 4 digits');
    if (mpin !== confirm) return Alert.alert('MPIN', 'MPIN does not match');
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/auth/mpin', { mpin, oldMpin });
      await refreshUser();
      Alert.alert('MPIN', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
      <Header title="MPIN" back />
      <Screen scroll>
        <Card>
          <Txt size={13.5} color={colors.textMuted} style={{ marginBottom: 14, lineHeight: 19 }}>
            {hasMpin
              ? 'Change your 4 digit MPIN.'
              : 'Set a 4 digit MPIN to protect sensitive actions in the app.'}
          </Txt>

          {hasMpin ? (
            <Field
              label="Current MPIN"
              icon="lock"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              value={oldMpin}
              onChangeText={setOldMpin}
            />
          ) : null}

          <Field
            label="New MPIN"
            icon="lock"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            value={mpin}
            onChangeText={setMpin}
          />
          <Field
            label="Confirm MPIN"
            icon="lock"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />

          <PrimaryButton title={hasMpin ? 'CHANGE MPIN' : 'SET MPIN'} onPress={submit} loading={loading} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
