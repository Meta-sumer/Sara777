import { Feather, Ionicons } from '@expo/vector-icons';

import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { useAuth } from '../auth';
import { radius, useTheme } from '../theme';
import { Loader, Row, Txt } from '../ui';

interface Message {
  id: number;
  sender: 'user' | 'support';
  text: string;
  createdAt: string;
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${d.getDate()} ${months[d.getMonth()]} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

export default function SupportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const { settings } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ messages: Message[] }>('/support');
      setMessages(res.messages);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const res = await api.post<{ messages: Message[] }>('/support', { text: body });
      setMessages(res.messages);
    } catch {
      // keep the typed text visible so nothing is lost
      setText(body);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgAlt }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Row
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 14,
          backgroundColor: colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => navigation.navigate('Home')}
          hitSlop={10}
          style={{ marginRight: 12 }}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#25D366',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
        </View>
        <View style={{ marginLeft: 12 }}>
          <Txt size={18} weight="700">
            WhatsApp
          </Txt>
          <Row style={{ gap: 6, marginTop: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#25D366' }} />
            <Txt size={12.5} color="#25D366" weight="600">
              Online
            </Txt>
          </Row>
        </View>
      </Row>

      {!messages ? (
        <Loader />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender === 'user';
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  backgroundColor: mine ? colors.primary : colors.primarySoft,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: mine ? colors.primary : colors.border,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                {!mine ? (
                  <Row
                    style={{
                      gap: 8,
                      paddingBottom: 8,
                      marginBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="headphones" size={12} color="#FFFFFF" />
                    </View>
                    <Txt size={14.5} weight="700">
                      {settings?.supportName ?? 'Support'}
                    </Txt>
                  </Row>
                ) : null}
                <Txt size={14.5} color={mine ? '#FFFFFF' : colors.text} style={{ lineHeight: 20 }}>
                  {item.text}
                </Txt>
                <Txt
                  size={11}
                  color={mine ? '#FFFFFFAA' : colors.textMuted}
                  style={{ marginTop: 6, textAlign: 'right' }}
                >
                  {timeLabel(item.createdAt)}
                </Txt>
              </View>
            );
          }}
        />
      )}

      <Row
        style={{
          padding: 10,
          gap: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <Feather name="smile" size={22} color={colors.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 8 }}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable onPress={send} hitSlop={8}>
          <Feather name={text.trim() ? 'send' : 'paperclip'} size={22} color={colors.primary} />
        </Pressable>
        <Feather name="mic" size={22} color={colors.primary} />
      </Row>
    </KeyboardAvoidingView>
  );
}
