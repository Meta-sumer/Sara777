import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { type Market, api } from '../api';
import { Header } from '../components/Header';
import { MarketCard } from '../components/MarketCard';
import { useTheme } from '../theme';
import { Card, EmptyState, Loader, Txt } from '../ui';

/** Andar Bahar: a two-digit (00-99) draw a few times a day, switched on/off from the admin panel. */
export default function AndarBaharScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ markets: Market[]; enabled?: boolean }>('/markets?kind=andarbahar');
      setEnabled(res.enabled !== false);
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
      Alert.alert(market.name, market.statusLabel || 'Bids are closed for this draw.');
      return;
    }
    navigation.navigate('GamePlay', {
      marketId: market.id,
      marketName: market.name,
      kind: market.kind,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Andar Bahar" back />
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
          ListHeaderComponent={
            enabled && markets.length > 0 ? (
              <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary + '55' }}>
                <Txt size={13} color={colors.text} style={{ lineHeight: 19 }}>
                  Pick any number from 00 to 99. If it matches the draw result, you win the game rate shown on
                  the play screen.
                </Txt>
              </Card>
            ) : null
          }
          renderItem={({ item }) => <MarketCard market={item} onPlay={() => openMarket(item)} />}
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              text={enabled ? 'No Andar Bahar draws available' : 'Andar Bahar is not available right now'}
            />
          }
        />
      )}
    </View>
  );
}
