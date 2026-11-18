import { describe, expect, it, vi } from 'vitest';
import { createConnectionState } from '../../src/online/connection.js';

describe('createConnectionState', () => {
  it('fica offline quando o navegador ou o servidor caem, e avisa uma vez por troca', () => {
    const onChange = vi.fn();
    const conn = createConnectionState({ onChange });
    expect(conn.status).toBe('online');

    conn.setBrowserOnline(false);
    expect(conn.status).toBe('offline');
    conn.setFromCache(true); // continua offline: não avisa de novo
    conn.setBrowserOnline(true); // o Wi-Fi voltou, mas o Firestore ainda não respondeu
    expect(conn.status).toBe('offline');
    conn.setFromCache(false);
    expect(conn.status).toBe('online');

    expect(onChange.mock.calls).toEqual([
      ['offline', 'online'],
      ['online', 'offline'],
    ]);
  });

  it('pode começar offline', () => {
    const conn = createConnectionState({ browserOnline: false });
    expect(conn.status).toBe('offline');
  });
});
