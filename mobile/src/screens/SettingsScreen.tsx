import React from 'react';
import { Alert, Share, Switch, View } from 'react-native';

import { useAppNavigation } from '../navTypes';
import { API_URL } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, MenuItem, Row, Screen, Txt } from '../ui';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const navigation = useAppNavigation();
  const { settings, logout, user } = useAuth();

  const share = async () => {
    try {
      await Share.share({ message: settings?.shareText ?? 'Try this app!' });
    } catch {
      Alert.alert('Share', 'Could not open the share sheet');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Settings" back />
      <Screen scroll>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt size={15} weight="700">
                Dark Theme
              </Txt>
              <Txt size={12.5} color={colors.textMuted} style={{ marginTop: 2 }}>
                Switch between light and dark
              </Txt>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#FFFFFF"
            />
          </Row>
        </Card>

        <MenuItem icon="user" title="Profile" subtitle="Update your name" onPress={() => navigation.navigate('Profile')} />
        <MenuItem icon="lock" title="MPIN" subtitle="Set or change your 4 digit MPIN" onPress={() => navigation.navigate('Mpin')} />
        <MenuItem icon="share-2" title="Share Application" subtitle="Invite your friends" onPress={share} />
        <MenuItem
          icon="log-out"
          title="Logout"
          subtitle={user?.mobile ?? ''}
          onPress={() =>
            Alert.alert('Logout', 'Do you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: logout },
            ])
          }
        />

        <Txt size={11.5} color={colors.textMuted} style={{ textAlign: 'center', marginTop: 12 }}>
          API: {API_URL}
        </Txt>
      </Screen>
    </View>
  );
}
