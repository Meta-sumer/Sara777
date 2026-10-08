import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth';
import { NoticeSections, WalletContacts } from '../components/AppContent';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Screen, Txt } from '../ui';

export default function NoticeScreen() {
  const { colors } = useTheme();
  const { settings } = useAuth();
  const sections = settings?.noticeBoard ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Notice Board / Rules" back />
      <Screen scroll>
        {sections.length > 0 ? (
          <NoticeSections sections={sections} />
        ) : (
          <Card>
            <Txt size={16} weight="800" color={colors.primary} style={{ marginBottom: 12 }}>
              Rules
            </Txt>
            <Txt size={14} style={{ lineHeight: 22 }}>
              {settings?.notice || 'No notice published right now.'}
            </Txt>
          </Card>
        )}
        <WalletContacts contacts={settings?.walletContacts} />
      </Screen>
    </View>
  );
}
