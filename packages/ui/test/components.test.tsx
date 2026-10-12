import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationDetail } from '../src/notification-detail';
import { NotificationItem } from '../src/notification-item';
import { RouteMap } from '../src/route-map';
import { fallbackDetail, item, NOW } from './fixtures';

describe('NotificationItem', () => {
  it('muestra asunto, vista previa, canal, destinatario enmascarado y latencia', () => {
    render(<NotificationItem item={item()} now={NOW} />);
    expect(screen.getByText('Tu pedido #4821 va en camino')).toBeInTheDocument();
    expect(screen.getByText('Tu pedido salió del almacén.')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('a***@example.com')).toBeInTheDocument();
    expect(screen.getByText('hace 5 min')).toBeInTheDocument();
    expect(screen.getByText('245 ms')).toBeInTheDocument();
  });

  it('muestra el transbordo entre canales cuando hubo fallback', () => {
    render(
      <NotificationItem
        item={item({ preferredChannel: 'PUSH', finalChannel: 'SMS', usedFallback: true, attemptCount: 4 })}
        now={NOW}
      />,
    );
    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
    expect(screen.getByLabelText('transbordo')).toBeInTheDocument();
    expect(screen.getByText('4 intentos')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Fallback' })).toBeInTheDocument();
  });

  it('escribe el estado cuando no es entregada y marca la prioridad alta', () => {
    render(<NotificationItem item={item({ status: 'FAILED', priority: 'HIGH' })} now={NOW} />);
    expect(screen.getByText('Fallida')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('no repite el estado de una entregada', () => {
    render(<NotificationItem item={item()} now={NOW} />);
    expect(screen.queryByText('Entregada')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Entregada' })).toBeInTheDocument();
  });

  it('usa la vista previa como título si no hay asunto, y la variante compacta la oculta', () => {
    render(<NotificationItem item={item({ subject: null })} compact now={NOW} />);
    expect(screen.getByText('Tu pedido salió del almacén.')).toBeInTheDocument();
    expect(screen.queryByText('a***@example.com')).not.toBeInTheDocument();
  });

  it('se puede seleccionar con clic y con teclado', () => {
    const onSelect = vi.fn();
    const it1 = item();
    render(<NotificationItem item={it1} onSelect={onSelect} now={NOW} />);
    const row = screen.getByRole('button');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' });
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledWith(it1);
  });
});

describe('NotificationDetail', () => {
  const push = item({
    preferredChannel: 'PUSH',
    finalChannel: 'SMS',
    usedFallback: true,
    attemptCount: 4,
    totalLatencyMs: 5967,
  });

  it('cuenta la ruta con el transbordo y los códigos del proveedor', () => {
    render(<NotificationDetail item={push} detail={fallbackDetail} now={NOW} />);
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps.some((s) => s?.includes('Transbordo a SMS'))).toBe(true);
    expect(screen.getAllByText('503 UNAVAILABLE')).toHaveLength(3);
    expect(screen.getByText('SMabc123')).toBeInTheDocument();
    expect(screen.getByText('+6.40 s')).toBeInTheDocument();
    expect(screen.getByText('Canal final')).toBeInTheDocument();
  });

  it('muestra "Cargando" mientras no llega el detalle y deja ver las propiedades', () => {
    render(<NotificationDetail item={push} loading now={NOW} />);
    expect(screen.getByText('Cargando la ruta…')).toBeInTheDocument();
    expect(screen.getByText('a***@example.com')).toBeInTheDocument();
  });

  it('copia el id y avisa al llamador', () => {
    const onCopyId = vi.fn();
    render(<NotificationDetail item={push} onCopyId={onCopyId} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar ID' }));
    expect(onCopyId).toHaveBeenCalledWith(push.id);
  });

  it('muestra las acciones que se le pasan', () => {
    render(<NotificationDetail item={push} actions={<button>Reenviar</button>} now={NOW} />);
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeInTheDocument();
  });
});

describe('RouteMap', () => {
  const flows = [
    { channel: 'EMAIL' as const, received: 6150, delivered: 6120 },
    { channel: 'SMS' as const, received: 3400, delivered: 3380 },
    { channel: 'PUSH' as const, received: 2206, delivered: 2140 },
    { channel: 'WEBHOOK' as const, received: 840, delivered: 840 },
  ];
  const providers = [
    {
      code: 'sendgrid',
      channel: 'EMAIL' as const,
      costPerMessage: 0,
      reliabilityScore: 95,
      health: 'UP' as const,
      enabled: true,
    },
    {
      code: 'fcm',
      channel: 'PUSH' as const,
      costPerMessage: 0,
      reliabilityScore: 92,
      health: 'DOWN' as const,
      enabled: true,
    },
  ];

  it('dibuja las cuatro líneas, las cifras y el transbordo', () => {
    render(
      <RouteMap flows={flows} providers={providers} transfers={[{ from: 'PUSH', to: 'SMS', count: 66 }]} />,
    );
    expect(screen.getByRole('img', { name: /Mapa de rutas/ })).toBeInTheDocument();
    // Recibidas y En cola muestran la misma cifra; Entregadas, la de entregas.
    expect(screen.getAllByText('6,150')).toHaveLength(2);
    expect(screen.getByText('6,120')).toBeInTheDocument();
    expect(screen.getByText('66 pasan de Push a SMS')).toBeInTheDocument();
    expect(screen.getByText('fcm · caído')).toBeInTheDocument();
    expect(screen.getByText('sendgrid')).toBeInTheDocument();
  });
});
