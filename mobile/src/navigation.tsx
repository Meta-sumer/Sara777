import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  type BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { type DrawerContentComponentProps, createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, Share, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import type { AppParamList } from './navTypes';
import { radius, useTheme } from './theme';
import { Loader, Row, Txt } from './ui';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import HomeScreen from './screens/HomeScreen';
import StarlineScreen from './screens/StarlineScreen';
import GamePlayScreen from './screens/GamePlayScreen';
import PlaceBidScreen from './screens/PlaceBidScreen';
import MyBidsScreen from './screens/MyBidsScreen';
import BidHistoryScreen from './screens/BidHistoryScreen';
import GameResultScreen from './screens/GameResultScreen';
import PassbookScreen from './screens/PassbookScreen';
import FundsScreen from './screens/FundsScreen';
import AddFundScreen from './screens/AddFundScreen';
import WithdrawFundScreen from './screens/WithdrawFundScreen';
import AddBankScreen from './screens/AddBankScreen';
import FundHistoryScreen from './screens/FundHistoryScreen';
import BankHistoryScreen from './screens/BankHistoryScreen';
import SupportScreen from './screens/SupportScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import VideosScreen from './screens/VideosScreen';
import NoticeScreen from './screens/NoticeScreen';
import GameRatesScreen from './screens/GameRatesScreen';
import ChartsScreen from './screens/ChartsScreen';
import ChartDetailScreen from './screens/ChartDetailScreen';
import SubmitIdeaScreen from './screens/SubmitIdeaScreen';
import SettingsScreen from './screens/SettingsScreen';
import MpinScreen from './screens/MpinScreen';
import ProfileScreen from './screens/ProfileScreen';

export type { AppParamList as RootStackParamList } from './navTypes';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

/* ------------------------------------------------------------- bottom tabs */

const TAB_ICONS: Record<string, { lib: 'feather' | 'ion' | 'mci'; name: string; label: string }> = {
  MyBids: { lib: 'mci', name: 'gavel', label: 'My Bids' },
  Passbook: { lib: 'feather', name: 'credit-card', label: 'Passbook' },
  Home: { lib: 'feather', name: 'home', label: 'Home' },
  Funds: { lib: 'mci', name: 'bank', label: 'Funds' },
  Support: { lib: 'feather', name: 'message-circle', label: 'WhatsApp' },
};

function TabIcon({ route, color, size }: { route: string; color: string; size: number }) {
  const cfg = TAB_ICONS[route];
  if (cfg.lib === 'ion') return <Ionicons name={cfg.name as never} size={size} color={color} />;
  if (cfg.lib === 'mci') return <MaterialCommunityIcons name={cfg.name as never} size={size} color={color} />;
  return <Feather name={cfg.name as never} size={size} color={color} />;
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const cfg = TAB_ICONS[route.name];
        const isHome = route.name === 'Home';

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (isHome) {
          return (
            <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  position: 'absolute',
                  top: -30,
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 5,
                  borderColor: colors.bg,
                  shadowColor: colors.shadow,
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                }}
              >
                <Feather name="home" size={26} color="#FFFFFF" />
              </View>
              <View style={{ height: 40 }} />
            </Pressable>
          );
        }

        return (
          <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <TabIcon route={route.name} size={22} color={focused ? colors.primary : colors.textMuted} />
            <Txt size={11.5} weight={focused ? '700' : '500'} color={focused ? colors.primary : colors.textMuted}>
              {cfg.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="MyBids" component={MyBidsScreen} />
      <Tab.Screen name="Passbook" component={PassbookScreen} />
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Funds" component={FundsScreen} />
      <Tab.Screen name="Support" component={SupportScreen} />
    </Tab.Navigator>
  );
}

/* ----------------------------------------------------------- drawer content */

const DRAWER_ITEMS: Array<{
  label: string;
  icon: string;
  lib: 'feather' | 'ion' | 'mci';
  route?: keyof AppParamList;
  tab?: string;
  action?: 'share';
}> = [
  { label: 'Home', icon: 'home', lib: 'feather', tab: 'Home' },
  { label: 'My Bids', icon: 'gavel', lib: 'mci', tab: 'MyBids' },
  { label: 'MPIN', icon: 'lock', lib: 'feather', route: 'Mpin' },
  { label: 'Passbook', icon: 'credit-card', lib: 'feather', tab: 'Passbook' },
  { label: 'WhatsApp', icon: 'message-circle', lib: 'feather', tab: 'Support' },
  { label: 'Funds', icon: 'bank', lib: 'mci', tab: 'Funds' },
  { label: 'Notifications', icon: 'bell', lib: 'feather', route: 'Notifications' },
  { label: 'Videos', icon: 'play', lib: 'feather', route: 'Videos' },
  { label: 'Notice Board / Rules', icon: 'alert-circle', lib: 'feather', route: 'Notice' },
  { label: 'Game Rates', icon: 'clock', lib: 'feather', route: 'GameRates' },
  { label: 'Charts', icon: 'bar-chart-2', lib: 'feather', route: 'Charts' },
  { label: 'Submit Idea', icon: 'lightbulb-outline', lib: 'mci', route: 'SubmitIdea' },
  { label: 'Settings', icon: 'settings', lib: 'feather', route: 'Settings' },
  { label: 'Share Application', icon: 'share-2', lib: 'feather', action: 'share' },
];

function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout, settings } = useAuth();

  const go = (item: (typeof DRAWER_ITEMS)[number]) => {
    navigation.closeDrawer();
    if (item.action === 'share') {
      Share.share({ message: settings?.shareText ?? 'Try this app!' }).catch(() => {});
    } else if (item.tab) {
      navigation.navigate('Tabs', { screen: item.tab });
    } else if (item.route) {
      navigation.navigate(item.route as never);
    }
  };

  const renderIcon = (lib: string, name: string) => {
    if (lib === 'mci') return <MaterialCommunityIcons name={name as never} size={22} color={colors.primary} />;
    if (lib === 'ion') return <Ionicons name={name as never} size={22} color={colors.primary} />;
    return <Feather name={name as never} size={22} color={colors.primary} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row
        style={{
          backgroundColor: colors.primarySoft,
          paddingTop: insets.top + 16,
          paddingBottom: 18,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 1.5,
            borderColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="user" size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Txt size={17} weight="700">
            {user?.name ?? 'Guest'}
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            {user?.mobile ?? ''}
          </Txt>
        </View>
        <Pressable onPress={() => navigation.closeDrawer()} hitSlop={10}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
      </Row>

      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        {DRAWER_ITEMS.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => go(item)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed ? colors.bgAlt : 'transparent',
            })}
          >
            {renderIcon(item.lib, item.icon)}
            <Txt size={15.5} weight="600" style={{ flex: 1, marginLeft: 14 }}>
              {item.label}
            </Txt>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="chevron-right" size={18} color="#FFFFFF" />
            </View>
          </Pressable>
        ))}

        <Pressable
          onPress={() => {
            navigation.closeDrawer();
            logout();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: pressed ? colors.bgAlt : 'transparent',
          })}
        >
          <Feather name="log-out" size={22} color={colors.primary} />
          <Txt size={15.5} weight="600" style={{ flex: 1, marginLeft: 14 }}>
            Logout
          </Txt>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="chevron-right" size={18} color="#FFFFFF" />
          </View>
        </Pressable>

        <Row style={{ justifyContent: 'center', paddingVertical: 20, gap: 10 }}>
          <Txt size={14} weight="700" color={isDark ? colors.textMuted : colors.primary}>
            Light Theme
          </Txt>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ true: colors.primary, false: colors.primary }}
            thumbColor="#FFFFFF"
          />
          <Txt size={14} weight="700" color={isDark ? colors.primary : colors.textMuted}>
            Dark Theme
          </Txt>
        </Row>
      </ScrollView>
    </View>
  );
}

function DrawerNavigator() {
  const { colors } = useTheme();
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { width: '82%', backgroundColor: colors.bg },
        overlayColor: colors.overlay,
      }}
      drawerContent={(props) => <DrawerContent {...props} />}
    >
      <Drawer.Screen name="Tabs" component={Tabs} />
    </Drawer.Navigator>
  );
}

/* ------------------------------------------------------------------- roots */

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Drawer" component={DrawerNavigator} />
      <Stack.Screen name="Starline" component={StarlineScreen} />
      <Stack.Screen name="GamePlay" component={GamePlayScreen} />
      <Stack.Screen name="PlaceBid" component={PlaceBidScreen} />
      <Stack.Screen name="BidHistory" component={BidHistoryScreen} />
      <Stack.Screen name="GameResult" component={GameResultScreen} />
      <Stack.Screen name="AddFund" component={AddFundScreen} />
      <Stack.Screen name="WithdrawFund" component={WithdrawFundScreen} />
      <Stack.Screen name="AddBank" component={AddBankScreen} />
      <Stack.Screen name="FundHistory" component={FundHistoryScreen} />
      <Stack.Screen name="BankHistory" component={BankHistoryScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Videos" component={VideosScreen} />
      <Stack.Screen name="Notice" component={NoticeScreen} />
      <Stack.Screen name="GameRates" component={GameRatesScreen} />
      <Stack.Screen name="Charts" component={ChartsScreen} />
      <Stack.Screen name="ChartDetail" component={ChartDetailScreen} />
      <Stack.Screen name="SubmitIdea" component={SubmitIdeaScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Mpin" component={MpinScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

export function RootNavigation() {
  const { user, booting } = useAuth();
  const { colors, isDark } = useTheme();

  return (
    <NavigationContainer
      theme={{
        dark: isDark,
        colors: {
          primary: colors.primary,
          background: colors.bgAlt,
          card: colors.bg,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      {booting ? <Loader /> : user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

