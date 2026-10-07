import { useCallback, useState } from 'react';
import { api } from '../../api';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, Chip, Field, Modal, Page, Resource, TableWrap, TitleCard, useAction, useToast } from '../../ui';

interface WithdrawDay {
  day: number;
  dayName: string;
  isOn: boolean;
  message: string;
  updatedAt: string | null;
  today: boolean;
}

/** Wallet → Request On/Off: whether users may place withdraw requests on each weekday. */
export function RequestOnOff() {
  const { nonce } = useRefresh();
  const load = useCallback(() => api<{ days: WithdrawDay[] }>('/wallet/withdraw-schedule'), [nonce]);
  const state = useLoad(load);
  const [edit, setEdit] = useState<WithdrawDay | null>(null);

  return (
    <Page title="Withdraw Request On/Off">
      <TitleCard>Withdraw Request ON/OFF</TitleCard>
      <Card>
        <p className="text-center text-[16px] text-[#4c5866] mt-0 mb-4">Set Withdraw Request ON-OFF for This Day</p>
        <Resource state={state}>
          {({ days }) => (
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th className="center">Day</th>
                    <th className="center">Request on/off</th>
                    <th className="center">Message</th>
                    <th className="center">Updated At</th>
                    <th className="center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day}>
                      <td className="center">
                        {d.dayName}
                        {d.today && (
                          <span className="ml-2">
                            <Chip tone="info">Today</Chip>
                          </span>
                        )}
                      </td>
                      <td className="center">
                        <Chip tone={d.isOn ? 'ok' : 'bad'}>{d.isOn ? 'Request is On' : 'Request is Off'}</Chip>
                      </td>
                      <td className="center wrap">{d.message}</td>
                      <td className="center">{dt(d.updatedAt)}</td>
                      <td className="center">
                        <Btn sm variant="indigo" icon="edit" onClick={() => setEdit(d)}>
                          Edit Setting
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Resource>
      </Card>
      {edit && (
        <EditDayModal
          day={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void state.reload();
          }}
        />
      )}
    </Page>
  );
}

const DEFAULT_MESSAGE = {
  on: 'Withdraw requests are open today',
  off: 'Withdraw requests are closed today. Please try again tomorrow.',
};

function EditDayModal({ day, onClose, onSaved }: { day: WithdrawDay; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, run] = useAction();
  const [isOn, setIsOn] = useState(day.isOn);
  const [message, setMessage] = useState(day.message);

  const switchTo = (on: boolean) => {
    setIsOn(on);
    // swap in the matching default text unless the admin wrote their own
    if (!message.trim() || message === DEFAULT_MESSAGE.on || message === DEFAULT_MESSAGE.off) {
      setMessage(on ? DEFAULT_MESSAGE.on : DEFAULT_MESSAGE.off);
    }
  };

  const save = () =>
    run(async () => {
      const res = await api<{ message: string }>(`/wallet/withdraw-schedule/${day.day}`, {
        method: 'PUT',
        body: { isOn, message },
      });
      toast(res.message);
      onSaved();
    });

  return (
    <Modal
      title={`Edit Setting · ${day.dayName}`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Please wait…' : 'Submit'}
          </Btn>
        </>
      }
    >
      <div className="form-stack">
        <div>
          <div className="text-[14.5px] font-bold text-[#323a46] mb-2">Withdraw Request</div>
          <div className="flex gap-6">
            <label className="check">
              <input type="radio" name="onoff" checked={isOn} onChange={() => switchTo(true)} /> ON
            </label>
            <label className="check">
              <input type="radio" name="onoff" checked={!isOn} onChange={() => switchTo(false)} /> OFF
            </label>
          </div>
        </div>
        <Field label="Message (shown in the app)">
          <textarea value={message} maxLength={200} rows={3} className="!min-h-[80px]" onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
