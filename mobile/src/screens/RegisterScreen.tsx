import { Feather } from '@expo/vector-icons';

import { useAppNavigation } from '../navTypes';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Field, Logo, PrimaryButton, Row, Txt } from '../ui';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert('Register', 'Enter your name');
    if (mobile.length !== 10) return Alert.alert('Register', 'Enter your 10 digit mobile number');
    if (password.length < 4) return Alert.alert('Register', 'Password must be at least 4 characters');
    if (password !== confirm) return Alert.alert('Register', 'Passwords do not match');
    setLoading(true);
    try {
      await register(name.trim(), mobile, password);
    } catch (err) {
      Alert.alert('Register failed', err instanceof ApiError ? err.message : 'Something went wrong');
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
            Create your account
          </Txt>
        </View>

        <Field label="Name" icon="user" placeholder="Your name" value={name} onChangeText={setName} />
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
          placeholder="Create a password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Field
          label="Confirm Password"
          icon="lock"
          placeholder="Re-enter password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        <PrimaryButton title="REGISTER" onPress={submit} loading={loading} />

        <Row style={{ justifyContent: 'center', marginTop: 22 }}>
          <Txt size={14} color={colors.textMuted}>
            Already registered?{' '}
          </Txt>
          <Txt size={14} weight="700" color={colors.primary} onPress={() => navigation.goBack()}>
            Login
          </Txt>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
