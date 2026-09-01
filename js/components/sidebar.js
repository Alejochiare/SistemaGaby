/* ============================================================
   COMPONENT · Sidebar — navegación + badges en vivo
   ============================================================ */
import { NAV, icon } from '../config.js';
import { sel, subscribe } from '../store.js';

export function initSidebar() {
  const nav = document.getElementById('nav');

  const render = () => {
    const kpis = sel.kpis();
    nav.innerHTML = NAV.map(item => {
      if (item.section) return `<div class="nav-section">${item.section}</div>`;
      const badgeVal = item.badgeKey ? kpis[item.badgeKey] : 0;
      const badge = badgeVal ? `<span class="nav-badge ${item.danger ? 'danger' : ''}">${badgeVal}</span>` : '';
      return `
        <a href="#/${item.id}" class="nav-item" data-route="${item.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${icon(item.icon).match(/<svg[^>]*>(.*)<\/svg>/s)?.[1] || ''}</svg>
          <span>${item.label}</span>
          ${badge}
        </a>`;
    }).join('');
    marcarActivo();
  };

  const marcarActivo = () => {
    const ruta = (location.hash.replace('#/', '').split('/')[0]) || 'inicio';
    nav.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.route === ruta);
    });
  };

  render();
  subscribe(render);
  window.addEventListener('hashchange', marcarActivo);
}
