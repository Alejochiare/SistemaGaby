/* ============================================================
   APP — Punto de entrada de la aplicación.
   Orquesta el arranque: datos → UI persistente → router.
   ------------------------------------------------------------
   El orden importa:
   1) initStore()  carga la "base" (api/localStorage) al estado.
   2) initSidebar() + initTopbar() montan el chrome persistente
      y se suscriben al store para mantenerse vivos. s
   ============================================================ */
import { initStore } from './store.js';
import { initSidebar } from './components/sidebar.js';
import { initTopbar } from './components/topbar.js';
import { initAsistente } from './components/asistente.js';
import { initRouter } from './router.js';
import { initNotifications } from './notifications.js?v=2';
import { $, formatearMontoInput } from './lib.js';
import { actualizarIndices } from './indices.js';
import { toast } from './components/toast.js';
import { requireLogin, cerrarSesion } from './auth.js?v=2';
import { confirmar } from './components/modal.js';
import { api } from './data.js';
import { setAgencia } from './imprimir.js?v=2';

// Formato de miles en vivo (200.000, 1.000.000) para cualquier input de monto,
// sin importar en qué modal/vista se cree (delegado a nivel documento).
document.addEventListener('input', (e) => {
  if (e.target.matches?.('.input-monto')) formatearMontoInput(e);
});

// El almacenamiento del navegador (localStorage) tiene un límite de unos 5-10MB.
// Si se llena (normalmente por fotos pesadas) el último cambio NO se guardó —
// avisamos fuerte para que se liberen fotos/documentos, en vez de perder datos en silencio.
window.addEventListener('inmocrm-storage-full', () => {
  toast('No se pudo guardar el último cambio: el almacenamiento del navegador está lleno. Borrá fotos o documentos pesados para liberar espacio y volvé a intentar.', { tipo: 'danger', titulo: 'Almacenamiento lleno', duracion: 15000 });
});

async function boot() {
  await requireLogin();   // pantalla de acceso (usuario/contraseña fijos)

  // Pantalla de carga mínima mientras se hidrata el estado
  const root = $('#viewRoot');
  if (root) root.innerHTML = '<div class="view"><div class="spinner"></div></div>';

  await initStore();   // hidrata leads/propiedades/tareas/usuarios
  // Los datos de la inmobiliaria (para el encabezado de recibos/liquidaciones) viven
  // en la base real, pero imprimir.js los lee en forma sincrónica desde localStorage
  // (no puede esperar un fetch al momento de generar un documento) — por eso acá, una
  // vez por arranque, se trae el valor real de la base y se espeja a ese caché local.
  api.getAgencia().then(setAgencia).catch(() => {});
  initSidebar();          // navegación + badges en vivo
  initTopbar();           // tema, colapso, búsqueda global, notificaciones
  initRouter();           // resuelve y renderiza la vista del hash
  initNotifications();    // alertas del SO para eventos de agenda
  initAsistente();        // bot de ayuda (botón flotante) con preguntas frecuentes

  $('#btnLogout')?.addEventListener('click', async () => {
    const ok = await confirmar({ title: 'Cerrar sesión', mensaje: '¿Querés cerrar la sesión actual?', okLabel: 'Cerrar sesión' });
    if (ok) cerrarSesion();
  });

  // % de ICL/IPC automático (APIs públicas) — no bloquea el arranque si tarda o falla
  actualizarIndices().catch(() => {});

  // Atajo de teclado: Ctrl/Cmd + K enfoca la búsqueda global
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#globalSearch')?.focus();
    }
  });
}

boot().catch(err => {
  console.error('Error al iniciar InmoTrack:', err);
  const root = document.getElementById('viewRoot');
  if (root) root.innerHTML = `<div class="view"><div class="empty"><h3>No se pudo iniciar la aplicación</h3><p>${err.message}</p></div></div>`;
});
