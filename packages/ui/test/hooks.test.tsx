import type { NotifyHubClient } from '@notifyhub/client';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotifyHubProvider, useNotification, useNotifications, useNotifyHubClient } from '../src';
import { fallbackDetail, item } from './fixtures';

function fakeClient(over: Partial<NotifyHubClient['notifications']> = {}): NotifyHubClient {
  return {
    health: async () => ({ status: 'ok' }),
    notifications: {
      create: vi.fn(),
      get: vi.fn(async () => fallbackDetail),
      list: vi.fn(async () => ({ items: [item()], nextCursor: null })),
      ...over,
    },
    providers: { list: vi.fn(async () => []), update: vi.fn() },
    auditLog: { list: vi.fn(async () => ({ items: [], nextCursor: null })) },
  } as unknown as NotifyHubClient;
}

function List({ intervalMs }: { intervalMs?: number }) {
  const { data, error, loading, refresh } = useNotifications(
    { status: 'FAILED' },
    intervalMs ? { intervalMs } : undefined,
  );
  return (
    <div>
      <span data-testid="state">
        {loading ? 'cargando' : error ? `error:${error.message}` : `items:${data?.items.length}`}
      </span>
      <button onClick={() => void refresh()}>refrescar</button>
    </div>
  );
}

describe('hooks', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('useNotifications carga con el filtro y pasa de "cargando" a los datos', async () => {
    const client = fakeClient();
    render(
      <NotifyHubProvider client={client}>
        <List />
      </NotifyHubProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('cargando');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('items:1'));
    expect(client.notifications.list).toHaveBeenCalledWith({ status: 'FAILED' });
  });

  it('con intervalMs vuelve a pedir los datos solo', async () => {
    const client = fakeClient();
    render(
      <NotifyHubProvider client={client}>
        <List intervalMs={1000} />
      </NotifyHubProvider>,
    );
    await waitFor(() => expect(client.notifications.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect((client.notifications.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('refresh pide los datos de inmediato', async () => {
    const client = fakeClient();
    render(
      <NotifyHubProvider client={client}>
        <List />
      </NotifyHubProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('items:1'));
    await act(async () => {
      screen.getByText('refrescar').click();
    });
    await waitFor(() => expect(client.notifications.list).toHaveBeenCalledTimes(2));
  });

  it('expone el error sin romper la pantalla y conserva los datos anteriores', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [item()], nextCursor: null })
      .mockRejectedValue(new Error('sin conexión'));
    render(
      <NotifyHubProvider client={fakeClient({ list })}>
        <List />
      </NotifyHubProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('items:1'));
    await act(async () => {
      screen.getByText('refrescar').click();
    });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:sin conexión'));
  });

  it('useNotification deja de sondear cuando la notificación termina', async () => {
    const get = vi.fn(async () => fallbackDetail); // DELIVERED = terminal
    function One() {
      const { data } = useNotification('abc', { intervalMs: 500 });
      return <span data-testid="one">{data?.status ?? '…'}</span>;
    }
    render(
      <NotifyHubProvider client={fakeClient({ get })}>
        <One />
      </NotifyHubProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('one')).toHaveTextContent('DELIVERED'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('useNotification sigue sondeando mientras está en curso', async () => {
    const get = vi.fn(async () => ({ ...fallbackDetail, status: 'SENDING' as const }));
    function One() {
      const { data } = useNotification('abc', { intervalMs: 500 });
      return <span data-testid="one">{data?.status ?? '…'}</span>;
    }
    render(
      <NotifyHubProvider client={fakeClient({ get })}>
        <One />
      </NotifyHubProvider>,
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('useNotification con id null no pide nada', async () => {
    const get = vi.fn();
    function One() {
      useNotification(null);
      return null;
    }
    render(
      <NotifyHubProvider client={fakeClient({ get })}>
        <One />
      </NotifyHubProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('usar un hook fuera del proveedor da un error que dice qué hacer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Orphan() {
      useNotifyHubClient();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/NotifyHubProvider/);
    spy.mockRestore();
  });
});
