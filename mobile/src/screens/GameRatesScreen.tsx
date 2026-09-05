import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../api';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { Card, Loader, Row, Screen, Txt } from '../ui';

interface Rate {
  key: string;
  label: string;
  rate: number;
  display: string;
  kinds: string[];
}

export default function GameRatesScreen() {
  const { colors } = useTheme();
  const [rates, setRates] = useState<Rate[] | null>(null);

  useEffect(() => {
    api
      .get<{ rates: Rate[] }>('/game-rates')
      .then((res) => setRates(res.rates))
      .catch(() => setRates([]));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Game Rates" back />
      {!rates ? (
        <Loader />
      ) : (
        <Screen scroll>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Row style={{ backgroundColor: colors.primarySoft, padding: 14 }}>
              <Txt size={14} weight="700" style={{ flex: 1 }}>
                Game
              </Txt>
              <Txt size={14} weight="700">
                Points → Win
              </Txt>
            </Row>
            {rates.map((r, i) => (
              <Row
                key={r.key}
                style={{
                  padding: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Txt size={14.5} weight="600">
                    {r.label}
                  </Txt>
                  <Txt size={11.5} color={colors.textMuted} style={{ marginTop: 2 }}>
                    {r.kinds.includes('starline') ? 'Market + Starline' : 'Market only'}
                  </Txt>
                </View>
                <Txt size={15} weight="800" color={colors.primary}>
                  {r.display}
                </Txt>
              </Row>
            ))}
          </Card>
        </Screen>
      )}
    </View>
  );
}
