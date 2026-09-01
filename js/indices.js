/* ============================================================
   ÍNDICES DE AJUSTE — % de ICL / IPC obtenidos automáticamente
   desde APIs públicas (BCRA / ArgentinaDatos). No hay carga manual:
   se consultan solas y se cachean en localStorage para no repetir
   la consulta en cada render y como respaldo si falla la conexión.
   ============================================================ */
const KEY_INDICES = 'inmocrm_indices_auto';

export const TIPOS_INDICE = [
  { id: 'ICL', label: 'ICL (Índice para Contratos de Locación)', fuente: 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp' },
  { id: 'IPC', label: 'IPC (Inflación · INDEC)', fuente: 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31' },
];

/** fetch con timeout: si la API no responde en `ms`, se aborta (evita que una
 *  API caída/con problemas de certificado cuelgue el arranque de la app). */
function fetchConTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function getCache() {
  try { return JSON.parse(localStorage.getItem(KEY_INDICES) || '{}'); } catch { return {}; }
}
function setCache(tipo, dato) {
  const c = getCache();
  c[tipo] = { ...dato, actualizadoEn: new Date().toISOString() };
  localStorage.setItem(KEY_INDICES, JSON.stringify(c));
}

/** Último % conocido de un tipo de índice (síncrono, leído de la caché local). */
export function getUltimoIndice(tipo) {
  return getCache()[tipo] || null;
}

/** ICL: BCRA publica el valor del índice día a día: el % del mes surge de
 *  comparar el último valor disponible contra el de ~30 días antes. */
async function fetchICL() {
  const listaRes = await fetchConTimeout('https://api.bcra.gob.ar/estadisticas/v4.0/monetarias');
  if (!listaRes.ok) throw new Error(`BCRA monetarias: HTTP ${listaRes.status}`);
  const lista = await listaRes.json();
  const variable = (lista.results || []).find(v => /contratos de locaci[oó]n/i.test(v.descripcion || ''));
  if (!variable) throw new Error('No se encontró la variable ICL en BCRA');

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 45 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const serieRes = await fetchConTimeout(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${variable.idVariable}?desde=${fmt(desde)}&hasta=${fmt(hasta)}`);
  if (!serieRes.ok) throw new Error(`BCRA serie ICL: HTTP ${serieRes.status}`);
  const serie = await serieRes.json();
  const detalle = (serie.results?.[0]?.detalle || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (detalle.length < 2) throw new Error('Sin suficientes datos históricos de ICL');

  const ultimo = detalle[detalle.length - 1];
  const fechaRef = new Date(new Date(ultimo.fecha).getTime() - 30 * 86400000);
  const referencia = detalle.reduce((prev, cur) =>
    Math.abs(new Date(cur.fecha) - fechaRef) < Math.abs(new Date(prev.fecha) - fechaRef) ? cur : prev
  );
  const pct = Math.round(((ultimo.valor / referencia.valor) - 1) * 10000) / 100;
  return { pct, mes: ultimo.fecha.slice(0, 7) };
}

/** IPC: API pública comunitaria (ArgentinaDatos) con el % de inflación mensual ya calculado. */
async function fetchIPC() {
  const res = await fetchConTimeout('https://api.argentinadatos.com/v1/finanzas/indices/inflacion');
  if (!res.ok) throw new Error(`ArgentinaDatos inflación: HTTP ${res.status}`);
  const datos = await res.json();
  if (!Array.isArray(datos) || !datos.length) throw new Error('Sin datos de IPC');
  const ultimo = datos[datos.length - 1];
  return { pct: ultimo.valor, mes: String(ultimo.fecha).slice(0, 7) };
}

/** Consulta las APIs públicas y actualiza la caché local. Nunca lanza: si una
 *  fuente falla (sin conexión, API caída, CORS), se conserva el último valor
 *  conocido de esa fuente y se sigue mostrando ese. */
export async function actualizarIndices() {
  const [icl, ipc] = await Promise.allSettled([fetchICL(), fetchIPC()]);
  if (icl.status === 'fulfilled') setCache('ICL', icl.value);
  else console.warn('[indices] No se pudo actualizar ICL:', icl.reason);
  if (ipc.status === 'fulfilled') setCache('IPC', ipc.value);
  else console.warn('[indices] No se pudo actualizar IPC:', ipc.reason);
}

/* ============================================================
   Variación REAL acumulada entre dos fechas puntuales — esto es
   lo que corresponde aplicarle a un contrato concreto según su
   frecuencia de ajuste (cuatrimestral, semestral, anual...), y NO
   es lo mismo que el % mensual de arriba.
   ============================================================ */

function valorMasCercano(detalle, fechaObjetivo) {
  const objetivo = new Date(fechaObjetivo).getTime();
  return detalle.reduce((prev, cur) =>
    Math.abs(new Date(cur.fecha) - objetivo) < Math.abs(new Date(prev.fecha) - objetivo) ? cur : prev
  );
}

/** % real de variación del índice ICL entre `fechaDesde` y `fechaHasta` (YYYY-MM-DD). */
export async function calcularVariacionICL(fechaDesde, fechaHasta) {
  const listaRes = await fetchConTimeout('https://api.bcra.gob.ar/estadisticas/v4.0/monetarias');
  if (!listaRes.ok) throw new Error(`BCRA monetarias: HTTP ${listaRes.status}`);
  const lista = await listaRes.json();
  const variable = (lista.results || []).find(v => /contratos de locaci[oó]n/i.test(v.descripcion || ''));
  if (!variable) throw new Error('No se encontró la variable ICL en BCRA');

  const desdeConBuffer = new Date(new Date(fechaDesde).getTime() - 6 * 86400000);
  const hastaConBuffer = new Date(new Date(fechaHasta).getTime() + 2 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const serieRes = await fetchConTimeout(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${variable.idVariable}?desde=${fmt(desdeConBuffer)}&hasta=${fmt(hastaConBuffer)}`);
  if (!serieRes.ok) throw new Error(`BCRA serie ICL: HTTP ${serieRes.status}`);
  const serie = await serieRes.json();
  const detalle = (serie.results?.[0]?.detalle || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (detalle.length < 2) throw new Error('Sin suficientes datos de ICL en ese rango');

  const inicio = valorMasCercano(detalle, fechaDesde);
  const fin    = valorMasCercano(detalle, fechaHasta);
  return Math.round(((fin.valor / inicio.valor) - 1) * 10000) / 100;
}

/** % real de IPC acumulado entre `fechaDesde` y `fechaHasta`, componiendo las
 *  variaciones mensuales publicadas mes a mes (no es una simple suma). */
export async function calcularVariacionIPC(fechaDesde, fechaHasta) {
  const res = await fetchConTimeout('https://api.argentinadatos.com/v1/finanzas/indices/inflacion');
  if (!res.ok) throw new Error(`ArgentinaDatos inflación: HTTP ${res.status}`);
  const datos = await res.json();
  if (!Array.isArray(datos) || !datos.length) throw new Error('Sin datos de IPC');

  const mesDesde = String(fechaDesde).slice(0, 7);
  const mesHasta = String(fechaHasta).slice(0, 7);
  // El mes de "desde" ya está reflejado en el monto de partida, así que se excluye
  // y se incluyen los meses siguientes hasta el mes de "hasta".
  const enRango = datos.filter(d => {
    const mes = String(d.fecha).slice(0, 7);
    return mes > mesDesde && mes <= mesHasta;
  });
  if (!enRango.length) throw new Error('Sin datos de IPC en ese rango');
  const factor = enRango.reduce((acc, d) => acc * (1 + (Number(d.valor) || 0) / 100), 1);
  return Math.round((factor - 1) * 10000) / 100;
}
