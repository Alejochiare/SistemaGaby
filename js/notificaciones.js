/* ============================================================
   NOTIFICACIONES — Browser notifications + sonido + scheduler
   ============================================================ */
import { getState, sel, subscribe } from './store.js';

function navegar(ruta) { location.hash = `#/${ruta}`; }

const KEY_NOTIF = 'inmocrm_notif_vistas';

function getVistas() { try { return new Set(JSON.parse(localStorage.getItem(KEY_NOTIF)||'[]')); } catch { return new Set(); } }
function marcarVista(id) { const s = getVistas(); s.add(id); localStorage.setItem(KEY_NOTIF, JSON.stringify([...s].slice(-200))); }

/* Sonido beep con Web Audio */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 520;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function mostrarNotif(titulo, cuerpo, alqId = null) {
  beep();
  if (Notification.permission === 'granted') {
    const n = new Notification(titulo, { body: cuerpo, icon: '/favicon.ico', tag: titulo });
    if (alqId) n.onclick = () => { window.focus(); navegar(`alquileres/${alqId}`); n.close(); };
  } else {
    // Fallback: toast en pantalla
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;background:var(--surface);border:1.5px solid var(--primary);border-radius:var(--r-md);padding:.85rem 1.1rem;box-shadow:var(--shadow-lg);z-index:9999;max-width:320px;cursor:pointer;animation:fadeIn .2s ease`;
    toast.innerHTML = `<div style="font-weight:600;font-size:.875rem;margin-bottom:.2rem">${titulo}</div><div style="font-size:.78rem;color:var(--text-soft)">${cuerpo}</div>`;
    if (alqId) toast.onclick = () => { navegar(`alquileres/${alqId}`); toast.remove(); };
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }
}

/* Genera las alertas automáticas de contratos */
function alertasAuto() {
  const { alquileres, clientes, propiedades } = getState();
  const hoy = new Date().toISOString().slice(0, 10);
  const alerts = [];

  alquileres.forEach(alq => {
    if (alq.estado === 'rescindido' || alq.estado === 'renovado') return;
    const inq  = clientes.find(c => c.id === alq.inquilinoId);
    const prop = propiedades.find(p => p.id === alq.propiedadId);
    const nombre = inq?.nombre || '—';
    const dir    = prop?.direccion || '—';
    const dias   = sel.diasAlVencimiento(alq);

    // Vencimiento próximo
    if (dias >= 0 && dias <= 60) {
      const id = `venc_${alq.id}_${alq.fechaFin}`;
      alerts.push({ id, titulo: `Contrato por vencer — ${nombre}`, cuerpo: `${dir} vence en ${dias} día${dias!==1?'s':''}`, alqId: alq.id, fecha: alq.fechaFin });
    }

    // Cobros impagos
    const impagos = sel.cobrosImpagosMes(alq);
    if (impagos.length) {
      const id = `deuda_${alq.id}_${hoy.slice(0,7)}`;
      alerts.push({ id, titulo: `Pago pendiente — ${nombre}`, cuerpo: `${impagos.length} mes${impagos.length!==1?'es':''} sin cobrar · ${dir}`, alqId: alq.id, fecha: hoy });
    }

    // Aumento pendiente
    const ajInfo = sel.infoAjuste(alq);
    if (ajInfo?.pendientes > 0) {
      const id = `aumento_${alq.id}_${ajInfo.pendientes}`;
      alerts.push({ id, titulo: `Aumento pendiente — ${nombre}`, cuerpo: `${ajInfo.pendientes} ajuste${ajInfo.pendientes!==1?'s':''} sin aplicar · ${dir}`, alqId: alq.id, fecha: hoy });
    }

    // Aumento próximo (cuenta regresiva desde 10 días antes de la fecha)
    if (ajInfo && ajInfo.pendientes === 0 && ajInfo.diasHastaProx >= 0 && ajInfo.diasHastaProx <= 10) {
      const id = `aumentoproximo_${alq.id}_${ajInfo.diasHastaProx}`;
      const cuando = ajInfo.diasHastaProx === 0 ? 'hoy' : `en ${ajInfo.diasHastaProx} día${ajInfo.diasHastaProx!==1?'s':''}`;
      alerts.push({ id, titulo: `Aumento próximo — ${nombre}`, cuerpo: `${dir} aumenta ${cuando}`, alqId: alq.id, fecha: hoy });
    }
  });

  return alerts;
}

/* Chequea alertas de agenda (eventos en la fecha/hora exacta) */
function chequearAgendaExacta() {
  const { agenda } = getState();
  const ahora = new Date();
  const fechaHoy = ahora.toISOString().slice(0, 10);
  const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
  const vistas = getVistas();

  agenda.forEach(ev => {
    if (ev.completado) return;
    if (ev.fecha !== fechaHoy) return;
    if (!ev.hora) return;
    if (ev.hora !== horaAhora) return;
    const id = `agenda_${ev.id}_${ev.fecha}_${ev.hora}`;
    if (vistas.has(id)) return;
    marcarVista(id);
    mostrarNotif(`🗓 ${ev.titulo}`, ev.notas || `Hoy a las ${ev.hora}`);
  });
}

/* Chequea alertas automáticas de contratos (una vez por día) */
function chequearAlertas() {
  const hoy = new Date().toISOString().slice(0, 10);
  const vistas = getVistas();
  alertasAuto().forEach(a => {
    const id = `${a.id}_dia_${hoy}`;
    if (vistas.has(id)) return;
    marcarVista(id);
    mostrarNotif(a.titulo, a.cuerpo, a.alqId);
  });
}

export { alertasAuto };

export function initNotificaciones() {
  // Pedir permiso
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Chequear alertas de contratos al iniciar
  setTimeout(chequearAlertas, 3000);

  // Chequear agenda exacta cada minuto
  setInterval(chequearAgendaExacta, 60000);
  chequearAgendaExacta();

  // Re-chequear contratos cuando cambia el estado
  subscribe(() => setTimeout(chequearAlertas, 500));
}
