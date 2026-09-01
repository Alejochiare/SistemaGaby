/* ============================================================
   DATA — Capa de acceso a Firebase (Firestore + Storage).
   Mismo contrato que la versión PHP/SQLite original: cada método de
   `api` devuelve exactamente la misma forma de objeto que esperan
   store.js y las vistas, para no tener que tocar el resto del código.
   ============================================================ */
import { db, storage } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, runTransaction,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {
  ref as storageRef, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js';

function uid() {
  return crypto.randomUUID();
}

/** Firestore no acepta valores `undefined` — los formularios a veces
 *  arman objetos con campos opcionales en `undefined` en vez de omitirlos. */
function limpiar(obj) {
  const o = { ...obj };
  Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
  return o;
}

async function getAll(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function getOne(col, id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
async function createDoc(col, data) {
  const limpio = limpiar(data);
  delete limpio.id;
  const ref = await addDoc(collection(db, col), limpio);
  return { id: ref.id, ...limpio };
}
async function patchDoc(col, id, patch) {
  await updateDoc(doc(db, col, id), limpiar(patch));
  return getOne(col, id);
}
async function removeDoc(col, id) {
  await deleteDoc(doc(db, col, id));
  return { ok: true };
}

export async function subirArchivo(file, carpeta) {
  const path = `${carpeta}/${Date.now()}_${file.name}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

/* ============================================================
   CAJA — helpers internos compartidos (cobros, liquidaciones, ventas
   generan movimientos de caja como efecto colateral, igual que antes).
   Los movimientos viven en una colección plana `cajaMovimientos` (cada
   uno con su `fecha`), agrupados por fecha solo al mostrarlos — así
   borrar por id (deshacer un cobro, eliminar una liquidación) es directo.
   ============================================================ */
function normalizarMetodoPago(m) {
  if (!m) return 'otro';
  const v = String(m).trim().toLowerCase();
  if (v === 'transfer') return 'transferencia';
  const validos = ['efectivo', 'transferencia', 'cheque', 'debito', 'credito', 'otro'];
  return validos.includes(v) ? v : 'otro';
}

async function crearMovimientoCaja(data) {
  const fecha = data.fecha || new Date().toISOString().slice(0, 10);
  const mov = limpiar({
    fecha,
    hora: data.hora || new Date().toTimeString().slice(0, 5),
    tipo: data.tipo || 'ingreso',
    concepto: data.concepto || 'Movimiento de caja',
    monto: Math.round(Number(data.monto) || 0),
    metodoPago: normalizarMetodoPago(data.metodoPago),
    nota: data.nota || '',
    origen: data.origen || 'manual',
    refTipo: data.refTipo || null,
    refId: data.refId || null,
  });
  return createDoc('cajaMovimientos', mov);
}

/** Crea uno o varios movimientos a partir de un pago que puede venir
 *  dividido en varias líneas (ej: parte efectivo, parte transferencia). */
async function crearMovimientosPago(base, pagos, metodoPagoUnico, montoUnico, referenciaUnica, notaBase) {
  const lineas = (pagos && pagos.length) ? pagos : [{ metodoPago: metodoPagoUnico, monto: montoUnico, referencia: referenciaUnica }];
  const validas = lineas.filter((p) => (Number(p.monto) || 0) > 0);
  const creados = [];
  for (const p of validas) {
    creados.push(await crearMovimientoCaja({
      ...base,
      monto: p.monto,
      metodoPago: p.metodoPago,
      nota: [p.referencia, notaBase].filter(Boolean).join(' · '),
    }));
  }
  return creados;
}

async function eliminarMovimientosCajaPorIds(ids) {
  const validos = (ids || []).filter(Boolean);
  await Promise.all(validos.map((id) => deleteDoc(doc(db, 'cajaMovimientos', id)).catch(() => {})));
}

async function diaDeCajaConMovimientos(fecha) {
  const snap = await getDocs(query(collection(db, 'cajaMovimientos'), where('fecha', '==', fecha)));
  const movimientos = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  return { id: fecha, fecha, cerrado: false, fechaCierre: null, movimientos };
}

/** Fecha a usar para el movimiento de caja de un cobro: si se marcó "no
 *  sumar a la caja de hoy", se imputa al mes del alquiler. */
function fechaCajaDeCobro(c) {
  if (c.imputarAlMes && c.mes) return `${c.mes}-01`;
  return c.fechaPago || new Date().toISOString().slice(0, 10);
}

async function nombreCliente(id) {
  if (!id) return 'Inquilino';
  const c = await getOne('clientes', id);
  return c?.nombre || 'Inquilino';
}
async function direccionPropiedad(id) {
  if (!id) return 'Propiedad';
  const p = await getOne('propiedades', id);
  return p?.direccion || 'Propiedad';
}
async function nombrePropietario(id) {
  if (!id) return 'Propietario';
  const o = await getOne('propietarios', id);
  return o?.nombre || 'Propietario';
}

/** Si el cobro trae comisión inicial pendiente de cobrar y ya está pagado,
 *  genera el ingreso de caja correspondiente y marca el contrato como cobrada. */
async function procesarComisionInicial(a, c) {
  if (!c.pagado || !((Number(c.comisionInicialMonto) || 0) > 0) || c.comisionInicialCajaMovimientoId) return;
  const inq = await nombreCliente(a.inquilinoId);
  const prop = await direccionPropiedad(a.propiedadId);
  const mov = await crearMovimientoCaja({
    tipo: 'ingreso', concepto: `Comisión inicial • ${inq} • ${prop}`.trim(),
    monto: c.comisionInicialMonto, metodoPago: c.metodoPago || null,
    fecha: fechaCajaDeCobro(c), origen: 'comision-inicial', refTipo: 'comision-inicial', refId: c.id,
  });
  c.comisionInicialCajaMovimientoId = mov.id;
  a.comisionInicialCobrada = true;
}

/** Agrega una entrada al historial de abonos parciales de un cobro. */
function registrarAbonoEnHistorial(c, monto, montoAlquiler, metodoPago, pagos, fecha) {
  if (!((Number(monto) || 0) > 0)) return;
  c.abonos = c.abonos || [];
  c.abonos.push({
    id: uid(), numero: c.abonos.length + 1, fecha: fecha || new Date().toISOString().slice(0, 10),
    fechaRegistro: new Date().toISOString(), monto, montoAlquiler: montoAlquiler ?? monto,
    metodoPago: metodoPago || null, pagos: pagos || null,
  });
}

async function propiedadEstado(propiedadId, estado) {
  if (!propiedadId) return;
  await updateDoc(doc(db, 'propiedades', propiedadId), { estado });
}

async function hayOtroContratoActivo(propiedadId, excluirId = '') {
  const hoy = new Date().toISOString().slice(0, 10);
  const snap = await getDocs(query(collection(db, 'alquileres'), where('propiedadId', '==', propiedadId)));
  return snap.docs.some((d) => {
    if (d.id === excluirId) return false;
    const a = d.data();
    if (['rescindido', 'renovado'].includes(a.estado)) return false;
    if (a.fechaFin && a.fechaFin < hoy) return false;
    return true;
  });
}

async function sincronizarEstadoPropiedadVenta(propiedadId, estadoVenta) {
  const estadoProp = estadoVenta === 'escriturada' ? 'vendida' : estadoVenta === 'caida' ? 'disponible' : 'reservada';
  await propiedadEstado(propiedadId, estadoProp);
}

/* ============================================================
   API
   ============================================================ */
export const api = {
  async snapshot() {
    const [clientes, propietarios, propiedades, alquileres, ventas, agenda, temporales, liquidaciones, interesados] = await Promise.all([
      getAll('clientes'), getAll('propietarios'), getAll('propiedades'), getAll('alquileres'),
      getAll('ventas'), getAll('agenda'), getAll('temporales'), getAll('liquidaciones'), getAll('interesados'),
    ]);
    const movSnap = await getDocs(collection(db, 'cajaMovimientos'));
    const porFecha = {};
    movSnap.docs.forEach((d) => {
      const m = { id: d.id, ...d.data() };
      (porFecha[m.fecha] = porFecha[m.fecha] || []).push(m);
    });
    const caja = Object.keys(porFecha).sort((a, b) => b.localeCompare(a)).map((fecha) => ({
      id: fecha, fecha, cerrado: false, fechaCierre: null,
      movimientos: porFecha[fecha].sort((a, b) => (a.hora || '').localeCompare(b.hora || '')),
    }));
    return { clientes, propietarios, propiedades, alquileres, ventas, agenda, caja, temporales, liquidaciones, interesados };
  },

  /* ---- CLIENTES ---- */
  async createCliente(data) {
    const fecha = new Date().toISOString();
    return createDoc('clientes', { fechaAlta: fecha, ultimoContacto: fecha, seguimientos: [], tipos: data.tipos || [], busca: data.busca ?? null, ...data });
  },
  async updateCliente(id, patch) { return patchDoc('clientes', id, patch); },
  async deleteCliente(id) { return removeDoc('clientes', id); },
  async addSeguimiento(clienteId, nota) {
    const c = await getOne('clientes', clienteId);
    if (!c) throw new Error('Cliente no encontrado.');
    const fecha = new Date().toISOString();
    const seguimientos = [...(c.seguimientos || []), { id: uid(), fecha, nota }];
    await updateDoc(doc(db, 'clientes', clienteId), { seguimientos, ultimoContacto: fecha });
    return getOne('clientes', clienteId);
  },

  /* ---- PROPIETARIOS ---- */
  async createPropietario(data) {
    const fecha = new Date().toISOString();
    return createDoc('propietarios', { fechaAlta: fecha, ultimoContacto: fecha, seguimientos: [], ...data });
  },
  async updatePropietario(id, patch) { return patchDoc('propietarios', id, patch); },
  async deletePropietario(id) { return removeDoc('propietarios', id); },
  async addSeguimientoPropietario(propietarioId, nota) {
    const p = await getOne('propietarios', propietarioId);
    if (!p) throw new Error('Propietario no encontrado.');
    const fecha = new Date().toISOString();
    const seguimientos = [...(p.seguimientos || []), { id: uid(), fecha, nota }];
    await updateDoc(doc(db, 'propietarios', propietarioId), { seguimientos, ultimoContacto: fecha });
    return getOne('propietarios', propietarioId);
  },

  /* ---- PROPIEDADES ---- */
  async createPropiedad(data) {
    return createDoc('propiedades', { fechaAlta: new Date().toISOString(), estado: data.estado || 'disponible', documentos: [], comercializacion: [], informes: [], ...data });
  },
  async updatePropiedad(id, patch) { return patchDoc('propiedades', id, patch); },
  async deletePropiedad(id) { return removeDoc('propiedades', id); },
  async addDocumentoPropiedad(propiedadId, docItem) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const documentos = [...(p.documentos || []), { id: uid(), fechaSubida: new Date().toISOString(), estado: docItem.estado || 'completo', tipo: docItem.tipo || '', notas: docItem.notas || '', url: docItem.url || null, nombreArchivo: docItem.nombreArchivo || null }];
    await updateDoc(doc(db, 'propiedades', propiedadId), { documentos });
    return getOne('propiedades', propiedadId);
  },
  async updateDocumentoPropiedad(propiedadId, docId, patch) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const documentos = (p.documentos || []).map((d) => (d.id === docId ? { ...d, ...patch } : d));
    await updateDoc(doc(db, 'propiedades', propiedadId), { documentos });
    return getOne('propiedades', propiedadId);
  },
  async deleteDocumentoPropiedad(propiedadId, docId) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const documentos = (p.documentos || []).filter((d) => d.id !== docId);
    await updateDoc(doc(db, 'propiedades', propiedadId), { documentos });
    return getOne('propiedades', propiedadId);
  },
  async addComercializacionPropiedad(propiedadId, accion) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const comercializacion = [...(p.comercializacion || []), { id: uid(), fecha: accion.fecha || new Date().toISOString().slice(0, 10), accion: accion.accion || '', notas: accion.notas || '', presupuesto: accion.presupuesto ?? null, fechaInicio: accion.fechaInicio ?? null, fechaFin: accion.fechaFin ?? null }];
    await updateDoc(doc(db, 'propiedades', propiedadId), { comercializacion });
    return getOne('propiedades', propiedadId);
  },
  async updateComercializacionPropiedad(propiedadId, accionId, patch) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const comercializacion = (p.comercializacion || []).map((a) => (a.id === accionId ? { ...a, ...patch } : a));
    await updateDoc(doc(db, 'propiedades', propiedadId), { comercializacion });
    return getOne('propiedades', propiedadId);
  },
  async deleteComercializacionPropiedad(propiedadId, accionId) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const comercializacion = (p.comercializacion || []).filter((a) => a.id !== accionId);
    await updateDoc(doc(db, 'propiedades', propiedadId), { comercializacion });
    return getOne('propiedades', propiedadId);
  },
  async addInformePropiedad(propiedadId, informe) {
    const p = await getOne('propiedades', propiedadId);
    if (!p) throw new Error('Propiedad no encontrada.');
    const { id: _ignorado, fecha, ...datos } = informe;
    const informes = [...(p.informes || []), { id: uid(), fecha: fecha || new Date().toISOString(), ...datos }];
    await updateDoc(doc(db, 'propiedades', propiedadId), { informes });
    return getOne('propiedades', propiedadId);
  },

  /* ---- ALQUILERES ---- */
  async createAlquiler(data) {
    if (await hayOtroContratoActivo(data.propiedadId)) throw new Error('La propiedad ya tiene un contrato de alquiler activo.');
    const creado = await createDoc('alquileres', { fechaAlta: new Date().toISOString(), estado: data.estado || 'activo', historialAjustes: [], entregasContrato: [], cobros: [], ...data });
    await propiedadEstado(data.propiedadId, 'alquilada');
    return creado;
  },
  async updateAlquiler(id, patch) { return patchDoc('alquileres', id, patch); },
  async renovarAlquiler(oldId, data) {
    const old = await getOne('alquileres', oldId);
    if (!old) throw new Error('Contrato a renovar no encontrado.');
    const creado = await createDoc('alquileres', { fechaAlta: new Date().toISOString(), estado: 'activo', historialAjustes: [], entregasContrato: [], cobros: [], ...data, renovadoDeId: oldId });
    await updateDoc(doc(db, 'alquileres', oldId), { estado: 'renovado', renovadoEnId: creado.id });
    await propiedadEstado(data.propiedadId, 'alquilada');
    return creado;
  },
  async registrarEntregaContrato(alquilerId, data) {
    const a = await getOne('alquileres', alquilerId);
    if (!a) throw new Error('Contrato no encontrado.');
    const entregasContrato = [...(a.entregasContrato || []), { id: uid(), fecha: new Date().toISOString().slice(0, 10), destinatarios: data.destinatarios || [], nota: data.nota || '' }];
    await updateDoc(doc(db, 'alquileres', alquilerId), { entregasContrato });
    return getOne('alquileres', alquilerId);
  },
  async cancelarAlquiler(id) {
    const a = await getOne('alquileres', id);
    if (!a) throw new Error('Contrato no encontrado.');
    await updateDoc(doc(db, 'alquileres', id), { estado: 'rescindido', fechaCancelacion: new Date().toISOString().slice(0, 10) });
    if (!(await hayOtroContratoActivo(a.propiedadId, id))) await propiedadEstado(a.propiedadId, 'disponible');
    return getOne('alquileres', id);
  },
  async deleteAlquiler(id) {
    const a = await getOne('alquileres', id);
    if (a && !(await hayOtroContratoActivo(a.propiedadId, id))) await propiedadEstado(a.propiedadId, 'disponible');
    return removeDoc('alquileres', id);
  },
  async addCobro(alquilerId, cobro) {
    const a = await getOne('alquileres', alquilerId);
    if (!a) throw new Error('Contrato no encontrado.');
    const c = { id: uid(), fechaRegistro: new Date().toISOString(), pagado: false, ...cobro };
    if (c.pagado && (Number(c.monto) || 0) > 0) {
      const inq = await nombreCliente(a.inquilinoId);
      const prop = await direccionPropiedad(a.propiedadId);
      const movs = await crearMovimientosPago({
        tipo: 'ingreso', concepto: `Cobro alquiler • ${inq} • ${prop} • ${c.mes || ''}`.trim(),
        fecha: fechaCajaDeCobro(c), origen: 'cobro-alquiler', refTipo: 'cobro', refId: c.id,
      }, c.pagos || null, c.metodoPago || null, c.monto || 0, c.referencia || null, c.nota || null);
      c.cajaMovimientoIds = movs.map((m) => m.id);
      c.cajaMovimientoId = movs[0]?.id || null;
      registrarAbonoEnHistorial(c, c.monto, c.montoAlquiler, c.metodoPago, c.pagos, fechaCajaDeCobro(c));
    }
    await procesarComisionInicial(a, c);
    const cobros = [...(a.cobros || []), c];
    await updateDoc(doc(db, 'alquileres', alquilerId), limpiar({ cobros, comisionInicialCobrada: a.comisionInicialCobrada ?? false }));
    return getOne('alquileres', alquilerId);
  },
  async updateCobro(alquilerId, cobroId, patch) {
    const a = await getOne('alquileres', alquilerId);
    if (!a) throw new Error('Contrato no encontrado.');
    const idx = (a.cobros || []).findIndex((x) => x.id === cobroId);
    if (idx === -1) throw new Error('Cobro no encontrado.');
    const estabaPagado = !!a.cobros[idx].pagado;
    const c = { ...a.cobros[idx], ...patch };
    if (patch.pagado && !estabaPagado && (Number(c.monto) || 0) > 0 && !c.cajaMovimientoId) {
      const inq = await nombreCliente(a.inquilinoId);
      const prop = await direccionPropiedad(a.propiedadId);
      const movs = await crearMovimientosPago({
        tipo: 'ingreso', concepto: `Cobro alquiler • ${inq} • ${prop} • ${c.mes || ''}`.trim(),
        fecha: fechaCajaDeCobro(c), origen: 'cobro-alquiler', refTipo: 'cobro', refId: c.id,
      }, c.pagos || null, c.metodoPago || null, c.monto || 0, c.referencia || null, c.nota || null);
      c.cajaMovimientoIds = movs.map((m) => m.id);
      c.cajaMovimientoId = movs[0]?.id || null;
      registrarAbonoEnHistorial(c, c.monto, c.montoAlquiler, c.metodoPago, c.pagos, fechaCajaDeCobro(c));
    }
    await procesarComisionInicial(a, c);
    const cobros = [...a.cobros]; cobros[idx] = c;
    await updateDoc(doc(db, 'alquileres', alquilerId), limpiar({ cobros, comisionInicialCobrada: a.comisionInicialCobrada ?? false }));
    return getOne('alquileres', alquilerId);
  },
  async registrarAbonoCobro(alquilerId, cobroId, patch) {
    const a = await getOne('alquileres', alquilerId);
    if (!a) throw new Error('Contrato no encontrado.');
    const idx = (a.cobros || []).findIndex((x) => x.id === cobroId);
    if (idx === -1) throw new Error('Cobro no encontrado.');
    const c = { ...a.cobros[idx], ...patch };
    if ((Number(patch.monto) || 0) > 0) {
      const inq = await nombreCliente(a.inquilinoId);
      const prop = await direccionPropiedad(a.propiedadId);
      const movs = await crearMovimientosPago({
        tipo: 'ingreso', concepto: `Cobro alquiler (abono) • ${inq} • ${prop} • ${c.mes || ''}`.trim(),
        fecha: fechaCajaDeCobro(patch), origen: 'cobro-alquiler', refTipo: 'cobro', refId: c.id,
      }, patch.pagos || null, patch.metodoPago || null, patch.monto || 0, patch.referencia || null, patch.nota || null);
      c.cajaMovimientoIds = [...(c.cajaMovimientoIds || []), ...movs.map((m) => m.id)];
      c.cajaMovimientoId = c.cajaMovimientoId || movs[0]?.id || null;
      registrarAbonoEnHistorial(c, patch.monto, patch.montoAlquiler, patch.metodoPago, patch.pagos, fechaCajaDeCobro(patch));
    }
    await procesarComisionInicial(a, c);
    const cobros = [...a.cobros]; cobros[idx] = c;
    await updateDoc(doc(db, 'alquileres', alquilerId), limpiar({ cobros, comisionInicialCobrada: a.comisionInicialCobrada ?? false }));
    return getOne('alquileres', alquilerId);
  },
  async deshacerCobro(alquilerId, cobroId) {
    const a = await getOne('alquileres', alquilerId);
    if (!a) throw new Error('Contrato no encontrado.');
    const c = (a.cobros || []).find((x) => x.id === cobroId);
    if (!c) return { ok: true };
    await eliminarMovimientosCajaPorIds([...(c.cajaMovimientoIds || []), c.comisionInicialCajaMovimientoId].filter(Boolean));
    const patch = { cobros: (a.cobros || []).filter((x) => x.id !== cobroId) };
    if (c.comisionInicialCajaMovimientoId) patch.comisionInicialCobrada = false;
    await updateDoc(doc(db, 'alquileres', alquilerId), patch);
    return { ok: true };
  },
  async registrarAumento(alqId, nuevoMonto, nota) {
    const a = await getOne('alquileres', alqId);
    if (!a) throw new Error('Contrato no encontrado.');
    const montoAnterior = a.montoActual ?? a.montoInicial ?? 0;
    const aj = { id: uid(), fecha: new Date().toISOString().slice(0, 10), montoAnterior, montoNuevo: nuevoMonto, nota: nota || '' };
    const historialAjustes = [...(a.historialAjustes || []), aj];
    await updateDoc(doc(db, 'alquileres', alqId), { historialAjustes, montoActual: nuevoMonto });
    return aj;
  },
  async editarUltimoAjuste(alqId, patch) {
    const a = await getOne('alquileres', alqId);
    if (!a || !(a.historialAjustes || []).length) throw new Error('No hay ajustes para editar.');
    const historialAjustes = [...a.historialAjustes];
    const ultimo = { ...historialAjustes[historialAjustes.length - 1] };
    if ('fecha' in patch) ultimo.fecha = patch.fecha;
    if ('nota' in patch) ultimo.nota = patch.nota;
    const upd = {};
    if ('montoNuevo' in patch) { ultimo.montoNuevo = patch.montoNuevo; upd.montoActual = patch.montoNuevo; }
    historialAjustes[historialAjustes.length - 1] = ultimo;
    upd.historialAjustes = historialAjustes;
    await updateDoc(doc(db, 'alquileres', alqId), upd);
    return getOne('alquileres', alqId);
  },
  async deshacerUltimoAjuste(alqId) {
    const a = await getOne('alquileres', alqId);
    if (!a || !(a.historialAjustes || []).length) throw new Error('No hay ajustes para deshacer.');
    const ultimo = a.historialAjustes[a.historialAjustes.length - 1];
    await updateDoc(doc(db, 'alquileres', alqId), {
      montoActual: ultimo.montoAnterior,
      historialAjustes: a.historialAjustes.slice(0, -1),
    });
    return getOne('alquileres', alqId);
  },

  /* ---- VENTAS ---- */
  async createVenta(data) {
    const creado = await createDoc('ventas', { fechaAlta: new Date().toISOString(), estado: data.estado || 'en_curso', ...data });
    if (data.propiedadId) await sincronizarEstadoPropiedadVenta(data.propiedadId, creado.estado);
    const sena = Number(data.sena) || 0;
    const precio = Number(data.precio) || 0;
    const importe = sena > 0 ? sena : precio;
    if (importe > 0) {
      const direccion = data.propiedadId ? await direccionPropiedad(data.propiedadId) : 'Propiedad';
      const mov = await crearMovimientoCaja({
        tipo: 'ingreso', concepto: `${sena > 0 ? 'Seña venta' : 'Venta'} • ${direccion}`.trim(),
        monto: importe, metodoPago: 'otro',
        nota: sena > 0 ? 'Seña / anticipo de venta' : 'Venta registrada',
        fecha: data.fechaReserva || data.fechaEscritura || new Date().toISOString().slice(0, 10),
        origen: 'venta', refTipo: 'venta', refId: creado.id,
      });
      await updateDoc(doc(db, 'ventas', creado.id), { cajaMovimientoId: mov.id });
    }
    return getOne('ventas', creado.id);
  },
  async updateVenta(id, patch) {
    await updateDoc(doc(db, 'ventas', id), limpiar(patch));
    if (patch.estado) {
      const v = await getOne('ventas', id);
      if (v?.propiedadId) await sincronizarEstadoPropiedadVenta(v.propiedadId, patch.estado);
    }
    return getOne('ventas', id);
  },
  async deleteVenta(id) {
    const v = await getOne('ventas', id);
    if (v?.propiedadId) {
      const snap = await getDocs(query(collection(db, 'alquileres'), where('propiedadId', '==', v.propiedadId), where('estado', '==', 'activo')));
      await propiedadEstado(v.propiedadId, snap.empty ? 'disponible' : 'alquilada');
    }
    return removeDoc('ventas', id);
  },

  /* ---- TEMPORALES ---- */
  async createTemporal(data) { return createDoc('temporales', { fechaAlta: new Date().toISOString(), estado: data.estado || 'confirmado', ...data }); },
  async updateTemporal(id, patch) { return patchDoc('temporales', id, patch); },
  async deleteTemporal(id) { return removeDoc('temporales', id); },

  /* ---- LIQUIDACIONES ---- */
  async createLiquidacion(data) {
    const creado = await createDoc('liquidaciones', { fechaAlta: new Date().toISOString(), estado: data.estado || 'pendiente', ...data });
    const id = creado.id;
    const prop = data.propiedadId ? await direccionPropiedad(data.propiedadId) : 'Propiedad';
    const meses = data.meses || [];
    const periodoLbl = data.mes || (meses.length ? (meses.length > 1 ? `${meses[0]} a ${meses[meses.length - 1]}` : meses[0]) : '');
    let movs = [];
    if (data.noCaja) {
      // sin movimiento: pago gestionado fuera del flujo de caja diaria.
    } else if (Array.isArray(data.propietarios) && data.propietarios.length) {
      for (const po of data.propietarios) {
        const totalPagarPo = Number(po.totalPagar) || 0;
        if (totalPagarPo <= 0) continue;
        const own = await nombrePropietario(po.propietarioId);
        const movsPo = await crearMovimientosPago({
          tipo: 'egreso', concepto: `Pago a propietario • ${own} (${po.porcentaje ?? ''}%) • ${prop} • ${periodoLbl}`.trim(),
          fecha: data.fechaPago || new Date().toISOString().slice(0, 10), origen: 'liquidacion', refTipo: 'liquidacion', refId: id,
        }, po.pagos || null, po.formaPago || null, totalPagarPo, null, data.notas || null);
        movs = movs.concat(movsPo);
      }
    } else {
      const totalPagar = Number(data.totalPagar ?? data.montoAlquiler ?? 0);
      if (totalPagar > 0) {
        const own = await nombrePropietario(data.propietarioId);
        movs = await crearMovimientosPago({
          tipo: 'egreso', concepto: `Pago a propietario • ${own} • ${prop} • ${periodoLbl}`.trim(),
          fecha: data.fechaPago || new Date().toISOString().slice(0, 10), origen: 'liquidacion', refTipo: 'liquidacion', refId: id,
        }, data.pagos || null, data.formaPago || null, totalPagar, null, data.notas || null);
      }
    }
    if (movs.length) {
      const ids = movs.map((m) => m.id);
      await updateDoc(doc(db, 'liquidaciones', id), { cajaMovimientoIds: ids, cajaMovimientoId: ids[0] });
    }
    return getOne('liquidaciones', id);
  },
  async updateLiquidacion(id, patch) { return patchDoc('liquidaciones', id, patch); },
  async deleteLiquidacion(id) {
    const l = await getOne('liquidaciones', id);
    if (l) await eliminarMovimientosCajaPorIds([...(l.cajaMovimientoIds || []), l.cajaMovimientoId].filter(Boolean));
    return removeDoc('liquidaciones', id);
  },

  /* ---- AGENDA ---- */
  async createEvento(data) { return createDoc('agenda', { fechaAlta: new Date().toISOString(), completado: false, ...data }); },
  async updateEvento(id, patch) { return patchDoc('agenda', id, patch); },
  async deleteEvento(id) { return removeDoc('agenda', id); },

  /* ---- INTERESADOS ---- */
  async createInteresado(data) { return createDoc('interesados', { fechaAlta: new Date().toISOString(), propiedadesIds: data.propiedadesIds || [], contactos: [], ...data }); },
  async updateInteresado(id, patch) { return patchDoc('interesados', id, patch); },
  async deleteInteresado(id) { return removeDoc('interesados', id); },
  async addContactoInteresado(interesadoId, contacto) {
    const it = await getOne('interesados', interesadoId);
    if (!it) throw new Error('Interesado no encontrado.');
    const contactos = [...(it.contactos || []), { id: uid(), fecha: contacto.fecha || new Date().toISOString().slice(0, 10), hora: contacto.hora || new Date().toTimeString().slice(0, 5), tipo: contacto.tipo || '', propiedadId: contacto.propiedadId || null, observaciones: contacto.observaciones || '' }];
    await updateDoc(doc(db, 'interesados', interesadoId), { contactos });
    return getOne('interesados', interesadoId);
  },
  async deleteContactoInteresado(interesadoId, contactoId) {
    const it = await getOne('interesados', interesadoId);
    if (!it) throw new Error('Interesado no encontrado.');
    const contactos = (it.contactos || []).filter((c) => c.id !== contactoId);
    await updateDoc(doc(db, 'interesados', interesadoId), { contactos });
    return getOne('interesados', interesadoId);
  },

  /* ---- CAJA ----
   * Registro permanente: no existe el concepto de "cerrar" un día — es un
   * único libro continuo, agrupado por fecha solo para mostrarlo ordenado. */
  async cajaHoy() { return diaDeCajaConMovimientos(new Date().toISOString().slice(0, 10)); },
  async addMovimiento(cajaId, data) {
    const fecha = data.fecha || cajaId || new Date().toISOString().slice(0, 10);
    await crearMovimientoCaja({ ...data, fecha, origen: data.origen || 'manual' });
    return diaDeCajaConMovimientos(fecha);
  },
  async deleteMovimiento(cajaId, movId) { return removeDoc('cajaMovimientos', movId); },

  /* ---- CORRELATIVOS (recibo, liquidación, deuda, informe de captación, contrato) ----
   * Transacción de Firestore para evitar condiciones de carrera. */
  async siguienteNumero(tipo) {
    const validos = ['recibo', 'liquidacion', 'deuda', 'informe_captacion', 'contrato'];
    if (!validos.includes(tipo)) throw new Error('Tipo de contador inválido.');
    const ref = doc(db, 'contadores', tipo);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const nuevo = (snap.exists() ? (snap.data().ultimoNumero || 0) : 0) + 1;
      tx.set(ref, { tipo, ultimoNumero: nuevo }, { merge: true });
      return nuevo;
    });
  },

  /* ---- AGENCIA (perfil: nombre, cuit, dirección, etc.) ---- */
  async getAgencia() {
    const snap = await getDoc(doc(db, 'agencia', 'main'));
    return snap.exists() ? snap.data() : {};
  },
  async updateAgencia(patch) {
    await setDoc(doc(db, 'agencia', 'main'), limpiar(patch), { merge: true });
    const snap = await getDoc(doc(db, 'agencia', 'main'));
    return snap.data();
  },
};
