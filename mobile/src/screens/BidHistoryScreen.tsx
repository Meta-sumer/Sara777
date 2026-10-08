import { type RouteProp, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { type Bid, type Paged, api, formatCoins, formatDate, payoutFor10 } from '../api';
import { Header } from '../components/Header';
import type { AppParamList } from '../navTypes';
import { useTheme } from '../theme';
import { Card, EmptyState, Loader, Pager, Pill, Row, Txt } from '../ui';

const TONE: Record<Bid['status'], 'muted' | 'success' | 'danger' | 'primary'> = {
  pending: 'primary',
  won: 'success',
  lost: 'danger',
  refunded: 'muted',
};

export default function BidHistoryScreen() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<AppParamList, 'BidHistory'>>();
  const kind = route.params?.kind ?? 'main';

  const [data, setData] = useState<(Paged<Bid> & { bids: Bid[] }) | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Paged<Bid> & { bids: Bid[] }>(`/bids?kind=${kind}&page=${page}&perPage=15`));
    } catch {
      setData({ page: 1, perPage: 15, total: 0, totalPages: 1, bids: [] });
    }
  }, [kind, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header
        title={kind === 'starline' ? 'Starline Bid History' : kind === 'andarbahar' ? 'Andar Bahar Bid History' : 'Bid History'}
        back
      />
      {!data ? (
        <Loader />
      ) : (
        <>
          <FlatList
            data={data.bids}
            keyExtractor={(b) => String(b.id)}
            contentContainerStyle={{ padding: 12 }}
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
            renderItem={({ item }) => (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt size={15} weight="800" style={{ flex: 1 }} numberOfLines={1}>
                    {item.marketName}
                  </Txt>
                  <Pill text={item.status.toUpperCase()} tone={TONE[item.status]} />
                </Row>

                <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
                  <View>
                    <Txt size={12} color={colors.textMuted}>
                      Game
                    </Txt>
                    <Txt size={13.5} weight="600" style={{ marginTop: 2 }}>
                      {item.gameLabel}
                      {item.kind === 'main' ? ` (${item.session})` : ''}
                    </Txt>
                  </View>
                  <View>
                    <Txt size={12} color={colors.textMuted}>
                      Digit
                    </Txt>
                    <Txt size={15} weight="800" color={colors.primary} style={{ marginTop: 2 }}>
                      {item.pick}
                    </Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt size={12} color={colors.textMuted}>
                      Points
                    </Txt>
                    <Txt size={14} weight="700" style={{ marginTop: 2 }}>
                      {formatCoins(item.amount)}
                    </Txt>
                  </View>
                </Row>

                <Row
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    justifyContent: 'space-between',
                  }}
                >
                  <Txt size={12} color={colors.textMuted}>
                    {formatDate(item.bidDate)}
                  </Txt>
                  {item.status === 'won' ? (
                    <Txt size={13} weight="700" color={colors.success}>
                      Won {formatCoins(item.winAmount)}
                    </Txt>
                  ) : (
                    <Txt size={12} color={colors.textMuted}>
                      Rate 10 → {payoutFor10(item.rate)}
                    </Txt>
                  )}
                </Row>
              </Card>
            )}
            ListEmptyComponent={<EmptyState icon="file-text" text="You have not placed any bids yet" />}
          />
          {data.totalPages > 1 ? (
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
