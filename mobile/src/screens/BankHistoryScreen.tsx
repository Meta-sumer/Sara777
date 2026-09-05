import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { type BankDetails, api, formatDateTime } from '../api';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, EmptyState, Loader, Row, Txt } from '../ui';

export default function BankHistoryScreen() {
  const { colors } = useTheme();
  const [history, setHistory] = useState<BankDetails[] | null>(null);

  useEffect(() => {
    api
      .get<{ history: BankDetails[] }>('/wallet/bank/history')
      .then((res) => setHistory(res.history))
      .catch(() => setHistory([]));
  }, []);

  const line = (label: string, value?: string) =>
    value ? (
      <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
        <Txt size={13} color={colors.textMuted}>
          {label}
        </Txt>
        <Txt size={13} weight="600">
          {value}
        </Txt>
      </Row>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Bank Changes History" back />
      {!history ? (
        <Loader />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <Card>
              <Txt size={12.5} color={colors.textMuted} style={{ marginBottom: 8 }}>
                {formatDateTime(item.createdAt).replace('\n', '  ')}
              </Txt>
              {line('Holder', item.holderName)}
              {line('Bank', item.bankName)}
              {line('Account', item.accountNo)}
              {line('IFSC', item.ifsc)}
              {line('Paytm', item.paytm)}
              {line('PhonePe', item.phonepe)}
              {line('Google Pay', item.gpay)}
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="file-text" text="No changes recorded yet" />}
        />
      )}
    </View>
  );
}
