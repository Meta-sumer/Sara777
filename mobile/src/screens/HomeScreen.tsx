import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { ApiError, type Market, api } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { MarketCard } from '../components/MarketCard';
import { radius, useTheme } from '../theme';
import { EmptyState, Loader, Marquee, Row, Txt } from '../ui';

export default function HomeScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { settings, refreshUser } = useAuth();
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ markets: Market[] }>('/markets?kind=main');
      setMarkets(res.markets);
    } catch (err) {
      setMarkets([]);
      if (err instanceof ApiError && err.status === 0) {
        Alert.alert('Connection', err.message);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshUser();
    }, [load, refreshUser]),
  );

  // markets flip between open/closed on the clock — keep the list honest
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshUser()]);
    setRefreshing(false);
  };

  const openMarket = (market: Market) => {
    if (!market.isPlayable) {
      Alert.alert(market.name, 'Betting is closed for today. Please try the next market.');
      return;
    }
    navigation.navigate('GamePlay' , {
      marketId: market.id,
      marketName: market.name,
      kind: market.kind,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header showLogo />
      <Marquee text={settings?.marquee ?? 'Beware of fake applications'} />

      {markets === null ? (
        <Loader />
      ) : (
        <FlatList
          data={markets}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 28 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <Pressable
              onPress={() => navigation.navigate('Starline')}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
                paddingVertical: 14,
                paddingHorizontal: 16,
                marginBottom: 16,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Row>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="play" size={20} color={colors.primary} style={{ marginLeft: 3 }} />
                </View>
                <Txt size={22} weight="800" color="#FFFFFF" style={{ flex: 1, textAlign: 'center' }}>
                  King Starline
                </Txt>
                <View style={{ width: 42 }} />
              </Row>
            </Pressable>
          }
          renderItem={({ item }) => <MarketCard market={item} onPlay={() => openMarket(item)} />}
          ListEmptyComponent={<EmptyState icon="calendar" text="No markets available right now" />}
        />
      )}
    </View>
  );
}
