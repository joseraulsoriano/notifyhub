/** Página de la tienda: HTML, CSS y JS sin dependencias, servida por el mismo Worker. */

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** JSON seguro para incrustar dentro de <script>. */
const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function renderPage(config: { storeName: string; consoleUrl: string }): string {
  const store = escapeHtml(config.storeName);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${store}</title>
<style>
  :root {
    --bg: #f7f5f0; --surface: #ffffff; --ink: #1c1917; --muted: #78716c; --line: #e7e5e4;
    --brand: #c2410c; --brand-ink: #ffffff; --brand-soft: #fff1e6;
    --nh: #4f46e5; --nh-soft: #eef2ff;
    --ok: #15803d; --ok-soft: #dcfce7; --warn: #b45309; --warn-soft: #fef3c7; --bad: #b91c1c; --bad-soft: #fee2e2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161412; --surface: #211e1b; --ink: #f5f5f4; --muted: #a8a29e; --line: #3a3531;
      --brand: #fb923c; --brand-ink: #1c1917; --brand-soft: #3b2415;
      --nh: #a5b4fc; --nh-soft: #262a4a;
      --ok: #4ade80; --ok-soft: #14321f; --warn: #fbbf24; --warn-soft: #3a2c0d; --bad: #f87171; --bad-soft: #3d1717;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { background: var(--surface); border-bottom: 1px solid var(--line); }
  .bar { max-width: 1120px; margin: 0 auto; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
  .logo { font-weight: 800; font-size: 20px; letter-spacing: -.02em; }
  .logo span { color: var(--brand); }
  .badge { margin-left: auto; font-size: 12px; padding: 4px 10px; border-radius: 999px;
    background: var(--nh-soft); color: var(--nh); font-weight: 600; }
  main { max-width: 1120px; margin: 0 auto; padding: 20px 16px 48px; display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  h2 { font-size: 15px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
  .stack > * + * { margin-top: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .product { display: flex; flex-direction: column; gap: 6px; }
  .product .art { font-size: 42px; background: var(--brand-soft); border-radius: 10px; text-align: center; padding: 14px 0; }
  .product .name { font-weight: 600; }
  .product .price { color: var(--muted); }
  button { font: inherit; cursor: pointer; border-radius: 10px; border: 1px solid var(--line);
    background: var(--surface); color: var(--ink); padding: 8px 12px; }
  button:hover:not(:disabled) { border-color: var(--brand); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.primary { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); font-weight: 600; width: 100%; padding: 11px; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 10px 0 4px; }
  input, select { width: 100%; font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--ink); }
  .cart-line { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; }
  .total { display: flex; justify-content: space-between; font-weight: 700; border-top: 1px solid var(--line);
    margin-top: 8px; padding-top: 8px; }
  .muted { color: var(--muted); font-size: 13px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .order-id { font-family: ui-monospace, monospace; font-weight: 700; }
  .notice { border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
  .notice + .notice { margin-top: 10px; }
  .notice .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .notice .title { font-weight: 600; }
  .chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; font-weight: 600; background: var(--nh-soft); color: var(--nh); }
  .chip.ok { background: var(--ok-soft); color: var(--ok); }
  .chip.warn { background: var(--warn-soft); color: var(--warn); }
  .chip.bad { background: var(--bad-soft); color: var(--bad); }
  .notice .body { margin: 6px 0; font-size: 14px; }
  .notice .meta { font-size: 12px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
  .notice a { color: var(--nh); }
  .error { color: var(--bad); font-size: 13px; min-height: 1em; margin-top: 8px; }
  .empty { color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<header><div class="bar">
  <div class="logo">${store}<span>.</span></div>
  <div class="badge">Avisos por NotifyHub</div>
</div></header>
<main>
  <div class="stack">
    <section>
      <h2>Catálogo</h2>
      <div class="grid" id="catalog"></div>
    </section>
    <section id="order-section" hidden>
      <h2>Pedido <span class="order-id" id="order-id"></span></h2>
      <div class="card">
        <p class="muted" style="margin-top:0">Simula lo que pasa con el pedido en el back office. Cada evento le avisa al comprador vía NotifyHub.</p>
        <div class="actions">
          <button data-event="payment.rejected">Pago rechazado</button>
          <button data-event="order.shipped">Marcar como enviado</button>
          <button data-event="order.delivered">Marcar como entregado</button>
          <button data-event="order.confirmed" title="Misma Idempotency-Key: NotifyHub no duplica el aviso">Repetir confirmación</button>
        </div>
        <div class="error" id="order-error"></div>
      </div>
    </section>
    <section>
      <h2>Avisos enviados al comprador</h2>
      <div class="card" id="notices"><p class="empty">Todavía no hay avisos. Confirma un pedido para ver el primero.</p></div>
    </section>
  </div>
  <aside class="stack">
    <section class="card">
      <h2>Carrito</h2>
      <div id="cart"></div>
      <div class="total"><span>Total</span><span id="total">$0.00</span></div>
    </section>
    <form class="card" id="checkout">
      <h2>Datos del comprador</h2>
      <label for="name">Nombre</label>
      <input id="name" required placeholder="Tu nombre" autocomplete="name">
      <label for="email">Correo</label>
      <input id="email" type="email" required placeholder="tu@correo.com" autocomplete="email">
      <label for="phone">Teléfono (formato internacional)</label>
      <input id="phone" required placeholder="+52 y tu número a 10 dígitos" autocomplete="tel" pattern="\\+[1-9][0-9]{7,14}">
      <label for="channel">¿Cómo quieres recibir los avisos?</label>
      <select id="channel">
        <option value="EMAIL">Correo electrónico</option>
        <option value="SMS">SMS</option>
        <option value="PUSH">Notificación push (app)</option>
      </select>
      <div style="margin-top:16px"><button class="primary" id="pay" type="submit" disabled>Pagar y confirmar pedido</button></div>
      <div class="error" id="checkout-error"></div>
    </form>
  </aside>
</main>
<script>
const CONSOLE_URL = ${inlineJson(config.consoleUrl.replace(/\/+$/, ''))};
const PRODUCTS = [
  { id: 'cafe', art: '☕', name: 'Café de Veracruz 500 g', price: 189 },
  { id: 'taza', art: '🫖', name: 'Taza de talavera', price: 249 },
  { id: 'audifonos', art: '🎧', name: 'Audífonos inalámbricos', price: 899 },
  { id: 'mochila', art: '🎒', name: 'Mochila urbana', price: 649 },
];
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const STATUS = {
  RECEIVED: ['Recibido', ''], QUEUED: ['Pendiente', ''], SENDING: ['Enviando', ''],
  RETRYING: ['Reintentando', 'warn'], FALLBACK: ['Cambiando de canal', 'warn'],
  SENT: ['Enviado', 'ok'], DELIVERED: ['Entregado', 'ok'], FAILED: ['Falló', 'bad'],
};
const CHANNEL = { EMAIL: 'correo', SMS: 'SMS', PUSH: 'push', WEBHOOK: 'webhook' };
const TERMINAL = ['SENT', 'DELIVERED', 'FAILED'];

const cart = new Map();
let order = null;
let customer = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');

function renderCatalog() {
  $('catalog').innerHTML = PRODUCTS.map((p) =>
    '<div class="card product"><div class="art">' + p.art + '</div><div class="name">' + esc(p.name) +
    '</div><div class="price">' + money.format(p.price) + '</div><button data-add="' + p.id + '">Agregar</button></div>'
  ).join('');
}

function renderCart() {
  const lines = [...cart.entries()].map(([id, qty]) => ({ ...PRODUCTS.find((p) => p.id === id), qty }));
  $('cart').innerHTML = lines.length
    ? lines.map((l) => '<div class="cart-line"><span>' + l.qty + ' × ' + esc(l.name) + '</span><span>' +
        money.format(l.qty * l.price) + '</span></div>').join('')
    : '<p class="empty">Tu carrito está vacío.</p>';
  $('total').textContent = money.format(lines.reduce((s, l) => s + l.qty * l.price, 0));
  $('pay').disabled = lines.length === 0;
}

async function sendEvent(event) {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, order, customer }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Error ' + res.status);
  addNotice(data);
}

function addNotice(data) {
  const box = $('notices');
  if (box.querySelector('.empty')) box.innerHTML = '';
  const n = data.notification;
  const el = document.createElement('div');
  el.className = 'notice';
  el.innerHTML =
    '<div class="top"><span class="title">' + esc(data.label) + '</span><span class="chip" data-status></span>' +
    (n.replayed ? '<span class="chip warn" title="Misma Idempotency-Key">Duplicado evitado</span>' : '') + '</div>' +
    '<div class="body"><strong>' + esc(data.message.subject || '') + '</strong><br>' + esc(data.message.body) + '</div>' +
    '<div class="meta"><span data-route>Canal preferido: ' + CHANNEL[n.preferredChannel] + '</span>' +
    '<span>Llave: <code>' + esc(data.idempotencyKey) + '</code></span>' +
    (CONSOLE_URL ? '<a target="_blank" rel="noopener" href="' + esc(CONSOLE_URL + '/bitacora?notificationId=' + n.id) + '">Ver en la bitácora</a>' : '') +
    '</div>';
  box.prepend(el);
  setStatus(el, n.status);
  poll(el, n.id);
}

function setStatus(el, status) {
  const [text, tone] = STATUS[status] || [status, ''];
  const chip = el.querySelector('[data-status]');
  chip.textContent = text;
  chip.className = 'chip ' + tone;
}

async function poll(el, id) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 0 : i < 5 ? 600 : 1500));
    const res = await fetch('/api/notifications/' + id);
    if (!res.ok) continue;
    const detail = await res.json();
    setStatus(el, detail.status);
    const attempts = detail.attempts || [];
    const last = attempts[attempts.length - 1];
    if (last) {
      const fallback = attempts.some((a) => a.isFallback);
      el.querySelector('[data-route]').textContent =
        attempts.length + (attempts.length === 1 ? ' intento' : ' intentos') +
        ' · último por ' + CHANNEL[last.channel] + ' (' + last.provider + ')' +
        (fallback ? ' · se cambió de canal' : '');
    }
    if (TERMINAL.includes(detail.status)) return;
  }
}

document.addEventListener('click', async (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    cart.set(add.dataset.add, (cart.get(add.dataset.add) || 0) + 1);
    renderCart();
    return;
  }
  const action = e.target.closest('[data-event]');
  if (action && order) {
    $('order-error').textContent = '';
    action.disabled = true;
    try { await sendEvent(action.dataset.event); }
    catch (err) { $('order-error').textContent = err.message; }
    finally { action.disabled = false; }
  }
});

$('checkout').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('checkout-error').textContent = '';
  const items = [...cart.entries()].map(([id, quantity]) => {
    const p = PRODUCTS.find((x) => x.id === id);
    return { name: p.name, quantity, price: p.price };
  });
  const id = 'PED-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const nextOrder = { id, items };
  const nextCustomer = {
    name: $('name').value, email: $('email').value, phone: $('phone').value, channel: $('channel').value,
  };
  $('pay').disabled = true;
  try {
    order = nextOrder; customer = nextCustomer;
    await sendEvent('order.confirmed');
    $('order-id').textContent = id;
    $('order-section').hidden = false;
    cart.clear();
    renderCart();
  } catch (err) {
    order = null;
    $('checkout-error').textContent = err.message;
    $('pay').disabled = false;
  }
});

renderCatalog();
renderCart();
</script>
</body>
</html>`;
}
