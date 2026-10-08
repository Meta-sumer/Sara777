import { Feather } from '@expo/vector-icons';

import { useAppNavigation } from '../navTypes';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { type Market, type MarketKind, api } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { radius, useTheme } from '../theme';
import { EmptyState, Loader, Row, Txt } from '../ui';

export default function ChartsScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [kind, setKind] = useState<MarketKind>('main');
  const { settings } = useAuth();
  const kinds: MarketKind[] = settings?.andarBaharEnabled === false ? ['main', 'starline'] : ['main', 'starline', 'andarbahar'];

  useEffect(() => {
    setMarkets(null);
    api
      .get<{ markets: Market[] }>(`/markets?kind=${kind}`)
      .then((res) => setMarkets(res.markets))
      .catch(() => setMarkets([]));
  }, [kind]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Charts" back />

      <Row style={{ padding: 12, gap: 10 }}>
        {kinds.map((k) => {
          const active = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: radius.md,
                alignItems: 'center',
                backgroundColor: active ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
              }}
            >
              <Txt size={14} weight="700" color={active ? '#FFFFFF' : colors.textMuted}>
                {k === 'main' ? 'Market' : k === 'starline' ? 'Starline' : 'Andar Bahar'}
              </Txt>
            </Pressable>
          );
        })}
      </Row>

      {!markets ? (
        <Loader />
      ) : (
        <FlatList
          data={markets}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('ChartDetail' , {
                  marketId: item.id,
                  marketName: item.name,
                  kind: item.kind,
                })
              }
              style={({ pressed }) => ({
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                padding: 16,
                marginBottom: 10,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Row>
                <Txt size={15} weight="700" style={{ flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Txt>
                <Feather name="chevron-right" size={20} color={colors.primary} />
              </Row>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="bar-chart-2" text="No charts available" />}
        />
      )}
    </View>
  );
}
