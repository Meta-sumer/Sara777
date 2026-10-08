import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MarketKind } from './api';

/** Every route reachable with `navigate` from anywhere in the app. */
export type AppParamList = {
  // stack
  Drawer: undefined;
  Starline: undefined;
  AndarBahar: undefined;
  HowToPlay: undefined;
  GamePlay: { marketId: number; marketName: string; kind: MarketKind };
  PlaceBid: {
    marketId: number;
    marketName: string;
    kind: MarketKind;
    gameType: string;
    gameLabel: string;
    rate: number;
    sessions: Array<'open' | 'close'>;
  };
  BidHistory: { kind: MarketKind };
  GameResult: { kind: MarketKind };
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
  ChartDetail: { marketId: number; marketName: string; kind: MarketKind };
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
