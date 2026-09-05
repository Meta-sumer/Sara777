import { type RouteProp, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { type ResultRowItem, api, formatDate } from '../api';
import { Header } from '../components/Header';
import type { AppParamList } from '../navTypes';
import { useTheme } from '../theme';
import { EmptyState, Loader, Row, Txt, tableHeaderStyle } from '../ui';

export default function ChartDetailScreen() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<AppParamList, 'ChartDetail'>>();
  const { marketId, marketName, kind } = route.params;
  const [rows, setRows] = useState<ResultRowItem[] | null>(null);

  useEffect(() => {
    api
      .get<{ results: ResultRowItem[] }>(`/markets/${marketId}/results?limit=120`)
      .then((res) => setRows(res.results))
      .catch(() => setRows([]));
  }, [marketId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title={marketName} back />

      <Row style={tableHeaderStyle(colors)}>
        <Txt size={13.5} weight="700" style={{ flex: 1, padding: 12 }}>
          Date
        </Txt>
        <Txt size={13.5} weight="700" style={{ flex: 1.4, padding: 12, textAlign: 'center' }}>
          Result
        </Txt>
        {kind === 'main' ? (
          <Txt size={13.5} weight="700" style={{ width: 64, padding: 12, textAlign: 'center' }}>
            Jodi
          </Txt>
        ) : null}
      </Row>

      {!rows ? (
        <Loader />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.date}
          renderItem={({ item, index }) => (
            <Row
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: index % 2 ? colors.bgAlt : colors.card,
              }}
            >
              <Txt size={13} color={colors.textMuted} style={{ flex: 1, padding: 12 }}>
                {formatDate(item.date)}
              </Txt>
              <Txt
                size={14.5}
                weight="700"
                color={colors.primary}
                style={{ flex: 1.4, padding: 12, textAlign: 'center' }}
              >
                {item.display}
              </Txt>
              {kind === 'main' ? (
                <Txt size={14.5} weight="800" style={{ width: 64, padding: 12, textAlign: 'center' }}>
                  {item.jodi ?? '--'}
                </Txt>
              ) : null}
            </Row>
          )}
          ListEmptyComponent={<EmptyState icon="bar-chart-2" text="No results recorded yet" />}
        />
      )}
    </View>
  );
}
