import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { api, formatDateTime } from '../api';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, EmptyState, Loader, Txt } from '../ui';

interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: string;
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    api
      .get<{ notifications: Note[] }>('/notifications')
      .then((res) => setNotes(res.notifications))
      .catch(() => setNotes([]));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Notifications" back />
      {!notes ? (
        <Loader />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <Card>
              <Txt size={15} weight="700">
                {item.title}
              </Txt>
              <Txt size={13.5} color={colors.textMuted} style={{ marginTop: 6, lineHeight: 19 }}>
                {item.body}
              </Txt>
              <Txt size={11.5} color={colors.textMuted} style={{ marginTop: 10 }}>
                {formatDateTime(item.createdAt).replace('\n', '  ')}
              </Txt>
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="bell" text="No notifications yet" />}
        />
      )}
    </View>
  );
}
