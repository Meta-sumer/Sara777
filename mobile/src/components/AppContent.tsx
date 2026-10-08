/* Admin-managed content blocks: notice board sections and contact numbers. */
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import type { NoticeSection } from '../api';
import { radius, useTheme } from '../theme';
import { Card, Row, Txt } from '../ui';

/** Digits only, with India's 91 added to 10-digit numbers (for WhatsApp links). */
function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

async function openUrl(url: string, fallback: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Contact', fallback);
  }
}

/** A phone number with Call and WhatsApp buttons. */
export function ContactRow({ phone }: { phone: string }) {
  const { colors } = useTheme();
  const button = (onPress: () => void, icon: React.ReactNode) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Txt size={15} weight="700">
        {phone}
      </Txt>
      <Row style={{ gap: 10 }}>
        {button(
          () => openUrl(`tel:${phone.replace(/[^\d+]/g, '')}`, `Call ${phone}`),
          <Feather name="phone" size={18} color={colors.primary} />,
        )}
        {button(
          () => openUrl(`https://wa.me/${waNumber(phone)}`, `WhatsApp ${phone}`),
          <MaterialCommunityIcons name="whatsapp" size={20} color={colors.primary} />,
        )}
      </Row>
    </Row>
  );
}

/** "Wallet update contact" card from App Settings → Wallet Contact. Renders nothing when empty. */
export function WalletContacts({ contacts }: { contacts?: string[] }) {
  const { colors } = useTheme();
  if (!contacts || contacts.length === 0) return null;
  return (
    <Card>
      <Txt size={14} weight="700" style={{ marginBottom: 4 }}>
        For wallet updates, contact
      </Txt>
      <Txt size={12.5} color={colors.textMuted} style={{ marginBottom: 6 }}>
        Call or WhatsApp us for help with deposits, withdrawals and your balance.
      </Txt>
      {contacts.map((c) => (
        <ContactRow key={c} phone={c} />
      ))}
    </Card>
  );
}

/** Notice board sections (App Settings → Notice Board / Withdraw Screen). */
export function NoticeSections({ sections }: { sections: NoticeSection[] }) {
  const { colors } = useTheme();
  return (
    <>
      {sections.map((s, i) => (
        <Card key={`${i}-${s.title}`}>
          {s.title ? (
            <Txt size={16} weight="800" color={colors.primary} style={{ marginBottom: 10 }}>
              {s.title}
            </Txt>
          ) : null}
          {s.description ? (
            <Txt size={14} style={{ lineHeight: 22 }}>
              {s.description}
            </Txt>
          ) : null}
          {s.contact ? (
            <View
              style={{
                marginTop: 12,
                paddingTop: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                borderRadius: radius.sm,
              }}
            >
              <Txt size={12.5} color={colors.textMuted}>
                Contact
              </Txt>
              <ContactRow phone={s.contact} />
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}

/** One-line admin note (App Settings → Profile Note), shown where users change payout details. */
export function ProfileNote({ note }: { note?: string }) {
  const { colors } = useTheme();
  if (!note) return null;
  return (
    <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary + '55' }}>
      <Row style={{ alignItems: 'flex-start', gap: 10 }}>
        <Feather name="info" size={18} color={colors.primary} style={{ marginTop: 1 }} />
        <Txt size={13.5} style={{ flex: 1, lineHeight: 20 }}>
          {note}
        </Txt>
      </Row>
    </Card>
  );
}
