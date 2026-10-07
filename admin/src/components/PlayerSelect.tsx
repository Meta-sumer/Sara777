import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export interface Player {
  id: number;
  name: string;
  username: string;
  mobile: string;
}

/**
 * "Player Name" box with suggestions after 3 characters (GET /players?q=).
 * `value` is the chosen player or null; clearing the text clears the choice.
 */
export function PlayerSelect({
  value,
  onChange,
  placeholder = 'Type Minimum 3 Char to get suggestion',
}: {
  value: Player | null;
  onChange: (player: Player | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ? `${value.name} (${value.username})` : '');
  const [list, setList] = useState<Player[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!value) return;
    setText(`${value.name} (${value.username})`);
  }, [value]);

  const search = (q: string) => {
    setText(q);
    if (value) onChange(null);
    window.clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setList([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const res = await api<{ players: Player[] }>(`/players?q=${encodeURIComponent(q.trim())}`);
        setList(res.players);
        setOpen(true);
      } catch {
        setList([]);
      }
    }, 250);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => search(e.target.value)}
        onFocus={() => list.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && list.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            top: '100%',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 4,
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: '0 8px 20px rgba(0,0,0,.08)',
          }}
        >
          {list.map((p) => (
            <div
              key={p.id}
              style={{ padding: '8px 12px', cursor: 'pointer' }}
              onMouseDown={() => {
                onChange(p);
                setText(`${p.name} (${p.username})`);
                setOpen(false);
              }}
            >
              <strong>{p.name}</strong> <span className="muted">· {p.username} · {p.mobile}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
