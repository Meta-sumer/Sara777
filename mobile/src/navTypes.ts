import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/** Every route reachable with `navigate` from anywhere in the app. */
export type AppParamList = {
  // stack
  Drawer: undefined;
  Starline: undefined;
  GamePlay: { marketId: number; marketName: string; kind: 'main' | 'starline' };
  PlaceBid: {
    marketId: number;
    marketName: string;
    kind: 'main' | 'starline';
    gameType: string;
    gameLabel: string;
    rate: number;
    sessions: Array<'open' | 'close'>;
  };
  BidHistory: { kind: 'main' | 'starline' };
  GameResult: { kind: 'main' | 'starline' };
  AddFund: undefined;
  WithdrawFund: undefined;
  AddBank: undefined;
  FundHistory: { type: 'deposit' | 'withdraw' };
  BankHistory: undefined;
  Notifications: undefined;
  Videos: undefined;
  Notice: undefined;
  GameRates: undefined;
  Charts: undefined;
  ChartDetail: { marketId: number; marketName: string; kind: 'main' | 'starline' };
  SubmitIdea: undefined;
  Settings: undefined;
  Mpin: undefined;
  Profile: undefined;
  // tabs (navigate bubbles up from the stack into the tab navigator)
  Home: undefined;
  MyBids: undefined;
  Passbook: undefined;
  Funds: undefined;
  Support: undefined;
  // auth stack
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type AppNavigationProp = NativeStackNavigationProp<AppParamList>;

export function useAppNavigation(): AppNavigationProp {
  return useNavigation<AppNavigationProp>();
}
