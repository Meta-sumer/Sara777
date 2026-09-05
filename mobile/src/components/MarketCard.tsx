import React from 'react';
import { View } from 'react-native';
import type { Market } from '../api';
import { useTheme } from '../theme';
import { Card, PlayButton, Row, Txt } from '../ui';

export function MarketCard({ market, onPlay }: { market: Market; onPlay: () => void }) {
  const { colors } = useTheme();
  const statusColor = market.isPlayable ? colors.success : colors.text;

  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Txt size={17} weight="800" numberOfLines={1}>
            {market.name}
          </Txt>
          <Txt size={17} weight="800" color={colors.primary} style={{ marginTop: 6, letterSpacing: 0.5 }}>
            {market.result}
          </Txt>

          <Row style={{ marginTop: 12, gap: 18 }}>
            <View>
              <Txt size={12.5} color={colors.textMuted}>
                Open Bids :
              </Txt>
              <Txt size={12.5} color={colors.textMuted} style={{ marginTop: 2 }}>
                {market.openTimeLabel}
              </Txt>
            </View>
            <View>
              <Txt size={12.5} color={colors.textMuted}>
                {market.kind === 'starline' ? 'Result :' : 'Close Bids :'}
              </Txt>
              <Txt size={12.5} color={colors.textMuted} style={{ marginTop: 2 }}>
                {market.closeTimeLabel}
              </Txt>
            </View>
          </Row>
        </View>

        <View style={{ alignItems: 'center', width: 120 }}>
          <Txt size={13.5} weight="600" color={statusColor} style={{ textAlign: 'center' }}>
            {market.statusLabel}
          </Txt>
          <View style={{ marginVertical: 10, opacity: market.isPlayable ? 1 : 0.85 }}>
            <PlayButton onPress={onPlay} />
          </View>
          <Txt size={13} color={colors.textMuted}>
            Play Game
          </Txt>
        </View>
      </Row>
    </Card>
  );
}
