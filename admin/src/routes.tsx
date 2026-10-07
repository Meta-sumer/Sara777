/* Route path → page component. Paths match nav.ts; each page checks nothing
   itself — Layout shows a "no permission" card when the admin lacks the
   page's permission key. */
import type { ReactElement } from 'react';

import { Dashboard } from './pages/Dashboard';
import { AllUsers } from './pages/users/AllUsers';
import { DeletedUsers } from './pages/users/DeletedUsers';
import { NotificationsPage } from './pages/content/Notifications';
import { News } from './pages/content/News';
import { HowToPlay, NoticeBoard, ProfileNote, WalletContact } from './pages/content/AppSettings';
import { GameProvider } from './pages/games/GameProvider';
import { GameSetting } from './pages/games/GameSetting';
import { GameRates } from './pages/games/GameRates';
import { GameResult } from './pages/games/GameResult';
import { GamePnl } from './pages/pnl/GamePnl';
import { BookieCorner } from './pages/pnl/BookieCorner';
import { FundRequests } from './pages/wallet/FundRequests';
import { DownloadDebitReport, ExportDebitReport } from './pages/wallet/DebitReport';
import { BulkPgPayment } from './pages/wallet/BulkPgPayment';
import { ViewWallet } from './pages/wallet/ViewWallet';
import { SearchAccount } from './pages/wallet/SearchAccount';
import { BankHistory } from './pages/wallet/BankHistory';
import { RequestOnOff } from './pages/wallet/RequestOnOff';
import { ApprovedDebit } from './pages/wallet/ApprovedDebit';
import { DeclinedRequests } from './pages/wallet/DeclinedRequests';
import { JodiAll } from './pages/reports/JodiAll';
import { SalesReport } from './pages/reports/SalesReport';
import { SalesSummary } from './pages/reports/SalesSummary';
import { StarlineSales } from './pages/reports/StarlineSales';
import { AbSales } from './pages/reports/AbSales';
import { AbBids } from './pages/reports/AbBids';
import { FundReport } from './pages/reports/FundReport';
import { FundReport2 } from './pages/reports/FundReport2';
import { UpiFundReport } from './pages/reports/UpiFundReport';
import { TotalBids } from './pages/reports/TotalBids';
import { CreditDebit } from './pages/reports/CreditDebit';
import { DailyReport } from './pages/reports/DailyReport';
import { BiddingReport } from './pages/reports/BiddingReport';
import { UserAnalysis } from './pages/reports/UserAnalysis';
import { UserReport } from './pages/reports/UserReport';
import { UserList } from './pages/reports/UserList';
import { CustomerBalance } from './pages/reports/CustomerBalance';
import { AllUserBids } from './pages/reports/AllUserBids';
import { PaymentGateways } from './pages/masters/PaymentGateways';
import { ManageEmployees } from './pages/masters/Employees';
import { CreateEmployee } from './pages/masters/CreateEmployee';
import { Bids } from './pages/others/Bids';
import { Support } from './pages/others/Support';
import { Ideas } from './pages/others/Ideas';
import { Settings } from './pages/others/Settings';
import { Logs } from './pages/others/Logs';

export const ROUTES: Record<string, ReactElement> = {
  dashboard: <Dashboard />,
  users: <AllUsers />,

  'games/provider': <GameProvider kind="main" />,
  'games/setting': <GameSetting kind="main" />,
  'games/rates': <GameRates kind="main" />,
  'games/result': <GameResult kind="main" />,

  'starline/provider': <GameProvider kind="starline" />,
  'starline/setting': <GameSetting kind="starline" />,
  'starline/rates': <GameRates kind="starline" />,
  'starline/pnl': <GamePnl kind="starline" />,
  'starline/result': <GameResult kind="starline" />,

  'andarbahar/provider': <GameProvider kind="andarbahar" />,
  'andarbahar/setting': <GameSetting kind="andarbahar" />,
  'andarbahar/rates': <GameRates kind="andarbahar" />,
  'andarbahar/pnl': <GamePnl kind="andarbahar" />,
  'andarbahar/result': <GameResult kind="andarbahar" />,

  'bookie/oc': <BookieCorner variant="oc" />,
  'bookie/final': <BookieCorner variant="final" />,
  'bookie/cutting': <BookieCorner variant="cutting" />,

  'wallet/fund-requests': <FundRequests />,
  'wallet/export-debit': <ExportDebitReport />,
  'wallet/bulk-pg': <BulkPgPayment />,
  'wallet/download-debit': <DownloadDebitReport />,
  'wallet/view': <ViewWallet />,
  'wallet/search-account': <SearchAccount />,
  'wallet/bank-history': <BankHistory />,
  'wallet/request-onoff': <RequestOnOff />,
  'approved-debit/paytm': <ApprovedDebit mode="paytm" />,
  'approved-debit/bank': <ApprovedDebit mode="bank" />,
  declined: <DeclinedRequests />,

  'reports/jodi-all': <JodiAll />,
  'reports/sales': <SalesReport />,
  'reports/sales-summary': <SalesSummary />,
  'reports/starline-sales': <StarlineSales />,
  'reports/ab-sales': <AbSales />,
  'reports/ab-bids': <AbBids />,
  'reports/fund': <FundReport />,
  'reports/fund2': <FundReport2 />,
  'reports/upi-fund': <UpiFundReport />,
  'reports/total-bids': <TotalBids />,
  'reports/credit-debit': <CreditDebit />,
  'reports/daily': <DailyReport />,
  'reports/bidding': <BiddingReport />,
  'reports/user-analysis': <UserAnalysis />,
  'reports/user-report': <UserReport />,
  'reports/user-list': <UserList />,
  'reports/customer-balance': <CustomerBalance />,
  'reports/all-user-bids': <AllUserBids />,

  notifications: <NotificationsPage />,
  news: <News />,
  'deleted-users': <DeletedUsers />,
  'app/how-to-play': <HowToPlay />,
  'app/notice-board': <NoticeBoard />,
  'app/profile-note': <ProfileNote />,
  'app/wallet-contact': <WalletContact />,

  'masters/pg': <PaymentGateways />,
  'masters/employees': <ManageEmployees />,
  'masters/employees/new': <CreateEmployee />,

  'others/bids': <Bids />,
  'others/support': <Support />,
  'others/ideas': <Ideas />,
  'others/settings': <Settings />,
  'others/logs': <Logs />,
};
