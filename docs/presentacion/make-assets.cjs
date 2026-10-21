// Prepara las imágenes de la presentación: capturas recortadas y el logo en dos versiones.
const sharp = require('sharp');
const path = require('path');
const SCREENS = path.join(__dirname, '..', 'screens');
const OUT = path.join(__dirname, 'assets');

const logo = (ink, accent, size = 640) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}">
  <path d="M5 13 H17 C26 13 26 24 32 24" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M5 35 H17 C26 35 26 24 32 24" fill="none" stroke="${accent}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="0.1 7.2"/>
  <circle cx="37" cy="24" r="6.5" fill="${ink}"/><circle cx="5" cy="13" r="2.4" fill="${ink}"/><circle cx="5" cy="35" r="2.4" fill="${accent}"/></svg>`);

(async () => {
  await sharp(logo('#12151A', '#FF5A1F')).png().toFile(`${OUT}/logo-ink.png`);
  await sharp(logo('#F3F2ED', '#FF5A1F')).png().toFile(`${OUT}/logo-paper.png`);
  // Resumen completo (mapa de rutas): se recorta el pie vacío.
  const resumen = sharp(`${SCREENS}/01-resumen.png`);
  const rm = await resumen.metadata();
  await sharp(`${SCREENS}/01-resumen.png`).extract({ left: 224, top: 42, width: rm.width - 224, height: Math.min(700, rm.height - 42) }).png().toFile(`${OUT}/resumen.png`);
  // Detalle de una notificación con fallback: solo el panel derecho con la ruta.
  const det = await sharp(`${SCREENS}/02-notificacion-fallback.png`).metadata();
  await sharp(`${SCREENS}/02-notificacion-fallback.png`).extract({ left: 990, top: 218, width: 424, height: Math.min(940, det.height - 218) }).png().toFile(`${OUT}/ruta.png`);
  await sharp(`${SCREENS}/03-proveedores.png`).extract({ left: 224, top: 42, width: 1216, height: 640 }).png().toFile(`${OUT}/proveedores.png`);
  for (const f of ['resumen', 'ruta', 'proveedores', 'logo-ink', 'logo-paper']) {
    const m = await sharp(`${OUT}/${f}.png`).metadata();
    console.log(f, m.width + 'x' + m.height);
  }
})();
