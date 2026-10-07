/* "Bid History" popup behind every "View Bids Info (N)" link: the bids placed on
   one digit / pana / number for a market, date and session. Read-only. */
import { useCallback } from 'react';
import { api } from '../../api';
import { amt, dateOnly, dt, SESSION_LABEL } from '../../format';
import { useLoad } from '../../hooks';
import { Chip, DataTable, Modal, Resource, type Column } from '../../ui';
import type { BidQuery } from './shared';

interface HistoryBid {
  sno: number;
  id: number;
  userId: number;
  userName: string;
  name: string;
  gameLabel: string;
  pick: string;
  amount: number;
  rate: number;
  status: string;
  winStatus: 'Win' | 'Loss' | 'Pending';
  winAmount: number;
  createdAt: string;
}

const TONE: Record<HistoryBid['winStatus'], string> = { Win: 'won', Loss: 'lost', Pending: 'pending' };

const COLUMNS: Column<HistoryBid>[] = [
  { key: 'sno', label: 'Sno', align: 'center' },
  { key: 'userName', label: 'User Name', align: 'center', render: (b) => <span title={b.name}>{b.userName}</span> },
  { key: 'pick', label: 'Bracket', align: 'center' },
  { key: 'amount', label: 'Amount', align: 'center', render: (b) => amt(b.amount) },
  {
    key: 'winStatus',
    label: 'Win Status',
    align: 'center',
    render: (b) => <Chip tone={TONE[b.winStatus]}>{b.winStatus}</Chip>,
  },
  { key: 'createdAt', label: 'Played Time', align: 'center', render: (b) => dt(b.createdAt) },
];

export function BidHistoryModal({ query, onClose }: { query: BidQuery; onClose: () => void }) {
  const load = useCallback(() => {
    const qs = new URLSearchParams({
      marketId: String(query.marketId),
      date: query.date,
      group: query.group,
      pick: query.pick,
    });
    if (query.session) qs.set('session', query.session);
    return api<{ bids: HistoryBid[] }>(`/pnl/bids?${qs}`);
  }, [query]);
  const state = useLoad(load);

  const context = [
    query.marketName,
    dateOnly(query.date),
    query.session ? `${SESSION_LABEL[query.session]} session` : null,
    `${query.groupLabel} ${query.label}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal title="Bid History" onClose={onClose} size="lg">
      <p className="muted" style={{ margin: '0 0 12px' }}>
        {context}
      </p>
      <Resource state={state}>
        {(data) => (
          <DataTable
            columns={COLUMNS}
            rows={data.bids}
            rowKey={(b) => b.id}
            pageSize={10}
            initialSort={{ key: 'sno', dir: 'asc' }}
          />
        )}
      </Resource>
    </Modal>
  );
}
