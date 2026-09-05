import { Feather, Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { useAppNavigation } from '../navTypes';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCoins } from '../api';
import { useAuth } from '../auth';
import { radius, useTheme } from '../theme';
import { Logo, Row, Txt } from '../ui';

export function Header({
  title,
  showLogo = false,
  back = false,
  onRefresh,
}: {
  title?: string;
  showLogo?: boolean;
  back?: boolean;
  onRefresh?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const { user } = useAuth();

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 14,
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Row>
        {back ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={{ marginRight: 12 }}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            hitSlop={10}
            style={{ marginRight: 12 }}
          >
            <Feather name="menu" size={24} color={colors.text} />
          </Pressable>
        )}

        {showLogo ? <Logo /> : null}
        {title ? (
          <Txt size={20} weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Txt>
        ) : null}

        <View style={{ flex: 1 }} />

        {onRefresh ? (
          <Pressable onPress={onRefresh} hitSlop={10}>
            <Feather name="refresh-cw" size={20} color={colors.primary} />
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => navigation.navigate('AddFund')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: radius.sm,
                paddingHorizontal: 6,
                paddingVertical: 3,
              }}
            >
              <Ionicons name="wallet-outline" size={20} color={colors.primary} />
              <Txt size={15} weight="700" color={colors.primary} style={{ marginLeft: 4 }}>
                ₹{formatCoins(user?.balance ?? 0)}
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              hitSlop={10}
              style={{ marginLeft: 16 }}
            >
              <Feather name="bell" size={22} color={colors.text} />
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: colors.primary,
                }}
              />
            </Pressable>
          </>
        )}
      </Row>
    </View>
  );
}
