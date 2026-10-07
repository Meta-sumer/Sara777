import { useCallback } from 'react';
import { api } from '../../api';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import type { Idea } from '../../types';
import { Card, Resource, TableWrap } from '../../ui';

export function Ideas() {
  const { nonce } = useRefresh();
  const load = useCallback(() => api<{ ideas: Idea[] }>('/ideas'), [nonce]);
  const state = useLoad(load);

  return (
    <Resource state={state}>
      {({ ideas }) => (
        <Card>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th className="wrap">Idea</th>
                </tr>
              </thead>
              <tbody>
                {ideas.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      No ideas submitted yet
                    </td>
                  </tr>
                ) : (
                  ideas.map((i) => (
                    <tr key={i.id}>
                      <td className="muted">{dt(i.created_at)}</td>
                      <td>
                        {i.user_name}
                        <br />
                        <span className="muted">{i.user_mobile}</span>
                      </td>
                      <td className="wrap">{i.text}</td>
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
