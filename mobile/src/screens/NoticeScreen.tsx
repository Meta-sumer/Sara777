import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Screen, Txt } from '../ui';

export default function NoticeScreen() {
  const { colors } = useTheme();
  const { settings } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Notice Board / Rules" back />
      <Screen scroll>
        <Card>
          <Txt size={16} weight="800" color={colors.primary} style={{ marginBottom: 12 }}>
            Rules
          </Txt>
          <Txt size={14} style={{ lineHeight: 22 }}>
            {settings?.notice || 'No notice published right now.'}
          </Txt>
        </Card>
      </Screen>
    </View>
  );
}
