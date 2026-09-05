import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { type Market, api } from '../api';
import { Header } from '../components/Header';
import { MarketCard } from '../components/MarketCard';
import { useTheme } from '../theme';
import { EmptyState, Loader } from '../ui';

export default function StarlineScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ markets: Market[] }>('/markets?kind=starline');
      setMarkets(res.markets);
    } catch {
      setMarkets([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const openMarket = (market: Market) => {
    if (!market.isPlayable) {
      Alert.alert(market.name, 'Bids are closed for this game.');
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
      <Header title="King Starline" back />
      {markets === null ? (
        <Loader />
      ) : (
        <FlatList
          data={markets}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 28 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => <MarketCard market={item} onPlay={() => openMarket(item)} />}
          ListEmptyComponent={<EmptyState icon="calendar" text="No starline games available" />}
        />
      )}
    </View>
  );
}
