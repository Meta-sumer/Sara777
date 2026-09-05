import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, View } from 'react-native';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { radius, useTheme } from '../theme';
import { Card, EmptyState, Row, Screen, Txt } from '../ui';

export default function VideosScreen() {
  const { colors } = useTheme();
  const { settings } = useAuth();
  const videos = settings?.videos ?? [];

  const open = async (url: string) => {
    const ok = await Linking.canOpenURL(url);
    if (ok) Linking.openURL(url);
    else Alert.alert('Videos', 'Could not open this link');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Videos" back />
      <Screen scroll>
        {videos.length === 0 ? (
          <EmptyState icon="video" text="No videos added yet" />
        ) : (
          videos.map((v) => (
            <Card key={v.url + v.title} onPress={() => open(v.url)}>
              <Row>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: radius.md,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="play" size={22} color={colors.primary} />
                </View>
                <Txt size={15} weight="700" style={{ flex: 1, marginLeft: 14 }} numberOfLines={2}>
                  {v.title}
                </Txt>
                <Feather name="external-link" size={20} color={colors.primary} />
              </Row>
            </Card>
          ))
        )}
      </Screen>
    </View>
  );
}
