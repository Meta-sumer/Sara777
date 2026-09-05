import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { type Paged, type PassbookEntry, api, formatCoins, formatDateTime } from '../api';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { EmptyState, Loader, Pager, Row, Txt, tableHeaderStyle } from '../ui';

export default function PassbookScreen() {
  const { colors } = useTheme();
  const [data, setData] = useState<(Paged<PassbookEntry> & { entries: PassbookEntry[] }) | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await api.get<Paged<PassbookEntry> & { entries: PassbookEntry[] }>(
          `/wallet/passbook?page=${page}&perPage=15`,
        ),
      );
    } catch {
      setData({ page: 1, perPage: 15, total: 0, totalPages: 1, entries: [] });
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Passbook" onRefresh={load} />

      <Row style={tableHeaderStyle(colors)}>
        <Txt size={14.5} weight="700" style={{ flex: 1.1, padding: 14 }}>
          Transaction Date
        </Txt>
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <Txt size={14.5} weight="700" style={{ flex: 1, padding: 14 }}>
          Particulars
        </Txt>
      </Row>

      {!data ? (
        <Loader />
      ) : (
        <>
          <FlatList
            data={data.entries}
            keyExtractor={(e) => String(e.id)}
            renderItem={({ item }) => {
              const isOpen = expanded === item.id;
              const credit = item.amount >= 0;
              return (
                <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Pressable
                    onPress={() => setExpanded(isOpen ? null : item.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                  >
                    <Txt size={13} color={colors.textMuted} style={{ flex: 1.1, paddingHorizontal: 14 }}>
                      {formatDateTime(item.createdAt)}
                    </Txt>
                    <Row style={{ flex: 1, paddingHorizontal: 14, justifyContent: 'space-between' }}>
                      <Txt size={14.5} weight="700" numberOfLines={1} style={{ flex: 1 }}>
                        {item.particulars}
                      </Txt>
                      <Feather
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={colors.primary}
                      />
                    </Row>
                  </Pressable>

                  {isOpen ? (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, backgroundColor: colors.card }}>
                      <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                        <Txt size={13} color={colors.textMuted}>
                          Amount
                        </Txt>
                        <Txt size={14} weight="700" color={credit ? colors.success : colors.danger}>
                          {credit ? '+' : '-'}
                          {formatCoins(Math.abs(item.amount))}
                        </Txt>
                      </Row>
                      <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                        <Txt size={13} color={colors.textMuted}>
                          Closing balance
                        </Txt>
                        <Txt size={14} weight="700">
                          {formatCoins(item.balanceAfter)}
                        </Txt>
                      </Row>
                      {item.note ? (
                        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                          <Txt size={13} color={colors.textMuted}>
                            Details
                          </Txt>
                          <Txt size={13} style={{ flex: 1, textAlign: 'right', marginLeft: 12 }}>
                            {item.note}
                          </Txt>
                        </Row>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={<EmptyState icon="book-open" text="No transactions yet" />}
          />
          <Pager
            page={data.page}
            totalPages={data.totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.totalPages, p + 1))}
          />
        </>
      )}
    </View>
  );
}
