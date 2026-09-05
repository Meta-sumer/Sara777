import { useAppNavigation } from '../navTypes';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Field, Logo, PrimaryButton, Row, Txt } from '../ui';

export default function LoginScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { login } = useAuth();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (mobile.length !== 10) return Alert.alert('Login', 'Enter your 10 digit mobile number');
    if (!password) return Alert.alert('Login', 'Enter your password');
    setLoading(true);
    try {
      await login(mobile, password);
    } catch (err) {
      Alert.alert('Login failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 90 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 34 }}>
          <Logo size={30} />
          <Txt size={14} color={colors.textMuted} style={{ marginTop: 12 }}>
            Login to continue
          </Txt>
        </View>

        <Field
          label="Mobile Number"
          icon="phone"
          placeholder="10 digit mobile number"
          keyboardType="number-pad"
          maxLength={10}
          value={mobile}
          onChangeText={setMobile}
        />
        <Field
          label="Password"
          icon="lock"
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <PrimaryButton title="LOGIN" onPress={submit} loading={loading} />

        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Txt
            size={13.5}
            weight="600"
            color={colors.primary}
            style={{ paddingVertical: 8 }}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            Forgot Password?
          </Txt>
        </View>

        <Row style={{ justifyContent: 'center', marginTop: 24 }}>
          <Txt size={14} color={colors.textMuted}>
            New here?{' '}
          </Txt>
          <Txt
            size={14}
            weight="700"
            color={colors.primary}
            onPress={() => navigation.navigate('Register')}
          >
            Create an account
          </Txt>
        </Row>

        <Txt size={11.5} color={colors.textMuted} style={{ textAlign: 'center', marginTop: 36, lineHeight: 17 }}>
          This app runs on virtual coins only. Coins have no real-world value and cannot be exchanged for money.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
