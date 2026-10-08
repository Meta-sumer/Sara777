import { useAppNavigation } from '../navTypes';
import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { MenuItem, Screen } from '../ui';

export default function MyBidsScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const { settings } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="My Bids" />
      <Screen scroll>
        <MenuItem
          icon="clipboard"
          title="Bid History"
          subtitle="You can view your market bid history"
          onPress={() => navigation.navigate('BidHistory' , { kind: 'main' })}
        />
        <MenuItem
          icon="rotate-ccw"
          title="Game Result"
          subtitle="You can view your market result history"
          onPress={() => navigation.navigate('GameResult' , { kind: 'main' })}
        />
        <MenuItem
          icon="list"
          title="King Starline Bid History"
          subtitle="You can view your starline bid history"
          onPress={() => navigation.navigate('BidHistory' , { kind: 'starline' })}
        />
        <MenuItem
          icon="rotate-ccw"
          title="King Starline Result History"
          subtitle="You can view your starline result"
          onPress={() => navigation.navigate('GameResult' , { kind: 'starline' })}
        />
        {settings?.andarBaharEnabled !== false ? (
          <>
            <MenuItem
              icon="list"
              title="Andar Bahar Bid History"
              subtitle="You can view your andar bahar bid history"
              onPress={() => navigation.navigate('BidHistory', { kind: 'andarbahar' })}
            />
            <MenuItem
              icon="rotate-ccw"
              title="Andar Bahar Result History"
              subtitle="You can view andar bahar results"
              onPress={() => navigation.navigate('GameResult', { kind: 'andarbahar' })}
            />
          </>
        ) : null}
      </Screen>
    </View>
  );
}
