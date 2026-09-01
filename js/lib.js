/* ============================================================
   LIB — Utilidades centralizadas (DOM, Fechas, Charts)
   ============================================================ */

// ============ DOM UTILS ============
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** Redimensiona/comprime una foto antes de guardarla como base64: todo se guarda
    en localStorage (~5-10MB de límite total), así que sin esto un puñado de fotos
    de celular alcanza para llenarlo. Devuelve un dataURL JPEG liviano. */
/** Redimensiona/comprime una foto antes de subirla al servidor. Devuelve un Blob
 *  JPEG liviano (o el archivo original si no se pudo procesar como imagen). */
export function comprimirImagen(file, { maxDim = 1600, calidad = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => resolve(file); // si falla, se sube el original tal cual
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const escala = maxDim / Math.max(width, height);
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', calidad);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Da formato de miles en vivo (es-AR, con puntos) a un input de monto mientras se escribe.
 *  Se usa vía delegación global sobre inputs con clase "input-monto" (ver app.js). */
export function formatearMontoInput(e) {
  const input = e.target;
  const cursorPos = input.selectionStart ?? input.value.length;
  const antes = input.value.slice(0, cursorPos);
  const digitosAntes = (antes.match(/\d/g) || []).length;

  const digitos = input.value.replace(/\D/g, '');
  input.value = digitos ? Number(digitos).toLocaleString('es-AR') : '';

  let pos = 0, contados = 0;
  while (pos < input.value.length && contados < digitosAntes) {
    if (/\d/.test(input.value[pos])) contados++;
    pos++;
  }
  try { input.setSelectionRange(pos, pos); } catch {}
}

/** Da formato inicial (con puntos de miles) a un valor numérico para precargar un input de monto. */
export function fmtMontoInput(n) {
  return (n || n === 0) && n !== '' ? Number(n).toLocaleString('es-AR') : '';
}

/** Valor numérico real de un input de monto formateado con puntos de miles. */
export function valorMonto(v) {
  return Number(String(v ?? '').replace(/\D/g, '')) || 0;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Devuelve la lista de garantes de un contrato de alquiler. Soporta tanto el
 *  array nuevo (`alq.garantes`) como los contratos viejos que todavía guardan
 *  un único garante en campos sueltos (`garante`, `garanteDni`, ...). */
export function garantesDeAlquiler(alq) {
  if (Array.isArray(alq.garantes)) return alq.garantes;
  if (alq.garante || alq.garanteDni || alq.garanteTelefono || alq.garanteEmail || alq.garanteDomicilio || alq.garanteRelacion || alq.garantePropiedad) {
    return [{
      nombre: alq.garante || '',
      dni: alq.garanteDni || '',
      telefono: alq.garanteTelefono || '',
      email: alq.garanteEmail || '',
      domicilio: alq.garanteDomicilio || '',
      relacion: alq.garanteRelacion || '',
      propiedadGarantia: alq.garantePropiedad || '',
    }];
  }
  return [];
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function fmtMoneda(monto, moneda = 'USD') {
  if (monto == null || monto === '') return '—';
  const n = Number(monto);
  const opts = { style: 'currency', currency: moneda, maximumFractionDigits: 0 };
  try { return new Intl.NumberFormat('es-AR', opts).format(n); }
  catch { return `${moneda} ${n.toLocaleString('es-AR')}`; }
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-AR');
}

export function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

export function colorDe(str = '') {
  const colores = ['#0f7d83','#7c3aed','#2563eb','#d97706','#16a34a','#dc2626','#0891b2','#db2777'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return colores[Math.abs(h) % colores.length];
}

/** Construye un enlace wa.me con texto pre-cargado (formato AR: 549...) */
export function waLink(numero, texto = '') {
  let n = String(numero || '').replace(/\D/g, '');
  if (!n) return null;
  if (!n.startsWith('54')) n = '549' + n;          // celular Argentina
  else if (!n.startsWith('549')) n = '54' + '9' + n.slice(2);
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export function descargar(contenido, nombre, tipo = 'text/plain') {
  const blob = (contenido instanceof Blob) ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Comparte un archivo (ej. PDF de un recibo) por WhatsApp usando la Web Share API cuando está
 *  disponible (adjunta el archivo real); si no, descarga el archivo y abre el chat de WhatsApp
 *  con el texto como respaldo, para que se pueda adjuntar a mano.
 *  Devuelve 'shared' (se adjuntó solo, ej. celular con WhatsApp instalado), 'fallback'
 *  (se descargó el PDF y se abrió el chat, pero hay que adjuntarlo a mano — típico en
 *  desktop, donde el navegador no puede adjuntar archivos directo al chat) o `false`
 *  si no se pudo hacer nada (sin archivo o sin número válido). El llamador debe avisarle
 *  al usuario cuál de los dos pasó, para que no crea que se mandó el PDF cuando en
 *  realidad solo se abrió el chat con el texto. */
export async function compartirArchivoPorWhatsApp({ numero, texto = '', archivo, nombreArchivo = 'documento.pdf', tipo = 'application/pdf' }) {
  if (!archivo) return false;

  const file = archivo instanceof File ? archivo : new File([archivo], nombreArchivo, { type: tipo });
  const mensaje = texto || 'Te comparto el documento.';

  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: mensaje, title: 'Documento compartido' });
        return 'shared';
      }
    }
  } catch (err) {
    console.warn('No se pudo compartir por Web Share API:', err);
  }

  const link = waLink(numero, mensaje);
  if (link) {
    try {
      descargar(archivo, nombreArchivo, tipo);
    } catch (e) {
      console.warn('No se pudo descargar el archivo automáticamente:', e);
    }
    window.open(link, '_blank', 'noopener,noreferrer');
    return 'fallback';
  }

  descargar(archivo, nombreArchivo, tipo);
  return 'fallback';
}

/** Arma el toast a mostrar según lo que devolvió compartirArchivoPorWhatsApp, para que
 *  quien envía sepa si el PDF se adjuntó solo o si hay que adjuntarlo a mano en el chat
 *  que se abrió (fallback de desktop) — sin este aviso es fácil creer que ya se mandó el
 *  recibo cuando en realidad el contacto solo recibió el mensaje de texto. */
export function avisoEnvioWhatsApp(resultado, cosa = 'el documento') {
  if (resultado === 'shared') return { msg: 'Enviado por WhatsApp', tipo: 'success' };
  if (resultado === 'fallback') return { msg: `Se descargó ${cosa} — adjuntalo en el chat de WhatsApp que se abrió para enviarlo`, tipo: 'warning', duracion: 7000 };
  return { msg: 'No se pudo compartir por WhatsApp', tipo: 'danger' };
}

export function exportarCSV(filas, nombre = 'export.csv') {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const escCsv = (v) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const sep = ';';
  const csv = [cols.join(sep), ...filas.map(f => cols.map(c => escCsv(f[c])).join(sep))].join('\n');
  descargar('﻿' + csv, nombre, 'text/csv;charset=utf-8;');
}

// ============ DATE UTILS ============
export const hoy = () => new Date();

export function parseISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function toISO(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

export const nombreMes = (i) => MESES_LARGO[i];
export const nombreDia = (i) => DIAS[i];

export function fmtFecha(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  if (isNaN(x)) return '—';
  return `${String(x.getDate()).padStart(2,'0')} ${MESES[x.getMonth()]} ${x.getFullYear()}`;
}

export function fmtFechaCorta(d) {
  if (!d) return '—';
  // Parsear como fecha local para evitar desfasaje UTC
  const s = (d instanceof Date) ? d.toISOString().slice(0,10) : String(d).slice(0,10);
  const [y, m, dd] = s.split('-');
  if (!y || !m || !dd) return '—';
  return `${dd}/${m}`;
}

export function fmtHora(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  if (isNaN(x)) return '';
  return x.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/** Parsea una fecha (YYYY-MM-DD) como fecha LOCAL. `new Date('YYYY-MM-DD')` la interpreta
 *  como UTC medianoche, lo que en husos horarios negativos (ej. Argentina) la corre un día
 *  para atrás al leer getFullYear()/getMonth()/getDate() en hora local. */
export function parseFechaLocal(d) {
  if (d instanceof Date) return new Date(d);
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d.slice(0, 10) + 'T00:00:00');
  return new Date(d);
}

export function diasEntre(a, b = new Date()) {
  const da = parseFechaLocal(a), db = parseFechaLocal(b);
  da.setHours(0,0,0,0); db.setHours(0,0,0,0);
  return Math.round((db - da) / 86400000);
}

export function relativo(d) {
  const dias = diasEntre(d, new Date());
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias === -1) return 'mañana';
  if (dias > 1) return `hace ${dias} días`;
  return `en ${Math.abs(dias)} días`;
}

export function esMismoDia(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function esHoy(d) { return esMismoDia(d, new Date()); }

export function sumarDias(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

export function matrizMes(anio, mes) {
  const primero = new Date(anio, mes, 1);
  const inicio = new Date(primero);
  inicio.setDate(1 - primero.getDay());
  const celdas = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    celdas.push(d);
  }
  return celdas;
}

// ============ CHARTS UTILS ============
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseColors() {
  return {
    brand: cssVar('--brand-500') || '#0f7d83',
    brand2: cssVar('--brand-300') || '#5fb3b7',
    accent: cssVar('--accent-500') || '#f5a623',
    grid: cssVar('--border') || '#e0e0e0',
    text: cssVar('--text-soft') || '#637070',
  };
}

const _instances = new Map();

function destroyIfExists(canvas) {
  const prev = _instances.get(canvas);
  if (prev) { prev.destroy(); _instances.delete(canvas); }
}

function commonOpts(c) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: c.text, font: { family: 'Manrope', size: 12 }, usePointStyle: true, boxWidth: 8, padding: 16 } },
      tooltip: {
        backgroundColor: cssVar('--surface'), titleColor: cssVar('--text'), bodyColor: cssVar('--text-soft'),
        borderColor: c.grid, borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: true, usePointStyle: true,
      },
    },
  };
}

export function lineChart(canvas, labels, dataset, { label = '', area = true } = {}) {
  if (!window.Chart) return;
  destroyIfExists(canvas);
  const c = baseColors();
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
  grad.addColorStop(0, c.brand + '55');
  grad.addColorStop(1, c.brand + '00');
  const inst = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label, data: dataset, borderColor: c.brand, backgroundColor: area ? grad : 'transparent', fill: area, tension: .4, borderWidth: 3, pointRadius: 3, pointBackgroundColor: c.brand, pointHoverRadius: 5 }] },
    options: { ...commonOpts(c),
      plugins: { ...commonOpts(c).plugins, legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text, font: { family: 'Manrope' } } },
        y: { grid: { color: c.grid }, ticks: { color: c.text, font: { family: 'Manrope' }, precision: 0 }, beginAtZero: true },
      },
    },
  });
  _instances.set(canvas, inst); return inst;
}

export function barChart(canvas, labels, dataset, { label = '', horizontal = false, colors } = {}) {
  if (!window.Chart) return;
  destroyIfExists(canvas);
  const c = baseColors();
  const bg = colors || labels.map((_, i) => i % 2 ? c.brand2 : c.brand);
  const inst = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label, data: dataset, backgroundColor: bg, borderRadius: 8, borderSkipped: false, maxBarThickness: 42 }] },
    options: { ...commonOpts(c), indexAxis: horizontal ? 'y' : 'x',
      plugins: { ...commonOpts(c).plugins, legend: { display: false } },
      scales: {
        x: { grid: { display: !horizontal, color: c.grid }, ticks: { color: c.text, font: { family: 'Manrope' } } },
        y: { grid: { display: horizontal, color: c.grid }, ticks: { color: c.text, font: { family: 'Manrope' }, precision: 0 }, beginAtZero: true },
      },
    },
  });
  _instances.set(canvas, inst); return inst;
}

export function doughnutChart(canvas, labels, dataset, palette) {
  if (!window.Chart) return;
  destroyIfExists(canvas);
  const c = baseColors();
  const pal = palette || ['#0f7d83','#5fb3b7','#f5a623','#7c3aed','#2563eb','#16a34a','#dc2626','#0891b2','#db2777','#94a3b8'];
  const inst = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: dataset, backgroundColor: pal, borderColor: cssVar('--surface'), borderWidth: 3, hoverOffset: 6 }] },
    options: { ...commonOpts(c), cutout: '64%',
      plugins: { ...commonOpts(c).plugins, legend: { position: 'right', labels: { ...commonOpts(c).plugins.legend.labels } } },
    },
  });
  _instances.set(canvas, inst); return inst;
}

export function destroyAll() { _instances.forEach(i => i.destroy()); _instances.clear(); }
