/* ============================================================
   STORE — Estado central + selectores de negocio
   ============================================================ */
import { api } from './data.js';
import { diasEntre, parseFechaLocal } from './lib.js';
import { ALERTA_VENCIMIENTO_DIAS, ALERTA_AJUSTE_DIAS, CANALES_COMERCIALIZACION, PESOS_DOCUMENTO_VENTA } from './config.js';

const state = {
  clientes: [], propietarios: [], propiedades: [], alquileres: [], ventas: [], agenda: [], caja: [], temporales: [], liquidaciones: [],
  interesados: [],
  loaded: false,
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach(fn => fn(state)); }

export function getState() { return state; }

/** Este sistema no tiene la sección "Propietarios" (las casas son de la
 *  misma persona que usa el sistema) — pero internamente cada propiedad
 *  sigue necesitando un `propietarioId` válido para que el resto del
 *  código (reparto, impresión de contratos, etc.) funcione sin tocarlo.
 *  Por eso, la primera vez que no hay ningún propietario cargado, se crea
 *  uno solo en silencio y se usa siempre ese — invisible para quien usa la app. */
async function asegurarPropietarioUnico(snap) {
  if (snap.propietarios && snap.propietarios.length) return snap.propietarios[0];
  const creado = await api.createPropietario({ nombre: 'Gaby' });
  snap.propietarios = [creado];
  return creado;
}

export async function initStore() {
  const snap = await api.snapshot();
  await asegurarPropietarioUnico(snap);
  Object.assign(state, snap, { loaded: true });
  emit();
}

async function refresh() {
  const snap = await api.snapshot();
  Object.assign(state, snap);
  emit();
}

/* ============================================================
   ACCIONES
   ============================================================ */
export const actions = {
  /* Clientes */
  async createCliente(d)         { await api.createCliente(d); await refresh(); },
  async updateCliente(id, p)     { await api.updateCliente(id, p); await refresh(); },
  async deleteCliente(id)        { await api.deleteCliente(id); await refresh(); },
  async addSeguimiento(id, nota) { await api.addSeguimiento(id, nota); await refresh(); },

  /* Propietarios */
  async createPropietario(d)           { await api.createPropietario(d); await refresh(); },
  async updatePropietario(id, p)       { await api.updatePropietario(id, p); await refresh(); },
  async deletePropietario(id)          { await api.deletePropietario(id); await refresh(); },
  async addSeguimientoPropietario(id, nota) { await api.addSeguimientoPropietario(id, nota); await refresh(); },

  /* Propiedades */
  async createPropiedad(d)       { await api.createPropiedad(d); await refresh(); },
  async updatePropiedad(id, p)   { await api.updatePropiedad(id, p); await refresh(); },
  async deletePropiedad(id)      { await api.deletePropiedad(id); await refresh(); },

  /* Alquileres */
  async createAlquiler(d)           { const r = await api.createAlquiler(d); await refresh(); return r; },
  async registrarEntregaContrato(alqId, d) { await api.registrarEntregaContrato(alqId, d); await refresh(); },
  async updateAlquiler(id, p)       { await api.updateAlquiler(id, p); await refresh(); },
  async deleteAlquiler(id)          { await api.deleteAlquiler(id); await refresh(); },
  async renovarAlquiler(oldId, d)   { const r = await api.renovarAlquiler(oldId, d); await refresh(); return r; },
  async cancelarAlquiler(id)        { const r = await api.cancelarAlquiler(id); await refresh(); return r; },
  async addCobro(alqId, cobro)      { const r = await api.addCobro(alqId, cobro); await refresh(); return r; },
  async updateCobro(alqId, cobId, p){ await api.updateCobro(alqId, cobId, p); await refresh(); },
  async registrarAbonoCobro(alqId, cobId, p) { await api.registrarAbonoCobro(alqId, cobId, p); await refresh(); },
  async deshacerCobro(alqId, cobId){ await api.deshacerCobro(alqId, cobId); await refresh(); },
  async registrarAumento(alqId, nuevoMonto, nota) { await api.registrarAumento(alqId, nuevoMonto, nota); await refresh(); },
  async editarUltimoAjuste(alqId, patch) { await api.editarUltimoAjuste(alqId, patch); await refresh(); },
  async deshacerUltimoAjuste(alqId) { await api.deshacerUltimoAjuste(alqId); await refresh(); },

  /* Ventas */
  async createVenta(d)           { await api.createVenta(d); await refresh(); },
  async updateVenta(id, p)       { await api.updateVenta(id, p); await refresh(); },
  async deleteVenta(id)          { await api.deleteVenta(id); await refresh(); },

  /* Agenda */
  async createEvento(d)          { await api.createEvento(d); await refresh(); },
  async updateEvento(id, p)      { await api.updateEvento(id, p); await refresh(); },
  async deleteEvento(id)         { await api.deleteEvento(id); await refresh(); },

  /* Temporales */
  async createTemporal(d)      { await api.createTemporal(d); await refresh(); },
  async updateTemporal(id, p)  { await api.updateTemporal(id, p); await refresh(); },
  async deleteTemporal(id)     { await api.deleteTemporal(id); await refresh(); },

  /* Liquidaciones */
  async createLiquidacion(d)      { const r = await api.createLiquidacion(d); await refresh(); return r; },
  async updateLiquidacion(id, p)  { await api.updateLiquidacion(id, p); await refresh(); },
  async deleteLiquidacion(id)     { await api.deleteLiquidacion(id); await refresh(); },

  /* Caja */
  async cajaHoy()                        { const r = await api.cajaHoy(); await refresh(); return r; },
  async addMovimiento(cajaId, data)      { await api.addMovimiento(cajaId, data); await refresh(); },
  async deleteMovimiento(cajaId, movId)  { await api.deleteMovimiento(cajaId, movId); await refresh(); },

  /* Ventas: documentación/comercialización/informes de una propiedad en venta */
  async addDocumentoPropiedad(propId, doc)          { await api.addDocumentoPropiedad(propId, doc); await refresh(); },
  async updateDocumentoPropiedad(propId, docId, p)  { await api.updateDocumentoPropiedad(propId, docId, p); await refresh(); },
  async deleteDocumentoPropiedad(propId, docId)     { await api.deleteDocumentoPropiedad(propId, docId); await refresh(); },
  async addComercializacionPropiedad(propId, accion)      { await api.addComercializacionPropiedad(propId, accion); await refresh(); },
  async updateComercializacionPropiedad(propId, accId, p) { await api.updateComercializacionPropiedad(propId, accId, p); await refresh(); },
  async deleteComercializacionPropiedad(propId, accId)    { await api.deleteComercializacionPropiedad(propId, accId); await refresh(); },
  async addInformePropiedad(propId, informe)        { const r = await api.addInformePropiedad(propId, informe); await refresh(); return r; },

  /* Interesados (Ventas) */
  async createInteresado(d)     { await api.createInteresado(d); await refresh(); },
  async updateInteresado(id, p) { await api.updateInteresado(id, p); await refresh(); },
  async deleteInteresado(id)    { await api.deleteInteresado(id); await refresh(); },
  async addContactoInteresado(intId, contacto) { await api.addContactoInteresado(intId, contacto); await refresh(); },
  async deleteContactoInteresado(intId, ctoId) { await api.deleteContactoInteresado(intId, ctoId); await refresh(); },
};

/* ============================================================
   SELECTORES
   ============================================================ */
export const sel = {
  /* Lookups básicos */
  cliente:      (id) => state.clientes.find(x => x.id === id),
  propietario:  (id) => state.propietarios.find(x => x.id === id),
  propiedad:    (id) => state.propiedades.find(x => x.id === id),
  alquiler:     (id) => state.alquileres.find(x => x.id === id),
  venta:        (id) => state.ventas.find(x => x.id === id),

  nombreCliente:     (id) => state.clientes.find(x => x.id === id)?.nombre || '—',
  nombrePropietario: (id) => state.propietarios.find(x => x.id === id)?.nombre || '—',
  /** Lista de dueños de una propiedad: [{propietarioId, porcentaje, pagaComision, comisionPct}].
   *  Si la propiedad no tiene `propietarios` cargado (dato viejo), se deriva de `propietarioId`
   *  como único dueño. Si algún dueño no tiene % ni "paga comisión" configurado todavía
   *  (recién agregado, nunca liquidado), se completa con reparto parejo / paga comisión = sí,
   *  para que nunca aparezca un propietario con 0% hasta que se liquide y quede guardado. */
  propietariosDePropiedad(prop) {
    if (!prop) return [];
    const raw = (prop.propietarios && prop.propietarios.length) ? prop.propietarios
              : (prop.propietarioId ? [{ propietarioId: prop.propietarioId }] : []);
    if (!raw.length) return [];
    const n = raw.length;
    return raw.map(o => ({
      propietarioId: o.propietarioId,
      porcentaje:    o.porcentaje    != null ? o.porcentaje    : Math.round(100 / n),
      pagaComision:  o.pagaComision  != null ? o.pagaComision  : true,
      comisionPct:   o.comisionPct   != null ? o.comisionPct   : null,
    }));
  },
  propiedadesDe: (propietarioId) => state.propiedades.filter(p => sel.propietariosDePropiedad(p).some(o => o.propietarioId === propietarioId)),
  dirPropiedad:  (id) => {
    const p = state.propiedades.find(x => x.id === id);
    return p ? `${p.direccion}${p.barrio ? ', ' + p.barrio : ''}` : '—';
  },

  /* ---- Clientes ---- */
  /** True si el cliente ya tiene un contrato de alquiler vigente (no rescindido/renovado) —
   *  ya encontró propiedad, por lo que deja de listarse como prospecto buscando alquilar. */
  tieneAlquilerVigente(clienteId) {
    return state.alquileres.some(a => a.inquilinoId === clienteId && !['rescindido', 'renovado'].includes(a.estado));
  },

  /* ---- Alquileres ---- */
  /** Días hasta el vencimiento (negativo = ya venció) */
  diasAlVencimiento(alq) {
    return diasEntre(new Date(), alq.fechaFin);
  },
  estadoAlquiler(alq) {
    if (alq.estado === 'rescindido') return 'rescindido';
    if (alq.estado === 'renovado') return 'renovado';
    const d = sel.diasAlVencimiento(alq);
    if (d < 0) return 'vencido';
    if (d <= ALERTA_VENCIMIENTO_DIAS) return 'por_vencer';
    return 'activo';
  },
  /** Meses vencidos (mes actual o anteriores) sin cobrar — incluye tanto los
   *  registrados como impagos como los que directamente nunca se registraron. */
  cobrosImpagosMes(alq) {
    if (!alq.fechaInicio) return [];
    const hoy = new Date();
    const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    const finKey = alq.fechaFin ? alq.fechaFin.slice(0, 7) : hoyKey;
    const topeKey = finKey < hoyKey ? finKey : hoyKey;

    const cobrosPorMes = {};
    (alq.cobros || []).forEach(c => { cobrosPorMes[c.mes] = c; });

    const inicio = parseFechaLocal(alq.fechaInicio);
    const pendientes = [];
    let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    while (true) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      if (key > topeKey) break;
      const cobro = cobrosPorMes[key];
      if (!cobro || !cobro.pagado) {
        pendientes.push(cobro || { mes: key, monto: alq.montoActual ?? alq.montoInicial ?? 0, pagado: false });
      } else if (cobro.saldoPendiente > 0) {
        // Pago parcial: solo cuenta como impago el saldo que todavía falta cobrar de ese mes.
        pendientes.push({ ...cobro, monto: cobro.saldoPendiente });
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return pendientes;
  },
  /** Próximo mes a cobrar si vence en los próximos 7 días y el contrato está al día
   *  (si ya tiene meses vencidos sin cobrar, esos aparecen en cobrosImpagosMes, no acá). */
  proximoCobro(alq) {
    if (!alq.fechaInicio) return null;
    if (sel.cobrosImpagosMes(alq).length > 0) return null;
    const hoy = new Date();
    const inicioProxMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    const dias = Math.round((inicioProxMes - hoy) / 86400000);
    if (dias > 7) return null;
    const mesKey = `${inicioProxMes.getFullYear()}-${String(inicioProxMes.getMonth()+1).padStart(2,'0')}`;
    if (alq.fechaFin && mesKey > alq.fechaFin.slice(0, 7)) return null; // el contrato termina antes de ese mes
    return { mes: mesKey, monto: alq.montoActual ?? alq.montoInicial ?? 0, dias };
  },
  /** Lista de próximos cobros (uno por contrato activo, si aplica), ordenada por urgencia. */
  proximosCobros() {
    return sel.alquileresActivos()
      .map(alq => ({ alq, ...sel.proximoCobro(alq) }))
      .filter(x => x.mes)
      .sort((a, b) => a.dias - b.dias);
  },
  alquileresActivos() {
    return state.alquileres.filter(a => !['rescindido', 'renovado'].includes(a.estado) && sel.diasAlVencimiento(a) >= 0);
  },
  /** Total a cobrar este mes (todos los contratos vigentes en el mes actual) vs. lo ya
   *  cobrado, agrupado por moneda (para no mezclar ARS con USD en una misma barra). */
  resumenCobrosMes() {
    const hoy = new Date();
    const mesKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const porMoneda = {};
    state.alquileres.forEach(alq => {
      if (['rescindido', 'renovado'].includes(alq.estado)) return;
      if (!alq.fechaInicio || alq.fechaInicio.slice(0, 7) > mesKey) return;
      if (alq.fechaFin && alq.fechaFin.slice(0, 7) < mesKey) return;
      const cobro = (alq.cobros || []).find(c => c.mes === mesKey);
      const corresponde = cobro?.montoEsperado ?? cobro?.monto ?? (alq.montoActual ?? alq.montoInicial ?? 0);
      const cobrado = cobro?.pagado ? Math.max(0, corresponde - (cobro.saldoPendiente || 0)) : 0;
      const moneda = alq.moneda || 'ARS';
      if (!porMoneda[moneda]) porMoneda[moneda] = { moneda, corresponde: 0, cobrado: 0 };
      porMoneda[moneda].corresponde += corresponde;
      porMoneda[moneda].cobrado += cobrado;
    });
    return Object.values(porMoneda).sort((a, b) => b.corresponde - a.corresponde);
  },
  proxVencimientos() {
    return state.alquileres
      .filter(a => !['rescindido', 'renovado'].includes(a.estado))
      .map(a => ({ alq: a, dias: sel.diasAlVencimiento(a) }))
      .filter(x => x.dias >= 0 && x.dias <= ALERTA_VENCIMIENTO_DIAS)
      .sort((a, b) => a.dias - b.dias);
  },

  /**
   * Contratos activos cuyo próximo ajuste de precio ya llegó o está a ≤30 días.
   * Retorna [{ alq, diasRestantes, proximoAjuste }] ordenado de más urgente a menos.
   */
  /**
   * Contratos activos cuyo próximo ajuste de precio ya llegó, está vencido, o está a
   * ≤ALERTA_AJUSTE_DIAS días (para avisar con anticipación, no solo cuando ya corresponde).
   * Retorna [{ alq, dias, proximoAjuste, pendientes }] ordenado de más urgente a menos.
   */
  contratosParaAjuste() {
    const resultado = [];
    state.alquileres.forEach(alq => {
      if (['rescindido', 'renovado'].includes(alq.estado)) return;
      if (sel.diasAlVencimiento(alq) < 0) return;
      if (!alq.fechaInicio || !alq.frecuenciaAjuste) return;
      const ajInfo = sel.infoAjuste(alq);
      if (!ajInfo || ajInfo.pendientes <= 0) return;
      resultado.push({ alq, dias: ajInfo.diasHastaProx, proximoAjuste: ajInfo.proxFecha, pendientes: ajInfo.pendientes });
    });
    return resultado.sort((a, b) => a.dias - b.dias);
  },

  /** Cuántos ajustes esperados tiene un contrato (para calcular el monto actual teórico).
   *  "pendientes" cuenta tanto los ajustes ya vencidos como el próximo que todavía no
   *  llegó pero ya está a ALERTA_AJUSTE_DIAS días o menos, para poder avisar con anticipación
   *  (ej. "dentro de 10 días", "dentro de 9 días", ...) en vez de recién el día que corresponde. */
  infoAjuste(alq) {
    if (!alq.fechaInicio || !alq.frecuenciaAjuste) return null;
    const hoy = new Date();
    const inicio = parseFechaLocal(alq.fechaInicio);
    const mesesFrecuencia = Number(alq.frecuenciaAjuste) || 6;
    const mesesTranscurridos =
      (hoy.getFullYear() - inicio.getFullYear()) * 12 +
      (hoy.getMonth() - inicio.getMonth());
    const expectedAjustes = Math.floor(mesesTranscurridos / mesesFrecuencia);
    const appliedAjustes  = (alq.historialAjustes || []).length;
    const vencidos = Math.max(0, expectedAjustes - appliedAjustes);
    const proxN = appliedAjustes + 1;
    const proxFecha = new Date(inicio);
    proxFecha.setMonth(proxFecha.getMonth() + proxN * mesesFrecuencia);
    const diasHastaProx = Math.ceil((proxFecha - hoy) / 86400000);
    const proximoEnVentana = diasHastaProx <= ALERTA_AJUSTE_DIAS;
    return {
      expected: expectedAjustes,
      applied:  appliedAjustes,
      vencidos,
      pendientes: vencidos > 0 ? vencidos : (proximoEnVentana ? 1 : 0),
      proxFecha: proxFecha.toISOString().slice(0,10),
      diasHastaProx,
    };
  },

  /* ---- Ventas ---- */
  ventasActivas() {
    return state.ventas.filter(v => !['escriturada','caida'].includes(v.estado));
  },

  /* ---- Agenda ---- */
  eventosHoy() {
    const hoy = new Date().toISOString().slice(0,10);
    return state.agenda.filter(e => !e.completado && e.fecha === hoy);
  },
  eventosPendientes() {
    const hoy = new Date().toISOString().slice(0,10);
    return state.agenda.filter(e => !e.completado && e.fecha >= hoy).sort((a,b) => a.fecha.localeCompare(b.fecha));
  },

  /* ---- Ventas: propiedades marcadas para vender (habilitadaVenta) ---- */
  propiedadesEnVenta() {
    return state.propiedades.filter(p => p.habilitadaVenta && p.estado !== 'vendida');
  },
  interesadosDePropiedad(propiedadId) {
    return state.interesados.filter(i => (i.propiedadesIds || []).includes(propiedadId));
  },

  /** Índice de vendibilidad (0-100) de una propiedad en venta, con el detalle de
   *  cada factor que lo compone (para poder mostrar "por qué" tiene ese puntaje). */
  indiceVendibilidad(p) {
    const docs = p.documentos || [];
    const mkt  = p.comercializacion || [];
    const factores = [];
    let score = 0;

    // 1) Estado documental — 20 pts, repartidos por documento según su peso
    // (Escritura e Informe de inhibición valen más que, por ejemplo, DNI propietario).
    const pesosDocs = Object.entries(PESOS_DOCUMENTO_VENTA);
    let ptsDocs = 0, completosClave = 0;
    pesosDocs.forEach(([tipo, peso]) => {
      const d = docs.find(x => (x.tipo || '').toLowerCase() === tipo.toLowerCase());
      if (d?.estado === 'completo') { ptsDocs += peso; completosClave++; }
    });
    ptsDocs = Math.round(ptsDocs * 10) / 10;
    score += ptsDocs;
    factores.push({ label: 'Documentación completa', puntos: ptsDocs, max: 20, detalle: docs.length ? `${completosClave}/${pesosDocs.length} documentos clave completos` : 'Sin documentos cargados' });

    // 2) Presencia en canales de comercialización — 20 pts
    const canalesUsados = new Set(mkt.map(m => m.accion));
    const ptsCanales = Math.round(Math.min(1, canalesUsados.size / CANALES_COMERCIALIZACION.length) * 20);
    score += ptsCanales;
    factores.push({ label: 'Publicación en canales', puntos: ptsCanales, max: 20, detalle: `${canalesUsados.size} canal${canalesUsados.size !== 1 ? 'es' : ''} utilizados` });

    // 3) Fotos y videos de calidad — 15 pts
    let ptsFV = 0;
    if (canalesUsados.has('Fotos profesionales')) ptsFV += 8;
    if (canalesUsados.has('Videos'))               ptsFV += 4;
    if (canalesUsados.has('Drone'))                ptsFV += 3;
    score += ptsFV;
    factores.push({ label: 'Fotos y videos de calidad', puntos: ptsFV, max: 15, detalle: [
      canalesUsados.has('Fotos profesionales') ? 'con fotos profesionales' : 'sin fotos profesionales',
      canalesUsados.has('Videos') ? 'con video' : 'sin video',
      canalesUsados.has('Drone') ? 'con drone' : 'sin drone',
    ].join(' · ') });

    // 4) Publicidad paga — 10 pts
    const hoy = new Date().toISOString().slice(0, 10);
    const campañaActiva = mkt.some(m => m.accion === 'Publicidad Meta Ads' && m.fechaInicio && m.fechaFin && m.fechaInicio <= hoy && hoy <= m.fechaFin);
    const tuvoCampaña = mkt.some(m => m.accion === 'Publicidad Meta Ads');
    const ptsAds = campañaActiva ? 10 : tuvoCampaña ? 5 : 0;
    score += ptsAds;
    factores.push({ label: 'Publicidad paga', puntos: ptsAds, max: 10, detalle: campañaActiva ? 'Campaña activa' : tuvoCampaña ? 'Tuvo campañas, ninguna activa' : 'Sin publicidad paga' });

    // 5) Antigüedad de la captación — 10 pts (más fresca = mejor)
    const dias = diasEntre(parseFechaLocal(p.fechaAlta), new Date());
    const ptsAntig = dias <= 30 ? 10 : dias <= 90 ? 7 : dias <= 180 ? 4 : 1;
    score += ptsAntig;
    factores.push({ label: 'Antigüedad de la captación', puntos: ptsAntig, max: 10, detalle: `${dias} día${dias !== 1 ? 's' : ''} desde la captación` });

    // 6) Consultas / interesados vinculados — 15 pts
    const nInteresados = sel.interesadosDePropiedad(p.id).length;
    const ptsInt = nInteresados >= 6 ? 15 : nInteresados >= 3 ? 10 : nInteresados >= 1 ? 5 : 0;
    score += ptsInt;
    factores.push({ label: 'Consultas / interesados', puntos: ptsInt, max: 15, detalle: `${nInteresados} interesado${nInteresados !== 1 ? 's' : ''} vinculados` });

    // 7) Flexibilidad del propietario — 5 pts
    const ptsFlex = p.flexiblePropietario ? 5 : 0;
    score += ptsFlex;
    factores.push({ label: 'Flexibilidad del propietario', puntos: ptsFlex, max: 5, detalle: p.flexiblePropietario ? 'Propietario flexible' : 'Sin flexibilidad declarada' });

    // 8) Estado de conservación — 5 pts
    const conserv = { excelente: 5, bueno: 4, regular: 2, malo: 0 };
    const ptsConserv = conserv[p.estadoConservacion] ?? 2;
    score += ptsConserv;
    factores.push({ label: 'Estado de conservación', puntos: ptsConserv, max: 5, detalle: p.estadoConservacion || 'No especificado' });

    score = Math.max(0, Math.min(100, Math.round(score)));
    const color = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
    return { score, color, factores };
  },

  /** Sugerencias accionables derivadas de los factores con puntaje bajo. */
  recomendacionesVenta(p) {
    const { factores } = sel.indiceVendibilidad(p);
    const mkt = p.comercializacion || [];
    const canalesUsados = new Set(mkt.map(m => m.accion));
    const f = (label) => factores.find(x => x.label === label);
    const recos = [];

    if ((f('Documentación completa')?.puntos ?? 0) < 15) recos.push('Completá la documentación pendiente.');
    if ((f('Publicación en canales')?.puntos ?? 0) < 12) recos.push('Publicá en más plataformas.');
    if (!canalesUsados.has('Fotos profesionales')) recos.push('Actualizá las fotografías (contratá un fotógrafo profesional).');
    if (!canalesUsados.has('Videos'))               recos.push('Realizá nuevos videos.');
    if (!canalesUsados.has('Drone'))                recos.push('Incorporá imágenes con drone.');
    if ((f('Publicidad paga')?.puntos ?? 0) < 10)   recos.push('Aumentá el presupuesto publicitario (campaña de Meta Ads).');
    if ((f('Antigüedad de la captación')?.puntos ?? 0) <= 4) recos.push('Evaluá bajar el precio o aceptar financiación / permutas.');
    if ((f('Consultas / interesados')?.puntos ?? 0) <= 5)    recos.push('Mejorá la descripción de la publicación.');
    if (!recos.length) recos.push('La propiedad está en buen estado de comercialización. Mantené el seguimiento habitual.');
    return recos.slice(0, 6);
  },

  /** Alertas automáticas de una propiedad en venta: documentación, autorización,
   *  renovación de fotos/video y recordatorio de contacto con el propietario. */
  alertasVenta(p) {
    const alerts = [];

    const docs = p.documentos || [];
    const pendientesOFaltantes = docs.filter(d => d.estado !== 'completo');
    if (pendientesOFaltantes.length) {
      alerts.push({
        tipo: 'documentacion',
        mensaje: `${pendientesOFaltantes.length} documento${pendientesOFaltantes.length !== 1 ? 's' : ''} pendiente${pendientesOFaltantes.length !== 1 ? 's' : ''}/faltante${pendientesOFaltantes.length !== 1 ? 's' : ''}`,
        urgente: pendientesOFaltantes.some(d => d.estado === 'faltante'),
      });
    }

    if (p.fechaVencimientoAutorizacion) {
      const dias = diasEntre(new Date(), p.fechaVencimientoAutorizacion);
      if (dias <= 30) {
        alerts.push({
          tipo: 'autorizacion',
          mensaje: dias < 0 ? `Autorización de venta vencida hace ${Math.abs(dias)} días` : `Autorización de venta vence en ${dias} día${dias !== 1 ? 's' : ''}`,
          urgente: dias <= 7,
        });
      }
    }

    const mkt = p.comercializacion || [];
    const ultimaFoto = mkt.filter(m => m.accion === 'Fotos profesionales').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
    if (!ultimaFoto || diasEntre(parseFechaLocal(ultimaFoto.fecha), new Date()) >= 180) {
      alerts.push({ tipo: 'fotos', mensaje: 'Renovar fotografías (sin actualizar hace más de 6 meses)', urgente: false });
    }
    const ultimoVideo = mkt.filter(m => m.accion === 'Videos').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
    if (!ultimoVideo || diasEntre(parseFechaLocal(ultimoVideo.fecha), new Date()) >= 180) {
      alerts.push({ tipo: 'videos', mensaje: 'Renovar videos (sin actualizar hace más de 6 meses)', urgente: false });
    }

    const frecDias = p.frecuenciaRecordatorioDias === 'personalizado'
      ? (Number(p.frecuenciaRecordatorioDiasCustom) || 30)
      : (Number(p.frecuenciaRecordatorioDias) || 30);
    const baseContacto = p.ultimoContactoPropietario || p.fechaAlta;
    const diasSinContacto = diasEntre(parseFechaLocal(baseContacto), new Date());
    if (diasSinContacto >= frecDias) {
      alerts.push({
        tipo: 'contacto',
        mensaje: `Contactar nuevamente al propietario (${diasSinContacto} días sin contacto)`,
        urgente: diasSinContacto >= frecDias * 1.5,
      });
    }

    return alerts;
  },
  /** Todas las alertas de todas las propiedades en venta, cada una con referencia a su propiedad. */
  alertasVentas() {
    return sel.propiedadesEnVenta().flatMap(p => sel.alertasVenta(p).map(a => ({ ...a, propiedad: p })));
  },

  /* ---- Matching propiedad ↔ clientes ---- */
  /**
   * Dado una propiedad, devuelve los clientes interesados con su % de coincidencia.
   * Solo considera clientes cuyo interes coincide con la operacion de la propiedad.
   */
  matchClientesPara(prop) {
    const ofAlquiler = !!(prop.precioAlquiler);
    const ofVenta    = !!(prop.precioVenta);

    return state.clientes
      .filter(c => {
        if (c.interes !== 'alquiler' && c.interes !== 'compra') return false;
        // Excluir si la operación es incompatible (tiene precio solo del otro tipo)
        if (c.interes === 'alquiler' && ofVenta && !ofAlquiler) return false;
        if (c.interes === 'compra'   && ofAlquiler && !ofVenta) return false;
        return true;
      })
      .map(c => ({ cliente: c, pct: calcMatch(prop, c) }))
      .filter(x => x.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  },

  /* ---- KPIs para Inicio ---- */
  kpis() {
    const cobrosVencidos = state.alquileres
      .filter(a => !['rescindido', 'renovado'].includes(a.estado))
      .flatMap(a => sel.cobrosImpagosMes(a)).length;

    return {
      totalClientes:     state.clientes.length,
      alquileresActivos: sel.alquileresActivos().length,
      ventasActivas:     sel.ventasActivas().length,
      cobrosVencidos,
      proxVencimientos:  sel.proxVencimientos().length,
      eventosHoy:        sel.eventosHoy().length,
      paraAjuste:        sel.contratosParaAjuste().length,
      propiedadesEnVenta: sel.propiedadesEnVenta().length,
      alertasVentas:      sel.alertasVentas().length,
    };
  },

  /* ---- Badges del sidebar ---- */
  badges() {
    const k = sel.kpis();
    return {
      cobrosVencidos: k.cobrosVencidos || 0,
      eventosHoy:     k.eventosHoy || 0,
    };
  },
};

/* ============================================================
   LÓGICA DE MATCHING
   Calcula % de coincidencia entre una propiedad y un cliente.
   ============================================================ */
function calcMatch(prop, cli) {
  const b = cli.busca || {};

  // La compatibilidad de operación (alquiler/compra) ya fue filtrada en matchClientesPara.

  let puntos = 0;
  let posibles = 0;

  // Tipo de propiedad — 30 puntos
  if (b.tipo) {
    posibles += 30;
    if (prop.tipo === b.tipo) puntos += 30;
  }

  // Zona / barrio — 25 puntos
  if (b.zona) {
    posibles += 25;
    const zona = b.zona.toLowerCase();
    if (
      (prop.barrio   || '').toLowerCase().includes(zona) ||
      (prop.ciudad   || '').toLowerCase().includes(zona) ||
      (prop.direccion|| '').toLowerCase().includes(zona)
    ) puntos += 25;
  }

  // Presupuesto — 25 puntos
  if (b.presupuesto) {
    posibles += 25;
    const precio = cli.interes === 'alquiler'
      ? (prop.precioAlquiler || prop.precio)
      : (prop.precioVenta    || prop.precio);
    const monedaOk = !b.moneda ||
      b.moneda === (cli.interes === 'alquiler' ? prop.monedaAlquiler : prop.monedaVenta) ||
      b.moneda === prop.moneda;
    if (precio && monedaOk) {
      if (precio <= b.presupuesto)        puntos += 25;
      else if (precio <= b.presupuesto * 1.15) puntos += 12; // hasta 15% sobre presupuesto
    }
  }

  // Ambientes — 15 puntos
  if (b.ambientes) {
    posibles += 15;
    const ambProp = Number(prop.ambientes) || 0;
    if (ambProp >= b.ambientes)          puntos += 15;
    else if (ambProp === b.ambientes - 1) puntos += 7;
  }

  // Superficie mínima (solo compra) — 5 puntos
  if (cli.interes === 'compra' && b.m2) {
    posibles += 5;
    if ((prop.m2 || 0) >= b.m2) puntos += 5;
  }

  // Sin datos de búsqueda = interesado pero sin criterios → 25% base
  if (!posibles) return 25;
  return Math.round((puntos / posibles) * 100);
}
