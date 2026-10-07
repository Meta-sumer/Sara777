import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { PlayerSelect, type Player } from '../../components/PlayerSelect';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import {
  Btn,
  Card,
  DataTable,
  Field,
  Modal,
  Page,
  Resource,
  srColumn,
  useAction,
  useConfirm,
  useToast,
  type Column,
} from '../../ui';

interface NotificationRow {
  id: number;
  title: string;
  message: string;
  userId: number | null;
  sentTo: string;
  createdAt: string;
}

export function NotificationsPage() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  const [sending, setSending] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api<{ notifications: NotificationRow[] }>('/content/notifications'), [nonce]);
  const state = useLoad(load);

  const remove = async (n: NotificationRow) => {
    const ok = await confirm({
      message: `Delete "${n.title}"? Users will no longer see it in their notifications.`,
      confirmText: 'Yes, Delete',
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await api(`/content/notifications/${n.id}`, { method: 'DELETE' });
      toast('Notification deleted');
      await state.reload();
    });
  };

  const columns: Column<NotificationRow>[] = [
    srColumn('Sr.'),
    { key: 'title', label: 'Title', className: 'wrap' },
    { key: 'message', label: 'Message', className: 'wrap', render: (n) => <span style={{ whiteSpace: 'pre-wrap' }}>{n.message}</span> },
    { key: 'sentTo', label: 'Sent To' },
    { key: 'createdAt', label: 'Date', render: (n) => dt(n.createdAt) },
    {
      key: 'delete',
      label: 'Delete Notification',
      align: 'center',
      sortable: false,
      render: (n) => (
        <Btn sm variant="danger" icon="trash" disabled={busy} onClick={() => void remove(n)}>
          Delete
        </Btn>
      ),
    },
  ];

  return (
    <Page title="Notifications">
      <Card
        title="Notifications"
        actions={
          <Btn variant="indigo" className="pill" onClick={() => setSending(true)}>
            Send New Notification
          </Btn>
        }
      >
        <Resource state={state}>
          {(d) => (
            <DataTable columns={columns} rows={d.notifications} rowKey={(n) => n.id} empty="No Notification Available" />
          )}
        </Resource>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
          These show in the bell icon of the app. Automatic messages (wins, deposits, support replies) are not listed
          here.
        </p>
      </Card>
      {sending && (
        <SendNotification
          onClose={() => setSending(false)}
          onSent={() => {
            setSending(false);
            void state.reload();
          }}
        />
      )}
    </Page>
  );
}

function SendNotification({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [busy, run] = useAction();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'all' | 'one'>('all');
  const [player, setPlayer] = useState<Player | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast('Enter a title and a message', true);
      return;
    }
    if (target === 'one' && !player) {
      toast('Choose the user to send to', true);
      return;
    }
    void run(async () => {
      await api('/content/notifications', {
        method: 'POST',
        body: { title: title.trim(), message: message.trim(), userId: target === 'one' ? player?.id : undefined },
      });
      toast(target === 'one' ? `Sent to ${player?.name}` : 'Sent to all users');
      onSent();
    });
  };

  return (
    <Modal title="Send New Notification" onClose={onClose} size="md">
      <form className="form-stack" onSubmit={submit}>
        <Field label="Title">
          <input value={title} maxLength={100} placeholder="Enter Title" onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Message">
          <textarea
            value={message}
            maxLength={1000}
            rows={6}
            placeholder="Enter Message"
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--heading)', marginBottom: 8 }}>Send To</div>
          <div className="row" style={{ gap: 20 }}>
            <label className="check">
              <input type="radio" name="target" checked={target === 'all'} onChange={() => setTarget('all')} />
              All Users
            </label>
            <label className="check">
              <input type="radio" name="target" checked={target === 'one'} onChange={() => setTarget('one')} />
              Single User
            </label>
          </div>
          {target === 'one' && (
            <div style={{ marginTop: 10 }}>
              <PlayerSelect value={player} onChange={setPlayer} />
            </div>
          )}
        </div>
        <div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
