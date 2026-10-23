// Genera NotifyHub.pptx (presenta Andreea Margarita Maldonado Morales).
// Uso: npm install && node make-assets.cjs && PPTX_APPLY_THEME=/ruta/a/apply_theme.js node build-deck.cjs
// La identidad (colores, líneas por canal, naranja solo para el transbordo) viene de DESIGN.md.
const pptxgen = require('pptxgenjs');
const path = require('path');
const A = (f) => path.join(__dirname, 'assets', f);
// Script apply_theme.js de la skill pptx; se indica con PPTX_APPLY_THEME.
const SK = process.env.PPTX_APPLY_THEME;
if (!SK) throw new Error('Falta PPTX_APPLY_THEME: ruta al apply_theme.js de la skill pptx.');

const THEME = {
  name: 'NotifyHub',
  headFontFace: 'Arial',
  // Arial y no Calibri: Calibri solo viene con Office; sin él (Mac, Quick Look, Keynote) se sustituye y el texto se encima.
  bodyFontFace: 'Arial',
  colors: {
    dk1: '12151A', // tinta
    lt1: 'F3F2ED', // papel
    dk2: '4A4F57', // tinta suave
    lt2: 'FFFFFF', // superficie
    accent1: 'FF5A1F', // transbordo (fallback)
    accent2: '1B5FE0', // línea Email
    accent3: '0E9F8E', // línea SMS
    accent4: 'D9A300', // línea Push
    accent5: 'C2338A', // línea Webhook
    accent6: '137A4B', // entregada
    hlink: '1B5FE0',
    folHlink: '4A4F57',
  },
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'NotifyHub · Tu mensaje siempre llega';
pres.author = 'Andreea Margarita Maldonado Morales y José Raúl Soriano Cazabal';
pres.subject = 'Servicio de notificaciones multicanal con fallback';
const C = pres.SchemeColor;

const FOOT = 'NotifyHub · Presenta Andreea Margarita Maldonado Morales';
pres.defineSlideMaster({
  title: 'CONTENIDO',
  background: { color: C.background1 },
  slideNumber: { x: 12.1, y: 7.02, w: 0.65, h: 0.3, fontSize: 10, color: C.text2, align: 'right' },
  objects: [
    { text: { text: FOOT, options: { x: 0.6, y: 7.02, w: 8, h: 0.3, fontSize: 10, color: C.text2, margin: 0, isTextBox: true } } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 12.1, h: 0.95, fontSize: 32, bold: true, color: C.text1, margin: 0, align: 'left', valign: 'middle' }, text: '' } },
  ],
});
pres.defineSlideMaster({ title: 'PORTADA', background: { color: C.text1 }, objects: [] });

// ---------- utilidades ----------
// Métricas reales de las fuentes para medir el texto (no hay LibreOffice para revisarlo a ojo).
const opentype = require('opentype.js');
const FONTS = '/System/Library/Fonts/Supplemental/';
const FACE = {
  regular: opentype.loadSync(FONTS + 'Arial.ttf'),
  bold: opentype.loadSync(FONTS + 'Arial Bold.ttf'),
  mono: opentype.loadSync(FONTS + 'Courier New.ttf'),
};
const SLACK = 0.92; // ancho útil: margen para que otros visores (Keynote, Google Slides) no rompan antes la línea
/** Comprueba que el texto cabe en su caja, partiendo líneas por palabras como lo hace PowerPoint. */
function fits(label, text, w, h, pt, { bold = false, mono = false, spaceAfter = 0 } = {}) {
  const font = mono ? FACE.mono : bold ? FACE.bold : FACE.regular;
  const max = w * 72 * SLACK;
  const width = (s) => font.getAdvanceWidth(s, pt);
  let lines = 0;
  for (const para of String(text).split('\n')) {
    let cur = '';
    lines += 1;
    for (const word of para.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && width(next) > max) { lines += 1; cur = word; } else cur = next;
    }
  }
  const need = (lines * pt * 1.2 + String(text).split('\n').length * spaceAfter) / 72;
  if (need > h + 0.02) throw new Error(`Desborda "${label}": necesita ${need.toFixed(2)}" y hay ${h}" (${lines} líneas de ${pt}pt)`);
  return lines;
}
/** Texto con comprobación de ajuste. */
function T(slide, name, text, o) {
  const indent = o.bullet ? (o.bullet.indent || 27) / 72 : 0;
  fits(name, text, o.w - indent, o.h, o.fontSize, { bold: o.bold, mono: o.fontFace === 'Courier New', spaceAfter: o.paraSpaceAfter || 0 });
  slide.addText(text, { margin: 0, isTextBox: true, valign: 'top', objectName: name, ...o });
}
const line = (slide, name, x, y, w, h, color, extra = {}) => {
  const ln = { color, width: extra.width || 2 };
  if (extra.arrow) ln.endArrowType = 'triangle';
  if (extra.dash) ln.dashType = extra.dash;
  slide.addShape(pres.ShapeType.line, { x, y, w, h, line: ln, flipH: !!extra.flipH, objectName: name });
};
/** Flecha de (x1, y1) a (x2, y2): calcula la caja y los volteos para que la punta quede en el destino. */
const arrow = (slide, name, x1, y1, x2, y2, color) =>
  slide.addShape(pres.ShapeType.line, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color, width: 2.25, endArrowType: 'triangle' },
    objectName: name,
  });
/**
 * Caja de diagrama con su texto centrado. El texto va en cuadros sin margen encima de la forma y no dentro de ella:
 * Quick Look aplica el margen interno de una forma como desplazamiento y el texto se corre a la derecha y abajo.
 * Cada renglón es [texto, { fontSize, bold, color, gap }]; gap es el espacio previo en pulgadas.
 */
function node(slide, name, x, y, w, h, runs, { stroke = C.text1, width = 1.5 } = {}) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: C.background2 }, line: { color: stroke, width }, rectRadius: 0.1, objectName: name });
  const pad = 0.15, inner = w - 2 * pad;
  const blocks = runs.map(([text, o]) => ({ text, o, th: (fits(`${name}: ${text}`, text, inner, h, o.fontSize, { bold: o.bold }) * o.fontSize * 1.2) / 72 }));
  let cy = y + (h - blocks.reduce((n, b) => n + b.th + (b.o.gap || 0), 0)) / 2;
  blocks.forEach(({ text, o, th }, i) => {
    cy += o.gap || 0;
    slide.addText(text, { x: x + pad, y: cy, w: inner, h: th, margin: 0, isTextBox: true, valign: 'top', align: 'center', fontSize: o.fontSize, bold: o.bold, color: o.color, objectName: `${name} texto ${i + 1}` });
    cy += th;
  });
}
const card = (slide, name, x, y, w, h) =>
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: C.background2 }, line: { color: C.background1, width: 0.5 }, rectRadius: 0.12, shadow: { type: 'outer', color: '000000', opacity: 0.1, blur: 6, offset: 2, angle: 90 }, objectName: name });
const dot = (slide, name, x, y, d, color, filled = false) =>
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: filled ? color : C.background2 }, line: { color, width: 3 }, objectName: name });
const diamond = (slide, name, x, y, d) => slide.addShape(pres.ShapeType.diamond, { x, y, w: d, h: d, fill: { color: C.accent1 }, line: { color: C.accent1, width: 1 }, objectName: name });
const pill = (slide, name, x, y, w, color) => slide.addShape(pres.ShapeType.roundRect, { x, y, w, h: 0.12, fill: { color }, line: { color, width: 0 }, rectRadius: 0.06, objectName: name });
function title(slide, text) {
  fits('título', text, 12.1, 0.95, 32, { bold: true });
  slide.addText(text, { placeholder: 'title' });
}
const CH = [
  { n: 'Email', c: C.accent2 },
  { n: 'SMS', c: C.accent3 },
  { n: 'Push', c: C.accent4 },
  { n: 'Webhook', c: C.accent5 },
];

// ============ 1. Portada ============
pres.addSection({ title: 'Apertura' });
{
  const s = pres.addSlide({ masterName: 'PORTADA', sectionTitle: 'Apertura' });
  s.addImage({ path: A('logo-paper.png'), x: 0.8, y: 0.9, w: 1.4, h: 1.4, altText: 'Logo de NotifyHub: una ruta principal y una de respaldo que llegan al mismo destino' });
  T(s, 'Nombre', 'notifyhub', { x: 0.8, y: 2.45, w: 8.2, h: 1.3, fontSize: 72, bold: true, color: C.background1, fontFace: 'Arial' });
  T(s, 'Lema', 'Tu mensaje siempre llega', { x: 0.8, y: 3.8, w: 8.2, h: 0.7, fontSize: 32, color: C.accent1 });
  T(s, 'Descripción', 'Servicio de notificaciones multicanal con fallback. Proyecto de Arquitectura de Software.', { x: 0.8, y: 4.65, w: 7.6, h: 0.9, fontSize: 18, color: C.background1 });
  T(s, 'Presenta', 'Presenta: Andreea Margarita Maldonado Morales', { x: 0.8, y: 6.05, w: 8, h: 0.4, fontSize: 20, bold: true, color: C.background1 });
  T(s, 'Equipo', 'Trabajo en conjunto con José Raúl Soriano Cazabal', { x: 0.8, y: 6.5, w: 8, h: 0.4, fontSize: 16, color: C.background1 });
  // Mapa de rutas: cuatro líneas, una por canal; el transbordo en naranja.
  const x0 = 9.4, x1 = 12.6;
  [['Email', C.accent2, 2.0], ['SMS', C.accent3, 3.1], ['Push', C.accent4, 4.2], ['Webhook', C.accent5, 5.3]].forEach(([n, c, y]) => {
    s.addShape(pres.ShapeType.roundRect, { x: x0, y: y - 0.05, w: x1 - x0, h: 0.1, fill: { color: c }, line: { color: c, width: 0 }, rectRadius: 0.05, objectName: `Línea ${n}` });
    [x0, (x0 + x1) / 2, x1].forEach((x, i) => s.addShape(pres.ShapeType.ellipse, { x: x - 0.14, y: y - 0.14, w: 0.28, h: 0.28, fill: { color: C.text1 }, line: { color: c, width: 3 }, objectName: `Estación ${n} ${i + 1}` }));
  });
  s.addShape(pres.ShapeType.diamond, { x: 11.0, y: 3.62, w: 0.3, h: 0.3, fill: { color: C.accent1 }, line: { color: C.accent1, width: 1 }, objectName: 'Transbordo' });
  line(s, 'Conector de transbordo', 11.14, 3.1, 0.02, 1.1, C.accent1, { dash: 'sysDot', width: 3 });
  s.addNotes(
    'Buenas tardes. Soy Andreea y voy a presentar NotifyHub, el proyecto que construimos José Raúl y yo en conjunto para Arquitectura de Software. ' +
      'NotifyHub es un servicio que manda notificaciones por correo, SMS, push y webhook, y se asegura de que lleguen: si un canal falla, el sistema prueba otro solo. ' +
      'El logo cuenta esa idea: una ruta principal y una de respaldo que llegan al mismo destino. Dura unos diez minutos y termina con una demostración.',
  );
}

// ============ 2. La idea ============
pres.addSection({ title: 'La idea' });
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'La idea' });
  title(s, 'Un mapa de metro para tus mensajes');
  const rows = [
    ['Canal = línea', 'Email, SMS, Push y Webhook. Cada canal es una línea de su propio color.', 'lines'],
    ['Proveedor = estación', 'SendGrid, Twilio, FCM y webhook. Cada intento de envío es una parada.', 'station'],
    ['Fallback = transbordo', 'Si un canal agota sus reintentos, el mensaje pasa a otro y llega igual.', 'xfer'],
    ['Destino = entregada', 'Cada notificación termina entregada o fallida, con su bitácora completa.', 'end'],
  ];
  rows.forEach(([h, d, kind], i) => {
    const y = 1.75 + i * 1.28;
    card(s, `Tarjeta ${i + 1}`, 0.6, y, 6.4, 1.1);
    if (kind === 'lines') CH.forEach((c, k) => pill(s, `Línea ${c.n}`, 0.85, y + 0.28 + k * 0.17, 0.55, c.c));
    if (kind === 'station') dot(s, 'Estación', 0.95, y + 0.4, 0.32, C.accent2);
    if (kind === 'xfer') diamond(s, 'Transbordo', 0.95, y + 0.4, 0.32);
    if (kind === 'end') dot(s, 'Destino', 0.95, y + 0.4, 0.32, C.accent6, true);
    T(s, `Título ${i + 1}`, h, { x: 1.7, y: y + 0.14, w: 5.1, h: 0.36, fontSize: 18, bold: true, color: C.text1 });
    T(s, `Texto ${i + 1}`, d, { x: 1.7, y: y + 0.52, w: 5.1, h: 0.52, fontSize: 14, color: C.text2 });
  });
  // Ejemplo: Push falla tres veces, transbordo a SMS, entrega.
  const rx = 7.6;
  card(s, 'Ejemplo', rx, 1.75, 5.15, 5.0);
  T(s, 'Ejemplo título', 'Un push que falla', { x: rx + 0.35, y: 1.95, w: 4.5, h: 0.4, fontSize: 20, bold: true, color: C.text1 });
  // línea Push hasta el transbordo
  s.addShape(pres.ShapeType.roundRect, { x: rx + 0.5, y: 3.15, w: 2.3, h: 0.1, fill: { color: C.accent4 }, line: { color: C.accent4, width: 0 }, rectRadius: 0.05, objectName: 'Línea Push' });
  [0.5, 1.4, 2.3].forEach((dx, i) => s.addShape(pres.ShapeType.ellipse, { x: rx + dx - 0.14, y: 3.06, w: 0.28, h: 0.28, fill: { color: C.background2 }, line: { color: C.accent4, width: 3 }, objectName: `Intento Push ${i + 1}` }));
  // Encima de la línea: debajo chocaba con el conector y el rombo del transbordo.
  T(s, 'Etiqueta Push', 'Push · 3 intentos con error 503', { x: rx + 0.35, y: 2.6, w: 3.4, h: 0.35, fontSize: 14, color: C.text2 });
  // transbordo
  line(s, 'Conector', rx + 2.8, 3.2, 0.7, 1.1, C.accent1, { dash: 'sysDot', width: 3 });
  diamond(s, 'Transbordo', rx + 3.0, 3.55, 0.3);
  // línea SMS
  s.addShape(pres.ShapeType.roundRect, { x: rx + 3.5, y: 4.25, w: 1.35, h: 0.1, fill: { color: C.accent3 }, line: { color: C.accent3, width: 0 }, rectRadius: 0.05, objectName: 'Línea SMS' });
  dot(s, 'Entrega SMS', rx + 4.7, 4.16, 0.28, C.accent3, true);
  T(s, 'Etiqueta SMS', 'SMS · entregada', { x: rx + 3.35, y: 4.65, w: 1.6, h: 0.35, fontSize: 14, color: C.text2 });
  T(s, 'Ejemplo texto', 'El usuario no se entera del fallo: recibe el mensaje por SMS, y el sistema deja registrado cada intento.', { x: rx + 0.35, y: 5.45, w: 4.45, h: 1.0, fontSize: 16, color: C.text1 });
  s.addNotes(
    'La idea que ordena todo el proyecto es un mapa de metro. Cada canal es una línea de color, cada proveedor es una estación y cada intento es una parada. ' +
      'Cuando un canal agota sus reintentos, el mensaje hace un transbordo a otro canal, y ese transbordo es lo único que pintamos en naranja. ' +
      'En el ejemplo de la derecha, un push falla tres veces con error 503, el sistema hace el transbordo a SMS y el mensaje se entrega. Quien lo recibe nunca nota el fallo.',
  );
}

// ============ 3. Demo: Resumen ============
pres.addSection({ title: 'Demostración' });
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Demostración' });
  title(s, 'El Resumen muestra todo el tráfico');
  const h = 5.15, w = (h * 1056) / 700; // alto acotado para que la captura no tape el pie de página
  s.addImage({ path: A('resumen.png'), x: 0.6, y: 1.6, w, h, altText: 'Captura del Resumen: mapa de rutas con cuatro líneas, estaciones y un transbordo de Push a SMS' });
  const items = [
    ['Una línea por canal', 'De recibidas a entregadas, con cifras reales de la API.', C.accent2],
    ['Naranja = transbordo', 'Envíos que cambiaron de canal porque el primero falló.', C.accent1],
    ['Proveedores a la vista', 'Si uno está caído o degradado, se marca en la propia línea.', C.accent3],
  ];
  items.forEach(([h2, d, c], i) => {
    const y = 1.75 + i * 1.6;
    pill(s, `Marcador ${i + 1}`, 9.3, y + 0.1, 0.5, c);
    T(s, `Título ${i + 1}`, h2, { x: 9.3, y: y + 0.3, w: 3.5, h: 0.36, fontSize: 18, bold: true, color: C.text1 });
    T(s, `Texto ${i + 1}`, d, { x: 9.3, y: y + 0.72, w: 3.5, h: 0.66, fontSize: 14, color: C.text2 });
  });
  s.addNotes(
    'Esta es la consola web. El Resumen abre con el mapa de rutas: cada línea es un canal y los puntos son las estaciones, desde que se recibe el mensaje hasta que se entrega. ' +
      'La línea punteada naranja son los envíos que cambiaron de canal porque el primero falló. Si un proveedor está caído o degradado, se marca ahí mismo. ' +
      'Estas cifras no son un dibujo: salen de la API real y se actualizan solas. [Aquí se puede pasar a la demostración en vivo.]',
  );
}

// ============ 4. Demo: ruta del mensaje ============
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Demostración' });
  title(s, 'La ruta de un mensaje, intento por intento');
  const rows = [
    ['Solicitud recibida', 'POST /v1/notifications · 202', '+0 ms', C.text2, 'dot'],
    ['Encolada', 'Cola de prioridad media', '+20 ms', C.accent4, 'dot'],
    ['Intento 1 · fcm', 'Push · 503 UNAVAILABLE', '+2.32 s', C.accent4, 'dot'],
    ['Intento 2 · fcm', 'Push · 503 UNAVAILABLE', '+3.07 s', C.accent4, 'dot'],
    ['Intento 3 · fcm', 'Push · 503 UNAVAILABLE', '+4.23 s', C.accent4, 'dot'],
    ['Transbordo a SMS', 'Push agotó sus reintentos', '+4.25 s', C.accent1, 'xfer'],
    ['Intento 4 · twilio', 'SMS · entregada al proveedor', '+4.52 s', C.accent3, 'ok'],
  ];
  const x = 0.9, y0 = 1.65, step = 0.76;
  rows.forEach(([h, d, t, c, kind], i) => {
    const y = y0 + i * step;
    if (i < rows.length - 1) {
      const next = rows[i + 1];
      s.addShape(pres.ShapeType.roundRect, { x: x + 0.1, y: y + 0.28, w: 0.08, h: step - 0.3, fill: { color: kind === 'xfer' ? C.accent1 : c }, line: { color: kind === 'xfer' ? C.accent1 : c, width: 0 }, rectRadius: 0.04, objectName: `Riel ${i + 1}` });
    }
    if (kind === 'xfer') diamond(s, `Estación ${i + 1}`, x - 0.01, y + 0.02, 0.3);
    else dot(s, `Estación ${i + 1}`, x, y + 0.03, 0.28, c, kind === 'ok');
    T(s, `Paso ${i + 1}`, h, { x: x + 0.55, y, w: 4.6, h: 0.32, fontSize: 18, bold: true, color: kind === 'xfer' ? C.accent1 : C.text1 });
    T(s, `Detalle ${i + 1}`, d, { x: x + 0.55, y: y + 0.34, w: 4.6, h: 0.3, fontSize: 12, color: C.text2 });
    T(s, `Tiempo ${i + 1}`, t, { x: x + 5.2, y: y + 0.02, w: 1.3, h: 0.3, fontSize: 14, color: C.text2, fontFace: 'Courier New', align: 'right' });
  });
  const stats = [
    ['3 intentos', 'por proveedor, con espera de 0.5 s y 1 s entre ellos'],
    ['Transbordo', 'Push agotó sus reintentos, así que el despachador pasa a SMS'],
    ['4.5 s', 'de la solicitud a la entrega, medido por la API'],
  ];
  stats.forEach(([big, small], i) => {
    const y = 1.75 + i * 1.7;
    card(s, `Dato ${i + 1}`, 8.6, y, 4.15, 1.45);
    T(s, `Cifra ${i + 1}`, big, { x: 8.9, y: y + 0.12, w: 3.6, h: 0.6, fontSize: 30, bold: true, color: i === 1 ? C.accent1 : C.text1 });
    T(s, `Explicación ${i + 1}`, small, { x: 8.9, y: y + 0.78, w: 3.6, h: 0.6, fontSize: 14, color: C.text2 });
  });
  s.addNotes(
    'Aquí está la ruta de un mensaje real. Es un push de oferta que mandamos desde la consola con Firebase marcado como caído. ' +
      'El sistema lo intenta tres veces con espera creciente y cada intento falla con un 503. Entonces hace el transbordo a SMS, Twilio lo acepta y el mensaje se entrega. ' +
      'Todo esto lo guarda la bitácora con su hora exacta. Los tiempos que ven son de una ejecución real: de la solicitud a la entrega pasaron cuatro segundos y medio.',
  );
}

// ============ 5. Arquitectura ============
pres.addSection({ title: 'Cómo está hecho' });
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Cómo está hecho' });
  title(s, 'Todo en el plan gratuito de Cloudflare');
  const box = (name, x, y, w, h, head, sub, stroke) =>
    node(s, name, x, y, w, h, [[head, { fontSize: 16, bold: true, color: C.text1 }], [sub, { fontSize: 12, color: C.text2, gap: 0.06 }]], { stroke });
  const bw = 2.7, bh = 1.25;
  box('Consola', 0.6, 1.8, bw, bh, 'Consola y SDK', 'Astro + React, @notifyhub/client');
  box('API', 3.75, 1.8, bw, bh, 'API · Worker', 'Hono: recibe, valida y encola');
  box('Colas', 6.9, 1.8, bw, bh, 'Colas (Queues)', 'Una cola por prioridad: alta, media y baja');
  box('Despachador', 10.05, 1.8, bw, bh, 'Despachador', 'Worker: reintentos, estrategia y fallback', C.accent1);
  box('Límite', 3.75, 4.35, bw, bh, 'Límite de uso', 'Durable Object por cliente');
  box('Base', 6.9, 4.35, bw, bh, 'Postgres en Neon', 'Hyperdrive: notificaciones, intentos y bitácora');
  box('Proveedores', 10.05, 4.35, bw, bh, 'Proveedores', 'SendGrid, Twilio, FCM y webhook (simulados)');
  const mid = 1.8 + bh / 2, bottom = 1.8 + bh, top2 = 4.35;
  arrow(s, 'Flecha consola-API', 0.6 + bw, mid, 3.75, mid, C.text1);
  arrow(s, 'Flecha API-colas', 3.75 + bw, mid, 6.9, mid, C.text1);
  arrow(s, 'Flecha colas-despachador', 6.9 + bw, mid, 10.05, mid, C.text1);
  arrow(s, 'Flecha API-límite', 3.75 + bw / 2, bottom, 3.75 + bw / 2, top2, C.text1);
  arrow(s, 'Flecha despachador-proveedores', 10.05 + bw / 2, bottom, 10.05 + bw / 2, top2, C.accent1);
  arrow(s, 'Flecha API-base', 3.75 + bw * 0.8, bottom, 6.9 + 0.5, top2, C.text1);
  arrow(s, 'Flecha despachador-base', 10.05 + bw * 0.2, bottom, 6.9 + bw - 0.5, top2, C.text1);
  T(s, 'Nota', 'Workers, Queues, Hyperdrive y Durable Objects son del plan gratuito; el Postgres es el plan gratuito de Neon. La arquitectura sigue capas: dominio, aplicación y adaptadores.', { x: 0.6, y: 6.2, w: 12.1, h: 0.7, fontSize: 16, color: C.text1 });
  s.addNotes(
    'Así está hecho. El cliente, ya sea la consola o el SDK, llama a la API, que es un Worker de Cloudflare. La API valida la solicitud, la guarda en Postgres y la pone en una cola según su prioridad. ' +
      'Otro Worker, el despachador, toma el mensaje de la cola, decide con qué proveedor enviarlo, reintenta y hace el fallback cuando hace falta. Cada intento queda registrado. ' +
      'Un Durable Object lleva el límite de solicitudes por cliente. Todo cabe en el plan gratuito de Cloudflare, y el código está en capas: dominio, aplicación y adaptadores.',
  );
}

// ============ 6. Patrones ============
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Cómo está hecho' });
  title(s, 'Cuatro patrones de diseño, cada uno su rol');
  const cards = [
    ['Factory Method', 'SenderCreator y SenderRegistry', 'Cada proveedor tiene su creador. Agregar uno nuevo es registrar un creador, sin tocar el despachador.', C.accent2],
    ['Template Method', 'BaseSender', 'Fija los pasos de un envío: validar, enviar e interpretar la respuesta. Cada proveedor solo implementa su llamada.', C.accent3],
    ['Strategy', 'Costo, Prioridad y Disponibilidad', 'Elige el orden de los proveedores según la prioridad del mensaje: alta favorece disponibilidad y baja favorece costo.', C.accent4],
    ['Observer', 'EventPublisher', 'Publica cada cambio de estado e intento. Si un suscriptor falla, el envío y los demás suscriptores no se afectan.', C.accent5],
  ];
  cards.forEach(([n, where, what, c], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.7 + Math.floor(i / 2) * 2.62;
    card(s, `Patrón ${i + 1}`, x, y, 5.95, 2.4);
    pill(s, `Marcador ${i + 1}`, x + 0.3, y + 0.3, 0.55, c);
    T(s, `Nombre ${i + 1}`, n, { x: x + 0.3, y: y + 0.5, w: 5.3, h: 0.42, fontSize: 22, bold: true, color: C.text1 });
    T(s, `Dónde ${i + 1}`, where, { x: x + 0.3, y: y + 0.98, w: 5.3, h: 0.32, fontSize: 14, color: C.text2, fontFace: 'Courier New' });
    T(s, `Qué hace ${i + 1}`, what, { x: x + 0.3, y: y + 1.38, w: 5.3, h: 0.9, fontSize: 14, color: C.text1 });
  });
  s.addNotes(
    'El proyecto gira en torno a cuatro patrones de diseño. Factory Method: cada proveedor tiene su creador, y agregar uno nuevo es registrar un creador. ' +
      'Template Method: una clase base define los pasos de un envío y cada proveedor solo implementa su llamada. ' +
      'Strategy: tres formas de ordenar los proveedores, por costo, por prioridad o por disponibilidad, y se elige según la prioridad del mensaje. ' +
      'Y Observer: se publica cada cambio de estado, y si un suscriptor falla, el envío no se entera.',
  );
}

// ============ 7. Fallback por dentro ============
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Cómo está hecho' });
  title(s, 'El fallback por dentro: máquina de estados');
  // Estados y transiciones del dominio (packages/domain, docs/diagrams/06-estados.mmd).
  const W = 1.7, H = 0.7, R1 = 1.75, R2 = 3.3;
  const st = (n, c, x, y) => node(s, `Estado ${n}`, x, y, W, H, [[n, { fontSize: 15, bold: true, color: C.text1 }]], { stroke: c, width: 2.5 });
  st('Recibida', C.text2, 0.6, R1);
  st('En cola', C.text2, 2.6, R1);
  st('Enviando', C.accent2, 4.6, R1);
  st('Enviada', C.accent3, 8.6, R1);
  st('Entregada', C.accent6, 10.6, R1);
  st('Reintentando', C.accent4, 3.6, R2);
  st('Fallback', C.accent1, 6.6, R2);
  st('Fallida', 'B3122E', 10.6, R2);
  const m1 = R1 + H / 2, m2 = R2 + H / 2, b1 = R1 + H;
  arrow(s, 'Recibida a En cola', 2.3, m1, 2.6, m1, C.text1);
  arrow(s, 'En cola a Enviando', 4.3, m1, 4.6, m1, C.text1);
  arrow(s, 'Enviando a Enviada', 6.3, m1, 8.6, m1, C.text1);
  arrow(s, 'Enviada a Entregada', 10.3, m1, 10.6, m1, C.text1);
  arrow(s, 'Enviando a Reintentando', 4.8, b1, 4.8, R2, C.accent4);
  arrow(s, 'Reintentando a Enviando', 5.1, R2, 5.1, b1, C.accent4);
  arrow(s, 'Reintentando a Fallback', 5.3, m2, 6.6, m2, C.accent1);
  arrow(s, 'Fallback a Enviando', 6.9, R2, 6.15, b1, C.accent1);
  arrow(s, 'Fallback a Fallida', 8.3, m2, 10.6, m2, C.text1);
  const lbl = (name, text, x, y, w, h, align) => T(s, name, text, { x, y, w, h, fontSize: 11, color: C.text2, align });
  lbl('Nota acepta', 'el proveedor acepta', 6.35, m1 - 0.32, 2.2, 0.25, 'center');
  lbl('Nota error', 'error', 3.4, 2.75, 1.3, 0.25, 'right');
  lbl('Nota espera', 'tras la\nespera', 5.2, 2.62, 0.9, 0.5, 'left');
  lbl('Nota agotados', 'agotados', 5.3, m2 - 0.32, 1.3, 0.25, 'center');
  lbl('Nota siguiente', 'siguiente canal', 6.95, 2.75, 1.6, 0.25, 'left');
  lbl('Nota sin alternativas', 'sin alternativas', 8.35, m2 - 0.32, 2.2, 0.25, 'center');
  const stats = [
    ['3 intentos', 'por proveedor, con espera exponencial (0.5 s, 1 s)'],
    ['3 canales', 'Push pasa a SMS y luego a Email, según los datos de contacto'],
    ['9 intentos', 'como máximo con tres canales, antes de marcarla como fallida'],
  ];
  stats.forEach(([big, small], i) => {
    const x = 0.6 + i * 4.1;
    card(s, `Dato ${i + 1}`, x, 4.4, 3.9, 1.65);
    T(s, `Cifra ${i + 1}`, big, { x: x + 0.3, y: 4.55, w: 3.3, h: 0.6, fontSize: 28, bold: true, color: i === 0 ? C.accent4 : i === 1 ? C.accent3 : C.text1 });
    T(s, `Explicación ${i + 1}`, small, { x: x + 0.3, y: 5.2, w: 3.3, h: 0.75, fontSize: 14, color: C.text2 });
  });
  T(s, 'Garantía', 'Una transición inválida es imposible: el dominio la rechaza y las pruebas lo verifican.', { x: 0.6, y: 6.3, w: 12.1, h: 0.5, fontSize: 16, color: C.text1 });
  s.addNotes(
    'Por dentro, el fallback es una máquina de estados. Una notificación pasa de recibida a en cola, a enviando. Si el proveedor falla, pasa a reintentando, espera y vuelve a enviando, hasta tres veces. ' +
      'Si se agotan, pasa a fallback y vuelve a enviando con el siguiente canal. Si algún canal entrega, termina entregada; si no queda ninguno, termina fallida. ' +
      'Con tres canales son hasta nueve intentos. Y las transiciones inválidas son imposibles: el dominio las rechaza y las pruebas lo verifican.',
  );
}

// ============ 8. Capas ============
// Pensadas para verse, no para leerse: una idea por diapositiva y casi todo en el dibujo.
pres.addSection({ title: 'Ingeniería' });
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Ingeniería' });
  title(s, 'Construido por capas');
  // De arriba abajo, como dependen: cada capa solo conoce a las de abajo (package.json de cada paquete).
  const layers = [
    ['Apps', 'api · dispatcher · console', C.accent5],
    ['Adaptadores', 'persistence · providers', C.accent4],
    ['Aplicación', 'application', C.accent3],
    ['Dominio', 'domain', C.accent2],
  ];
  const x = 0.6, w = 9.4, h = 1.0, y0 = 1.7, step = 1.18;
  layers.forEach(([n, pk, c], i) => {
    const y = y0 + i * step, inset = i * 0.35; // cada capa más angosta: el centro es el dominio
    s.addShape(pres.ShapeType.roundRect, { x: x + inset, y, w: w - 2 * inset, h, fill: { color: C.background2 }, line: { color: c, width: 2.5 }, rectRadius: 0.1, objectName: `Capa ${n}` });
    pill(s, `Marcador ${n}`, x + inset + 0.3, y + 0.44, 0.5, c);
    T(s, `Capa ${n} nombre`, n, { x: x + inset + 1.0, y: y + 0.3, w: 3.0, h: 0.42, fontSize: 22, bold: true, color: C.text1 });
    T(s, `Capa ${n} paquetes`, pk, { x: x + inset + 4.0, y: y + 0.36, w: w - 2 * inset - 4.3, h: 0.32, fontSize: 15, color: C.text2, fontFace: 'Courier New', align: 'right' });
  });
  arrow(s, 'Dependencias hacia dentro', 10.6, y0 + 0.2, 10.6, y0 + 3 * step + h - 0.2, C.text1);
  T(s, 'Nota dependencias', 'todo apunta\nal dominio', { x: 10.85, y: 3.35, w: 1.9, h: 0.7, fontSize: 15, color: C.text2 });
  T(s, 'Idea', 'El dominio no sabe qué base de datos ni qué proveedor usamos.', { x: 0.6, y: 6.4, w: 12.1, h: 0.45, fontSize: 18, bold: true, color: C.text1 });
  s.addNotes(
    'El código está en capas, como una cebolla. En el centro está el dominio: las notificaciones, sus eventos y la máquina de estados. Son reglas puras, no saben si hay Postgres, Twilio o Cloudflare. ' +
      'Encima van los casos de uso, luego los adaptadores que hablan con la base de datos y con los proveedores, y afuera las aplicaciones: la API, el despachador y la consola. ' +
      'Las dependencias siempre apuntan hacia el dominio, por eso podemos cambiar de proveedor o de base de datos sin tocar las reglas del negocio.',
  );
}

// ============ 9. Monorepo ============
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Ingeniería' });
  title(s, 'Un repositorio, un comando');
  card(s, 'Repositorio', 0.6, 1.65, 7.6, 4.4);
  T(s, 'Raíz', 'notifyhub/', { x: 0.95, y: 1.85, w: 4, h: 0.4, fontSize: 20, bold: true, color: C.text1, fontFace: 'Courier New' });
  const chips = (label, names, y, c) => {
    T(s, `${label} carpeta`, label, { x: 0.95, y, w: 2, h: 0.35, fontSize: 16, bold: true, color: C.text2, fontFace: 'Courier New' });
    names.forEach((n, i) => {
      const cx = 0.95 + (i % 3) * 2.35, cy = y + 0.45 + Math.floor(i / 3) * 0.62;
      node(s, `${label} ${n}`, cx, cy, 2.15, 0.5, [[n, { fontSize: 14, bold: true, color: C.text1 }]], { stroke: c, width: 2 });
    });
  };
  chips('apps/', ['api', 'dispatcher', 'console'], 2.4, C.accent5);
  chips('packages/', ['domain', 'application', 'persistence', 'providers', 'shared', 'client', 'ui'], 3.55, C.accent2);
  const tools = [['pnpm', 'comparte dependencias'], ['Turborepo', 'construye y prueba en orden'], ['Un cambio', 'se prueba en todo lo que lo usa']];
  tools.forEach(([big, small], i) => {
    const y = 1.75 + i * 1.55;
    pill(s, `Marcador ${i + 1}`, 8.7, y + 0.1, 0.5, [C.accent3, C.accent4, C.accent6][i]);
    T(s, `Herramienta ${i + 1}`, big, { x: 8.7, y: y + 0.3, w: 4.0, h: 0.5, fontSize: 26, bold: true, color: C.text1 });
    T(s, `Para qué ${i + 1}`, small, { x: 8.7, y: y + 0.85, w: 4.0, h: 0.35, fontSize: 15, color: C.text2 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 6.3, w: 4.2, h: 0.46, fill: { color: C.text1 }, line: { color: C.text1, width: 0 }, rectRadius: 0.08, objectName: 'Comando fondo' });
  T(s, 'Comando', '$ pnpm test', { x: 0.85, y: 6.38, w: 3.8, h: 0.3, fontSize: 16, color: C.background1, fontFace: 'Courier New' });
  s.addNotes(
    'Todo vive en un solo repositorio. Arriba están las aplicaciones y abajo los paquetes que comparten. ' +
      'pnpm instala las dependencias una sola vez para todos, y Turborepo construye y prueba cada paquete en el orden correcto. ' +
      'Así, si cambiamos el dominio, un solo comando prueba de inmediato todo lo que depende de él.',
  );
}

// ============ 10. Entrega ============
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Ingeniería' });
  title(s, 'Cada cambio, verificado antes de salir');
  // ci.yml corre solo con cada push; deploy.yml se lanza a mano a propósito (por eso el tramo punteado).
  const stops = [['push', C.text2], ['formato y lint', C.accent2], ['tipos', C.accent2], ['pruebas', C.accent3], ['build', C.accent3], ['humo', C.accent4], ['producción', C.accent6]];
  const x0 = 1.0, x1 = 12.2, ly = 2.55, dx = (x1 - x0) / (stops.length - 1);
  s.addShape(pres.ShapeType.roundRect, { x: x0, y: ly - 0.05, w: dx * 5, h: 0.1, fill: { color: C.text1 }, line: { color: C.text1, width: 0 }, rectRadius: 0.05, objectName: 'Línea CI' });
  line(s, 'Tramo manual', x0 + dx * 5, ly, dx, 0.001, C.text1, { dash: 'sysDot', width: 3 });
  stops.forEach(([n, c], i) => {
    const cx = x0 + i * dx;
    dot(s, `Parada ${n}`, cx - 0.18, ly - 0.18, 0.36, c, i === stops.length - 1);
    T(s, `Parada ${n} nombre`, n, { x: cx - 0.9, y: ly + 0.35, w: 1.8, h: 0.35, fontSize: 15, bold: true, color: C.text1, align: 'center' });
  });
  T(s, 'Tramo CI', 'GitHub Actions · automático', { x: x0, y: ly - 0.75, w: 5, h: 0.35, fontSize: 15, color: C.text2 });
  T(s, 'Tramo deploy', 'un clic', { x: x0 + dx * 5, y: ly - 0.75, w: dx, h: 0.35, fontSize: 15, color: C.text2, align: 'center' });
  const stats = [['7 ADRs', 'cada decisión con su porqué', C.accent2], ['41 historias', 'en Jira, por sprint', C.accent3], ['5 sprints', 'del diseño a la entrega', C.accent4]];
  stats.forEach(([big, small, c], i) => {
    const x = 0.6 + i * 4.1;
    card(s, `Dato ${i + 1}`, x, 4.0, 3.9, 1.75);
    pill(s, `Marcador dato ${i + 1}`, x + 0.3, 4.25, 0.5, c);
    T(s, `Cifra ${i + 1}`, big, { x: x + 0.3, y: 4.45, w: 3.3, h: 0.6, fontSize: 30, bold: true, color: C.text1 });
    T(s, `Explicación ${i + 1}`, small, { x: x + 0.3, y: 5.1, w: 3.3, h: 0.35, fontSize: 15, color: C.text2 });
  });
  T(s, 'Idea', 'Las ADRs que cambiamos siguen ahí: BullMQ y Containers dieron paso a Workers.', { x: 0.6, y: 6.2, w: 12.1, h: 0.45, fontSize: 16, color: C.text1 });
  s.addNotes(
    'Cada cambio pasa por la misma vía. Con cada push, GitHub Actions revisa formato, lint y tipos, corre las pruebas, construye y levanta una prueba de humo con la API y un Postgres reales. ' +
      'El despliegue a producción es un clic a propósito: aplica las migraciones en Neon y publica los Workers. ' +
      'Las decisiones grandes están escritas en siete ADRs. Las que cambiamos no se borran: por ejemplo, empezamos con BullMQ y Redis y con Cloudflare Containers, y la ADR siete explica por qué pasamos a Workers. ' +
      'Y todo el trabajo está en Jira: cuarenta y una historias repartidas en cinco sprints.',
  );
}

// ============ 11. Librería ============
pres.addSection({ title: 'Open source' });
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Open source' });
  title(s, 'Además es una librería: SDK y componentes');
  const code = (name, x, head, body, lines) => {
    T(s, `${name} título`, head, { x, y: 1.6, w: 5.9, h: 0.4, fontSize: 20, bold: true, color: C.text1 });
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.1, w: 5.9, h: 3.35, fill: { color: C.text1 }, line: { color: C.text1, width: 0 }, rectRadius: 0.1, objectName: `${name} fondo` });
    T(s, `${name} código`, body, { x: x + 0.3, y: 2.35, w: 5.3, h: 2.9, fontSize: 14, color: C.background1, fontFace: 'Courier New' });
  };
  code('SDK', 0.6, '@notifyhub/client', 'const nh = createNotifyHubClient({\n  baseUrl, apiKey,\n});\n\nconst { id } = await nh\n  .notifications.create(payload);\n\nconst { attempts } = await nh\n  .notifications.get(id);');
  code('UI', 6.85, '@notifyhub/ui', '<NotifyHubProvider client={nh}>\n  <NotificationDetail\n    item={item}\n    detail={detail}\n  />\n</NotifyHubProvider>\n\n// la ruta del mensaje, lista');
  const tags = [['Licencia MIT', C.accent1], ['ESM, CJS y tipos', C.accent2], ['Tailwind v4', C.accent3], ['45 pruebas', C.accent4]];
  tags.forEach(([t, c], i) => {
    const x = 0.6 + i * 3.1;
    pill(s, `Marcador ${i + 1}`, x, 5.85, 0.5, c);
    T(s, `Etiqueta ${i + 1}`, t, { x, y: 6.05, w: 2.8, h: 0.4, fontSize: 18, bold: true, color: C.text1 });
  });
  s.addNotes(
    'Además de la aplicación, dejamos dos paquetes reutilizables. El SDK de TypeScript, sin dependencias, sirve para crear notificaciones y consultar su ruta desde cualquier programa. ' +
      'Y los componentes de React dibujan la ruta del mensaje con la misma identidad visual. La consola que acabamos de ver está hecha con esos dos paquetes. ' +
      'Están pensados como código abierto con licencia MIT y tienen cuarenta y cinco pruebas automáticas. Todavía no los publicamos en npm ni hacemos público el repositorio: falta que el equipo lo decida.',
  );
}

// ============ 12. Real vs simulado ============
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Open source' });
  title(s, 'Qué es real, qué es simulado y qué falta');
  const cols = [
    ['Real', C.accent6, ['Recepción con idempotencia y límite de solicitudes', 'Colas por prioridad y máquina de estados', 'Reintentos, fallback, intentos y bitácora en Postgres', 'API, SDK y consola web']],
    ['Simulado', C.accent1, ['SendGrid, Twilio, FCM y webhook', 'Su comportamiento sale de la salud del proveedor: operativo, degradado o caído', 'Sirve para demostrar el fallback sin credenciales']],
    ['Pendiente', C.accent4, ['Adaptadores reales de los proveedores', 'Outbox y suscripciones por webhook', 'Circuito de corte y revisión de salud activa']],
  ];
  cols.forEach(([h, c, items], i) => {
    const x = 0.6 + i * 4.1;
    card(s, `Columna ${h}`, x, 1.65, 3.9, 3.55);
    pill(s, `Marcador ${h}`, x + 0.3, 1.9, 0.55, c);
    T(s, `Título ${h}`, h, { x: x + 0.3, y: 2.1, w: 3.3, h: 0.45, fontSize: 22, bold: true, color: C.text1 });
    T(s, `Lista ${h}`, items.join('\n'), { x: x + 0.3, y: 2.7, w: 3.3, h: 2.4, fontSize: 14, color: C.text1, bullet: { indent: 14 }, paraSpaceAfter: 6 });
  });
  const stats = [['148', 'pruebas automáticas'], ['8', 'paquetes del monorepo'], ['0', 'secretos expuestos']];
  stats.forEach(([big, small], i) => {
    const x = 0.6 + i * 4.1;
    T(s, `Cifra ${i + 1}`, big, { x, y: 5.5, w: 1.2, h: 0.8, fontSize: 44, bold: true, color: C.text1 });
    T(s, `Etiqueta ${i + 1}`, small, { x: x + 1.3, y: 5.75, w: 2.7, h: 0.5, fontSize: 16, color: C.text2 });
  });
  s.addNotes(
    'Quiero ser clara con lo que es real y lo que no. Es real la recepción con idempotencia y límite de solicitudes, las colas, la máquina de estados, los reintentos, el fallback, la bitácora en Postgres, la API, el SDK y la consola. ' +
      'Lo simulado son los proveedores: SendGrid, Twilio, Firebase y el webhook responden según su salud, para poder demostrar el fallback sin credenciales de pago. ' +
      'Falta conectar los proveedores reales, el outbox con suscripciones por webhook y el circuito de corte. Tenemos ciento cuarenta y ocho pruebas automáticas y revisamos que no haya secretos en el historial.',
  );
}

// ============ 13. Siguientes pasos ============
pres.addSection({ title: 'Cierre' });
{
  const s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Cierre' });
  title(s, 'Lo que sigue hasta la entrega final');
  const steps = [
    ['Sprint 2 · 26 oct – 6 nov', 'Adaptadores reales de SendGrid, Twilio, FCM y webhook', C.accent2],
    ['Sprint 3 · 9 – 20 nov', 'Circuito de corte por proveedor y revisión de salud activa', C.accent3],
    ['Sprint 4 · 23 nov – 4 dic', 'Outbox, suscripciones por webhook, carga y entrega final', C.accent4],
    ['Open source', 'Hacer público el repositorio y publicar los paquetes en npm', C.accent1],
  ];
  steps.forEach(([h, d, c], i) => {
    const y = 1.7 + i * 1.28;
    card(s, `Paso ${i + 1}`, 0.6, y, 12.1, 1.1);
    dot(s, `Estación ${i + 1}`, 0.95, y + 0.39, 0.32, c, true);
    if (i < steps.length - 1) s.addShape(pres.ShapeType.roundRect, { x: 1.07, y: y + 1.0, w: 0.08, h: 0.38, fill: { color: c }, line: { color: c, width: 0 }, rectRadius: 0.04, objectName: `Riel ${i + 1}` });
    T(s, `Fecha ${i + 1}`, h, { x: 1.7, y: y + 0.18, w: 4.0, h: 0.36, fontSize: 18, bold: true, color: C.text1 });
    T(s, `Meta ${i + 1}`, d, { x: 1.7, y: y + 0.58, w: 10.6, h: 0.4, fontSize: 16, color: C.text2 });
  });
  s.addNotes(
    'Lo que sigue: en el Sprint 2 conectamos los proveedores reales; en el Sprint 3, el circuito de corte y la revisión de salud; y en el Sprint 4, el outbox, las suscripciones por webhook, las pruebas de carga y la entrega final el cuatro de diciembre. ' +
      'En paralelo, el equipo decidirá cuándo hacer público el repositorio y publicar los paquetes.',
  );
}

// ============ 14. Cierre ============
{
  const s = pres.addSlide({ masterName: 'PORTADA', sectionTitle: 'Cierre' });
  s.addImage({ path: A('logo-paper.png'), x: 0.8, y: 1.3, w: 1.2, h: 1.2, altText: 'Logo de NotifyHub' });
  T(s, 'Gracias', 'Gracias', { x: 0.8, y: 2.75, w: 8, h: 1.1, fontSize: 60, bold: true, color: C.background1, fontFace: 'Arial' });
  T(s, 'Preguntas', '¿Preguntas?', { x: 0.8, y: 3.9, w: 8, h: 0.7, fontSize: 32, color: C.accent1 });
  T(s, 'Equipo', 'Andreea Margarita Maldonado Morales\nJosé Raúl Soriano Cazabal', { x: 0.8, y: 5.2, w: 8, h: 0.9, fontSize: 20, color: C.background1 });
  T(s, 'Licencia', 'NotifyHub · Código abierto bajo licencia MIT', { x: 0.8, y: 6.45, w: 8, h: 0.4, fontSize: 16, color: C.background1 });
  CH.forEach((c, i) => {
    const y = 2.4 + i * 1.05;
    s.addShape(pres.ShapeType.roundRect, { x: 9.4, y: y - 0.05, w: 3.2, h: 0.1, fill: { color: c.c }, line: { color: c.c, width: 0 }, rectRadius: 0.05, objectName: `Línea ${c.n}` });
    s.addShape(pres.ShapeType.ellipse, { x: 12.46, y: y - 0.14, w: 0.28, h: 0.28, fill: { color: C.text1 }, line: { color: c.c, width: 3 }, objectName: `Destino ${c.n}` });
  });
  s.addNotes('Eso es NotifyHub: un mensaje que siempre llega, porque tiene una ruta de respaldo. Gracias por su atención. Estoy a sus órdenes para las preguntas.');
}

(async () => {
  const out = path.join(__dirname, 'NotifyHub.pptx');
  await pres.writeFile({ fileName: out });
  const { applyTheme } = require(SK);
  await applyTheme(out, THEME);
  // pptxgenjs no deja elegir el tamaño de la punta de flecha; con el predeterminado casi no se ve en Quick Look.
  const fs = require('fs');
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  for (const f of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const xml = await zip.file(f).async('string');
    zip.file(f, xml.replaceAll('<a:tailEnd type="triangle"/>', '<a:tailEnd type="triangle" w="lg" len="lg"/>'));
  }
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('Listo:', out);
})();
