import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, View } from 'react-native';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, EmptyState, PrimaryButton, Row, Screen, Txt } from '../ui';

/** App Settings → How To Play: a title, the rules text and a video link. */
export default function HowToPlayScreen() {
  const { colors } = useTheme();
  const { settings } = useAuth();
  const info = settings?.howToPlay;
  const hasContent = !!(info && (info.title || info.description || info.videoUrl));

  const openVideo = async () => {
    if (!info?.videoUrl) return;
    try {
      await Linking.openURL(info.videoUrl);
    } catch {
      Alert.alert('How to Play', 'Could not open the video link');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="How to Play" back />
      <Screen scroll>
        {!hasContent ? (
          <EmptyState icon="help-circle" text="How to play guide is not published yet" />
        ) : (
          <>
            <Card>
              {info?.title ? (
                <Txt size={17} weight="800" color={colors.primary} style={{ marginBottom: 10 }}>
                  {info.title}
                </Txt>
              ) : null}
              {info?.description ? (
                <Txt size={14} style={{ lineHeight: 22 }}>
                  {info.description}
                </Txt>
              ) : null}
            </Card>

            {info?.videoUrl ? (
              <Card onPress={openVideo}>
                <Row>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      backgroundColor: '#FF0000',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="play" size={22} color="#FFFFFF" style={{ marginLeft: 2 }} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Txt size={15} weight="700">
                      Watch the video
                    </Txt>
                    <Txt size={12} color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
                      {info.videoUrl}
                    </Txt>
                  </View>
                  <Feather name="external-link" size={20} color={colors.primary} />
                </Row>
              </Card>
            ) : null}

            {info?.videoUrl ? <PrimaryButton title="WATCH ON YOUTUBE" onPress={openVideo} /> : null}
          </>
        )}
      </Screen>
    </View>
  );
}
