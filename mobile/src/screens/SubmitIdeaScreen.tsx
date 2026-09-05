import { useAppNavigation } from '../navTypes';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ApiError, api } from '../api';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Field, PrimaryButton, Screen, Txt } from '../ui';

export default function SubmitIdeaScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (text.trim().length < 5) return Alert.alert('Submit Idea', 'Please write your idea');
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/ideas', { text: text.trim() });
      Alert.alert('Thanks!', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
      <Header title="Submit Idea" back />
      <Screen scroll>
        <Card>
          <Txt size={13.5} color={colors.textMuted} style={{ marginBottom: 12, lineHeight: 19 }}>
            Have a suggestion to make the app better? Write it here and our team will read it.
          </Txt>
          <Field
            placeholder="Write your idea..."
            multiline
            numberOfLines={6}
            value={text}
            onChangeText={setText}
            style={{ marginBottom: 16 }}
          />
          <PrimaryButton title="SUBMIT" onPress={submit} loading={loading} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
