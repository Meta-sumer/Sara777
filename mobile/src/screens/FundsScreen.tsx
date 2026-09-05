import { useAppNavigation } from '../navTypes';
import React from 'react';
import { View } from 'react-native';
import { Header } from '../components/Header';
import { useTheme } from '../theme';
import { MenuItem, Screen } from '../ui';

export default function FundsScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Header title="Funds" />
      <Screen scroll>
        <MenuItem
          icon="wallet-outline"
          iconSet="mci"
          title="Add Fund"
          subtitle="can add fund to your wallet"
          onPress={() => navigation.navigate('AddFund')}
        />
        <MenuItem
          icon="cash-multiple"
          iconSet="mci"
          title="Withdraw Fund"
          subtitle="can withdraw winnings"
          onPress={() => navigation.navigate('WithdrawFund')}
        />
        <MenuItem
          icon="bank"
          iconSet="mci"
          title="Add Bank Details"
          subtitle="can add your bank details for withdrawals"
          onPress={() => navigation.navigate('AddBank')}
        />
        <MenuItem
          icon="file-text"
          title="Fund Deposit History"
          subtitle="can see history of your deposit"
          onPress={() => navigation.navigate('FundHistory', { type: 'deposit' })}
        />
        <MenuItem
          icon="file-text"
          title="Fund Withdraw History"
          subtitle="can see history of your fund withdrawals"
          onPress={() => navigation.navigate('FundHistory', { type: 'withdraw' })}
        />
        <MenuItem
          icon="file-text"
          title="Bank Changes History"
          subtitle="can see history of your bank accounts"
          onPress={() => navigation.navigate('BankHistory')}
        />
      </Screen>
    </View>
  );
}
