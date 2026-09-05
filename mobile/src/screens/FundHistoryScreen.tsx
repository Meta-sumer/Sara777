import { type RouteProp, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { type FundRequest, api, formatCoins, formatDateTime } from '../api';
import { Header } from '../components/Header';
import type { AppParamList } from '../navTypes';
import { useTheme } from '../theme';
import { Card, EmptyState, Loader, Pill, Row, Txt } from '../ui';

const TONE: Record<FundRequest['status'], 'primary' | 'success' | 'danger'> = {
  pending: 'primary',
  approved: 'success',
  rejected: 'danger',
};

export default function FundHistoryScreen() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<AppParamList, 'FundHistory'>>();
  const type = route.params?.type ?? 'deposit';

  const [requests, setRequests] = useState<FundRequest[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ requests: FundRequest[] }>(`/wallet/requests?type=${type}`);
      setRequests(res.requests);
    } catch {
      setRequests([]);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title={type === 'deposit' ? 'Fund Deposit History' : 'Fund Withdraw History'} back />
      {!requests ? (
        <Loader />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => String(r.id)}
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
                <Txt size={18} weight="800" color={colors.primary}>
                  {formatCoins(item.amount)}
                </Txt>
                <Pill text={item.status.toUpperCase()} tone={TONE[item.status]} />
              </Row>
              {item.utr ? (
                <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                  <Txt size={12.5} color={colors.textMuted}>
                    UTR
                  </Txt>
                  <Txt size={13} weight="600">
                    {item.utr}
                  </Txt>
                </Row>
              ) : null}
              <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                <Txt size={12.5} color={colors.textMuted}>
                  Request #{item.id}
                </Txt>
                <Txt size={12.5} color={colors.textMuted} style={{ textAlign: 'right' }}>
                  {formatDateTime(item.createdAt).replace('\n', '  ')}
                </Txt>
              </Row>
              {item.remark ? (
                <Txt size={12.5} color={colors.textMuted} style={{ marginTop: 8 }}>
                  {item.remark}
                </Txt>
              ) : null}
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState icon="file-text" text={`No ${type} requests yet`} />
          }
        />
      )}
    </View>
  );
}
