import { Feather } from '@expo/vector-icons';

import { useAppNavigation } from '../navTypes';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { ApiError, api } from '../api';
import { useTheme } from '../theme';
import { Field, Logo, PrimaryButton, Txt } from '../ui';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (mobile.length !== 10) return Alert.alert('Reset', 'Enter your 10 digit mobile number');
    if (password.length < 4) return Alert.alert('Reset', 'Password must be at least 4 characters');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { mobile, password });
      Alert.alert('Done', 'Password updated, please login', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={{ marginBottom: 20 }}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>

        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Logo size={30} />
          <Txt size={14} color={colors.textMuted} style={{ marginTop: 12 }}>
            Reset your password
          </Txt>
        </View>

        <Field
          label="Registered Mobile Number"
          icon="phone"
          placeholder="10 digit mobile number"
          keyboardType="number-pad"
          maxLength={10}
          value={mobile}
          onChangeText={setMobile}
        />
        <Field
          label="New Password"
          icon="lock"
          placeholder="New password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <PrimaryButton title="RESET PASSWORD" onPress={submit} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
