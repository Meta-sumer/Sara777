import { Feather } from '@expo/vector-icons';
import { type RouteProp, useRoute } from '@react-navigation/native';
import { useAppNavigation } from '../navTypes';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { ApiError, api, formatCoins, payoutFor10 } from '../api';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import type { AppParamList } from '../navTypes';
import { radius, useTheme } from '../theme';
import { Card, Field, PrimaryButton, Row, Txt } from '../ui';

interface Entry {
  key: string;
  pick: string;
  amount: number;
}

const MIN_BID = 10;

/** Jodis played as "Red Brackets": both digits equal or five apart (00, 05, 11, 16 …). */
const RED_JODIS = Array.from({ length: 100 }, (_, n) => String(n).padStart(2, '0')).filter(
  (j) => j[0] === j[1] || Math.abs(Number(j[0]) - Number(j[1])) === 5,
);

function pannaKind(p: string) {
  const uniq = new Set(p.split('')).size;
  return uniq === 3 ? 'single' : uniq === 2 ? 'double' : 'triple';
}

/** Same rules as the server, run locally so mistakes are caught before submit. */
function validatePick(gameType: string, pick: string): string | null {
  switch (gameType) {
    case 'single_digit':
      return /^[0-9]$/.test(pick) ? null : 'Choose a digit between 0 and 9';
    case 'jodi_digit':
      return /^[0-9]{2}$/.test(pick) ? null : 'Jodi must be 2 digits (00-99)';
    case 'ab_jodi':
      return /^[0-9]{2}$/.test(pick) ? null : 'Enter a 2 digit number (00-99)';
    case 'red_bracket':
      return RED_JODIS.includes(pick) ? null : 'Choose one of the red bracket numbers';
    case 'single_panna':
      return /^[0-9]{3}$/.test(pick) && pannaKind(pick) === 'single'
        ? null
        : 'Single panna needs 3 different digits';
    case 'double_panna':
      return /^[0-9]{3}$/.test(pick) && pannaKind(pick) === 'double'
        ? null
        : 'Double panna needs exactly two same digits';
    case 'triple_panna':
      return /^[0-9]{3}$/.test(pick) && pannaKind(pick) === 'triple'
        ? null
        : 'Triple panna needs all three digits same';
    case 'half_sangam': {
      const [a, b] = pick.split('-');
      if (/^[0-9]{3}$/.test(a ?? '') && /^[0-9]$/.test(b ?? '')) return null;
      if (/^[0-9]$/.test(a ?? '') && /^[0-9]{3}$/.test(b ?? '')) return null;
      return 'Enter a 3 digit panna and a single digit';
    }
    case 'full_sangam': {
      const [a, b] = pick.split('-');
      return /^[0-9]{3}$/.test(a ?? '') && /^[0-9]{3}$/.test(b ?? '')
        ? null
        : 'Enter open panna and close panna';
    }
    default:
      return 'Unsupported game';
  }
}

export default function PlaceBidScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<AppParamList, 'PlaceBid'>>();
  const { marketId, marketName, kind, gameType, gameLabel, rate, sessions } = route.params;
  const { user, refreshUser } = useAuth();

  const [session, setSession] = useState<'open' | 'close'>(sessions[0]);
  const [digit, setDigit] = useState('');
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [amount, setAmount] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isSangam = gameType === 'half_sangam' || gameType === 'full_sangam';
  const isSingleDigit = gameType === 'single_digit';
  const isRedBracket = gameType === 'red_bracket';
  const isTwoDigit = gameType === 'jodi_digit' || gameType === 'ab_jodi';

  const currentPick = isSangam ? `${left}-${right}` : digit;
  const total = useMemo(() => entries.reduce((sum, e) => sum + e.amount, 0), [entries]);

  const addEntry = () => {
    const pickError = validatePick(gameType, currentPick);
    if (pickError) return Alert.alert('Check your number', pickError);

    const points = Number(amount);
    if (!Number.isFinite(points) || points < MIN_BID) {
      return Alert.alert('Points', `Minimum points per bid is ${MIN_BID}`);
    }
    if (total + points > (user?.balance ?? 0)) {
      return Alert.alert('Balance', 'You do not have enough coins for this bid');
    }

    setEntries((prev) => [
      { key: `${Date.now()}-${prev.length}`, pick: currentPick, amount: Math.floor(points) },
      ...prev,
    ]);
    setDigit('');
    setLeft('');
    setRight('');
    setAmount('');
  };

  const submit = () => {
    if (entries.length === 0) return Alert.alert('Bids', 'Add at least one bid first');
    Alert.alert(
      'Confirm bids',
      `${marketName}\n${gameLabel}${kind === 'main' ? ` (${session})` : ''}\n\nBids: ${entries.length}\nTotal points: ${formatCoins(total)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: doSubmit },
      ],
    );
  };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string; balance: number }>('/bids', {
        marketId,
        gameType,
        session,
        entries: entries.map((e) => ({ pick: e.pick, amount: e.amount })),
      });
      await refreshUser();
      Alert.alert('Success', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Bid failed', err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgAlt }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title={gameLabel} back />

      <View style={{ padding: 12, paddingBottom: 0 }}>
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <Txt size={15} weight="800">
              {marketName}
            </Txt>
            <Txt size={13} weight="700" color={colors.primary}>
              10 → {payoutFor10(rate)}
            </Txt>
          </Row>

          {sessions.length > 1 ? (
            <Row style={{ gap: 10, marginBottom: 14 }}>
              {sessions.map((s) => {
                const active = s === session;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSession(s)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      backgroundColor: active ? colors.primary : colors.bgAlt,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Txt size={14} weight="700" color={active ? '#FFFFFF' : colors.textMuted}>
                      {s === 'open' ? 'OPEN' : 'CLOSE'}
                    </Txt>
                  </Pressable>
                );
              })}
            </Row>
          ) : kind === 'main' ? (
            <Txt size={13} color={colors.textMuted} style={{ marginBottom: 12 }}>
              Session: {session.toUpperCase()}
            </Txt>
          ) : null}

          {isSingleDigit ? (
            <View style={{ marginBottom: 12 }}>
              <Txt size={13} weight="600" color={colors.textMuted} style={{ marginBottom: 8 }}>
                Choose Digit
              </Txt>
              <Row style={{ flexWrap: 'wrap', gap: 8 }}>
                {'0123456789'.split('').map((d) => {
                  const active = digit === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDigit(d)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? colors.primary : colors.bgAlt,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                      }}
                    >
                      <Txt size={17} weight="700" color={active ? '#FFFFFF' : colors.text}>
                        {d}
                      </Txt>
                    </Pressable>
                  );
                })}
              </Row>
            </View>
          ) : isRedBracket ? (
            <View style={{ marginBottom: 12 }}>
              <Txt size={13} weight="600" color={colors.textMuted} style={{ marginBottom: 8 }}>
                Choose Red Bracket
              </Txt>
              <Row style={{ flexWrap: 'wrap', gap: 8 }}>
                {RED_JODIS.map((j) => {
                  const active = digit === j;
                  return (
                    <Pressable
                      key={j}
                      onPress={() => setDigit(j)}
                      style={{
                        width: 52,
                        height: 44,
                        borderRadius: radius.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? colors.primary : colors.bgAlt,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                      }}
                    >
                      <Txt size={16} weight="700" color={active ? '#FFFFFF' : colors.text}>
                        {j}
                      </Txt>
                    </Pressable>
                  );
                })}
              </Row>
            </View>
          ) : isSangam ? (
            <Row style={{ gap: 10 }}>
              <Field
                style={{ flex: 1 }}
                label={gameType === 'full_sangam' ? 'Open Panna' : 'Open (panna or digit)'}
                placeholder={gameType === 'full_sangam' ? '123' : '123 or 1'}
                keyboardType="number-pad"
                maxLength={3}
                value={left}
                onChangeText={setLeft}
              />
              <Field
                style={{ flex: 1 }}
                label={gameType === 'full_sangam' ? 'Close Panna' : 'Close (panna or digit)'}
                placeholder={gameType === 'full_sangam' ? '456' : '4 or 456'}
                keyboardType="number-pad"
                maxLength={3}
                value={right}
                onChangeText={setRight}
              />
            </Row>
          ) : (
            <Field
              label={gameType === 'ab_jodi' ? 'Number (00-99)' : isTwoDigit ? 'Jodi (00-99)' : 'Panna (3 digits)'}
              placeholder={isTwoDigit ? '46' : '128'}
              keyboardType="number-pad"
              maxLength={isTwoDigit ? 2 : 3}
              value={digit}
              onChangeText={setDigit}
            />
          )}

          <Field
            label="Points"
            placeholder={`Minimum ${MIN_BID}`}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />

          <PrimaryButton title="ADD BID" onPress={addEntry} />
        </Card>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
        ListHeaderComponent={
          entries.length ? (
            <Row style={{ justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
              <Txt size={13} weight="700" color={colors.textMuted}>
                {isTwoDigit || isRedBracket ? 'Number' : 'Digit / Panna'}
              </Txt>
              <Txt size={13} weight="700" color={colors.textMuted}>
                Points
              </Txt>
            </Row>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Row
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              paddingVertical: 12,
              paddingHorizontal: 14,
              marginBottom: 8,
              justifyContent: 'space-between',
            }}
          >
            <Txt size={15} weight="700">
              {item.pick}
            </Txt>
            <Row style={{ gap: 16 }}>
              <Txt size={15} weight="700" color={colors.primary}>
                {formatCoins(item.amount)}
              </Txt>
              <Pressable
                hitSlop={8}
                onPress={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
              >
                <Feather name="trash-2" size={18} color={colors.danger} />
              </Pressable>
            </Row>
          </Row>
        )}
      />

      <View
        style={{
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Txt size={13.5} color={colors.textMuted}>
            Bids: <Txt size={13.5} weight="700">{entries.length}</Txt>
          </Txt>
          <Txt size={13.5} color={colors.textMuted}>
            Total: <Txt size={13.5} weight="700" color={colors.primary}>{formatCoins(total)}</Txt>
          </Txt>
        </Row>
        <PrimaryButton title="SUBMIT BIDS" onPress={submit} loading={submitting} disabled={!entries.length} />
      </View>
    </KeyboardAvoidingView>
  );
}
