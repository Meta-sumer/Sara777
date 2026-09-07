import { useCallback } from 'react';
import { api } from '../api';
import { dt } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { LogRow } from '../types';
import { Card, Resource, TableWrap } from '../ui';

export function Logs() {
  const { nonce } = useRefresh();
  const load = useCallback(() => api<{ logs: LogRow[] }>('/logs'), [nonce]);
  const state = useLoad(load);

  return (
    <Resource state={state}>
      {({ logs }) => (
        <Card>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th className="wrap">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      No activity yet
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id}>
                      <td className="muted">{dt(l.created_at)}</td>
                      <td>
                        <strong>{l.action}</strong>
                      </td>
                      <td className="wrap muted">{l.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </Resource>
  );
}
