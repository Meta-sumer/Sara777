import { Feather } from '@expo/vector-icons';
import { type RouteProp, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { api, formatDate } from '../api';
import { Header } from '../components/Header';
import type { AppParamList } from '../navTypes';
import { radius, useTheme } from '../theme';
import { Card, EmptyState, Loader, Row, Txt } from '../ui';

interface DayResult {
  marketId: number;
  marketName: string;
  openTimeLabel: string;
  closeTimeLabel: string;
  display: string;
}

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function GameResultScreen() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<AppParamList, 'GameResult'>>();
  const kind = route.params?.kind ?? 'main';

  const [date, setDate] = useState(() => new Date());
  const [results, setResults] = useState<DayResult[] | null>(null);

  const load = useCallback(async () => {
    setResults(null);
    try {
      const res = await api.get<{ results: DayResult[] }>(
        `/markets/results/by-date?kind=${kind}&date=${isoDate(date)}`,
      );
      setResults(res.results);
    } catch {
      setResults([]);
    }
  }, [kind, date]);

  useEffect(() => {
    load();
  }, [load]);

  const shift = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    if (next > new Date()) return;
    setDate(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header
        title={kind === 'starline' ? 'Starline Result' : kind === 'andarbahar' ? 'Andar Bahar Result' : 'Game Result'}
        back
      />

      <Row
        style={{
          justifyContent: 'space-between',
          padding: 12,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => shift(-1)}
          style={{ padding: 8, borderRadius: radius.sm, backgroundColor: colors.primarySoft }}
        >
          <Feather name="chevron-left" size={20} color={colors.primary} />
        </Pressable>
        <Txt size={15} weight="700">
          {formatDate(isoDate(date))}
        </Txt>
        <Pressable
          onPress={() => shift(1)}
          style={{ padding: 8, borderRadius: radius.sm, backgroundColor: colors.primarySoft }}
        >
          <Feather name="chevron-right" size={20} color={colors.primary} />
        </Pressable>
      </Row>

      {!results ? (
        <Loader />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => String(r.marketId)}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt size={15.5} weight="800" numberOfLines={1}>
                    {item.marketName}
                  </Txt>
                  <Txt size={12} color={colors.textMuted} style={{ marginTop: 4 }}>
                    {kind === 'main' ? `${item.openTimeLabel} - ${item.closeTimeLabel}` : `Result: ${item.closeTimeLabel}`}
                  </Txt>
                </View>
                <Txt size={16} weight="800" color={colors.primary}>
                  {item.display}
                </Txt>
              </Row>
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="bar-chart-2" text="No results for this day" />}
        />
      )}
    </View>
  );
}
