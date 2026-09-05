import { useAppNavigation } from '../navTypes';
import React from 'react';
import { View } from 'react-native';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { MenuItem, Screen } from '../ui';

export default function MyBidsScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();

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
      </Screen>
    </View>
  );
}
