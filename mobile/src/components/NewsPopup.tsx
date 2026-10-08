import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useAuth } from '../auth';
import { radius, useTheme } from '../theme';
import { PrimaryButton, Row, Txt } from '../ui';

const seenKey = (userId: number) => `app.newsSeen.${userId}`;

/**
 * News from the admin panel (News page), shown as a popup after every login
 * and again whenever the admin publishes new text.
 */
export function NewsPopup() {
  const { colors } = useTheme();
  const { user, settings, justLoggedIn, clearJustLoggedIn } = useAuth();
  const [visible, setVisible] = useState(false);
  // remembered in memory as well: the AsyncStorage write may not have landed
  // when the effect re-runs right after closing
  const dismissed = useRef<string | null>(null);

  const userId = user?.id ?? null;
  const news = settings?.news?.trim() ?? '';
  const version = settings?.newsUpdatedAt ?? news;

  useEffect(() => {
    let alive = true;
    if (!userId || !news) {
      setVisible(false);
      return;
    }
    if (justLoggedIn) {
      setVisible(true);
      return;
    }
    if (dismissed.current === version) return;
    (async () => {
      const seen = await AsyncStorage.getItem(seenKey(userId)).catch(() => null);
      if (alive && seen !== version && dismissed.current !== version) setVisible(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, news, version, justLoggedIn]);

  const close = () => {
    dismissed.current = version;
    setVisible(false);
    clearJustLoggedIn();
    if (userId) AsyncStorage.setItem(seenKey(userId), version).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: '75%',
            backgroundColor: colors.card,
            borderRadius: radius.lg,
            overflow: 'hidden',
          }}
        >
          <Row style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Feather name="bell" size={18} color="#FFFFFF" />
            <Txt size={16} weight="800" color="#FFFFFF" style={{ flex: 1, marginLeft: 10 }}>
              News
            </Txt>
            <Pressable onPress={close} hitSlop={10}>
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Txt size={15} style={{ lineHeight: 23 }}>
              {news}
            </Txt>
          </ScrollView>
          <View style={{ padding: 16, paddingTop: 0 }}>
            <PrimaryButton title="OK" onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
