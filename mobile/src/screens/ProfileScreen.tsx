import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ApiError, type User, api, formatCoins } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Field, PrimaryButton, Row, Screen, Txt } from '../ui';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async () => {
    if (name.trim().length < 2) return Alert.alert('Profile', 'Enter your name');
    setSavingName(true);
    try {
      const res = await api.patch<{ user: User }>('/auth/me', { name: name.trim() });
      setUser(res.user);
      Alert.alert('Profile', 'Name updated');
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    if (!oldPassword || newPassword.length < 4) {
      return Alert.alert('Password', 'Enter your current password and a new one (min 4 characters)');
    }
    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      Alert.alert('Password', 'Password changed');
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgAlt }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Profile" back />
      <Screen scroll>
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary + '55' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt size={18} weight="800">
                {user?.name}
              </Txt>
              <Txt size={13} color={colors.textMuted} style={{ marginTop: 2 }}>
                {user?.mobile}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt size={12} color={colors.textMuted}>
                Balance
              </Txt>
              <Txt size={18} weight="800" color={colors.primary}>
                {formatCoins(user?.balance ?? 0)}
              </Txt>
            </View>
          </Row>
        </Card>

        <Card>
          <Field label="Name" icon="user" value={name} onChangeText={setName} />
          <PrimaryButton title="SAVE NAME" onPress={saveName} loading={savingName} />
        </Card>

        <Card>
          <Txt size={14} weight="700" style={{ marginBottom: 12 }}>
            Change password
          </Txt>
          <Field
            label="Current Password"
            icon="lock"
            secureTextEntry
            value={oldPassword}
            onChangeText={setOldPassword}
          />
          <Field
            label="New Password"
            icon="lock"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <PrimaryButton title="CHANGE PASSWORD" onPress={savePassword} loading={savingPassword} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
