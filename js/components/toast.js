/* ============================================================
   COMPONENT · Toast — notificaciones efímeras
   ============================================================ */
import { icon } from '../config.js';
import { el } from '../lib.js';

const root = () => document.getElementById('toastRoot');
const ICON = { success: 'check', danger: 'alert', warning: 'alert', info: 'inbox' };

export function toast(msg, { tipo = 'success', titulo = '', duracion = 3200 } = {}) {
  const titulos = { success: 'Listo', danger: 'Error', warning: 'Atención', info: 'Info' };
  const node = el(`
    <div class="toast ${tipo}">
      <span class="toast-icon">${icon(ICON[tipo] || 'inbox')}</span>
      <div>
        <div class="toast-title">${titulo || titulos[tipo]}</div>
        <div class="toast-msg">${msg}</div>
      </div>
    </div>`);
  root().appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(20px)';
    setTimeout(() => node.remove(), 300);
  }, duracion);
}
