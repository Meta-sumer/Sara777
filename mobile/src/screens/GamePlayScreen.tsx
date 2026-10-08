import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type RouteProp, useRoute } from '@react-navigation/native';
import { useAppNavigation } from '../navTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { type GameTypeInfo, type Market, api, payoutFor10 } from '../api';
import { Header } from '../components/Header';
import type { AppParamList } from '../navTypes';
import { radius, useTheme } from '../theme';
import { Card, Loader, Pill, Row, Txt } from '../ui';

const GAME_ICONS: Record<string, string> = {
  single_digit: 'numeric-1-box-outline',
  jodi_digit: 'numeric-2-box-multiple-outline',
  red_bracket: 'numeric-2-box-multiple',
  ab_jodi: 'cards-diamond-outline',
  single_panna: 'cards-outline',
  double_panna: 'cards',
  triple_panna: 'cards-playing-outline',
  half_sangam: 'call-split',
  full_sangam: 'call-merge',
};

export default function GamePlayScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<AppParamList, 'GamePlay'>>();
  const { marketId, marketName, kind } = route.params;

  const [market, setMarket] = useState<Market | null>(null);
  const [gameTypes, setGameTypes] = useState<GameTypeInfo[] | null>(null);

  const load = useCallback(async () => {
    const [m, g] = await Promise.all([
      api.get<{ market: Market }>(`/markets/${marketId}`),
      api.get<{ gameTypes: GameTypeInfo[] }>(`/markets/game-types?kind=${kind}`),
    ]);
    setMarket(m.market);
    setGameTypes(g.gameTypes);
  }, [marketId, kind]);

  useEffect(() => {
    load().catch(() => setGameTypes([]));
  }, [load]);

  const open = (game: GameTypeInfo) => {
    if (!market?.isPlayable) {
      Alert.alert(marketName, 'Betting is closed for this market.');
      return;
    }
    // games that need both halves of the result can only be played before open time
    const sessions =
      game.sessions === 'both'
        ? market.sessions.includes('open')
          ? (['open'] as Array<'open' | 'close'>)
          : []
        : market.sessions.filter((s) => (game.sessions as string[]).includes(s));

    if (sessions.length === 0) {
      Alert.alert(game.label, `${game.label} is closed for this market today.`);
      return;
    }

    navigation.navigate('PlaceBid' , {
      marketId,
      marketName,
      kind,
      gameType: game.key,
      gameLabel: game.label,
      rate: game.rate,
      sessions,
    });
  };

  if (!market || !gameTypes) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
        <Header title={marketName} back />
        <Loader />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title={marketName} back />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 28 }}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt size={16} weight="800">
              {market.name}
            </Txt>
            <Pill text={market.statusLabel} tone={market.isPlayable ? 'success' : 'muted'} />
          </Row>
          <Txt size={20} weight="800" color={colors.primary} style={{ marginTop: 8 }}>
            {market.result}
          </Txt>
          <Row style={{ marginTop: 10, gap: 20 }}>
            {market.kind === 'main' ? (
              <>
                <Txt size={12.5} color={colors.textMuted}>
                  Open : {market.openTimeLabel}
                </Txt>
                <Txt size={12.5} color={colors.textMuted}>
                  Close : {market.closeTimeLabel}
                </Txt>
              </>
            ) : (
              <>
                <Txt size={12.5} color={colors.textMuted}>
                  Bids Close : {market.closeBidsLabel ?? market.openTimeLabel}
                </Txt>
                <Txt size={12.5} color={colors.textMuted}>
                  Result : {market.closeTimeLabel}
                </Txt>
              </>
            )}
          </Row>
        </Card>

        <Txt size={15} weight="700" style={{ marginBottom: 10, marginLeft: 2 }}>
          Select Game Type
        </Txt>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {gameTypes.map((game) => (
            <Pressable
              key={game.key}
              onPress={() => open(game)}
              style={({ pressed }) => ({
                width: '48%',
                backgroundColor: colors.card,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: 18,
                alignItems: 'center',
                marginBottom: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons
                  name={(GAME_ICONS[game.key] ?? 'dice-multiple-outline') as never}
                  size={26}
                  color={colors.primary}
                />
              </View>
              <Txt size={14} weight="700" style={{ marginTop: 10, textAlign: 'center' }}>
                {game.label}
              </Txt>
              <Txt size={11.5} color={colors.textMuted} style={{ marginTop: 3 }}>
                10 → {payoutFor10(game.rate)}
              </Txt>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
