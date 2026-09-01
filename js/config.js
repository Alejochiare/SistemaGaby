/* ============================================================
   CONFIG — constantes del dominio + catálogo de iconos
   ============================================================ */

/* Tipos de cliente (pueden tener varios) */
export const TIPOS_CLIENTE = [
  { id: 'comprador',   label: 'Comprador' },
  { id: 'inquilino',   label: 'Inquilino' },
  { id: 'propietario', label: 'Propietario' },
];

/* Tipos de propiedad */
export const TIPOS_PROPIEDAD = ['Departamento','Casa','PH','Local comercial','Terreno','Oficina','Cochera','Campo','Hotel'];

/* Tipos de operación */
export const TIPOS_OPERACION = ['Alquiler','Venta','Alquiler temporario'];

/* Monedas */
export const MONEDAS = ['ARS','USD'];

/* Ajuste de alquiler */
export const TIPOS_AJUSTE = [
  { id: 'ICL',  label: 'ICL (Índice Casa Propia)' },
  { id: 'IPC',  label: 'IPC (Inflación)' },
  { id: 'fijo', label: 'Porcentaje fijo' },
  { id: 'otro', label: 'Otro' },
];
export const FRECUENCIAS_AJUSTE = [
  { id: 3,  label: 'Trimestral (cada 3 meses)' },
  { id: 4,  label: 'Cuatrimestral (cada 4 meses)' },
  { id: 6,  label: 'Semestral (cada 6 meses)' },
  { id: 12, label: 'Anual' },
];

/* Estados de propiedad */
export const PROP_ESTADOS = [
  { id: 'disponible', label: 'Disponible', badge: 'badge-success' },
  { id: 'alquilada',  label: 'Alquilada',  badge: 'badge-info' },
  { id: 'vendida',    label: 'Vendida',    badge: 'badge-neutral' },
  { id: 'reservada',  label: 'Reservada',  badge: 'badge-warning' },
];

/* Estados de contrato de alquiler */
export const CONTRATO_ESTADOS = [
  { id: 'activo',      label: 'Activo',      badge: 'badge-success' },
  { id: 'por_vencer',  label: 'Por vencer',  badge: 'badge-warning' },
  { id: 'vencido',     label: 'Vencido',     badge: 'badge-danger' },
  { id: 'rescindido',  label: 'Rescindido',  badge: 'badge-neutral' },
  { id: 'renovado',    label: 'Renovado',    badge: 'badge-info' },
];

/* Estados de venta */
export const VENTA_ESTADOS = [
  { id: 'en_curso',    label: 'En curso',    badge: 'badge-info' },
  { id: 'reservada',   label: 'Reservada',   badge: 'badge-warning' },
  { id: 'escriturada', label: 'Escriturada', badge: 'badge-success' },
  { id: 'caida',       label: 'Caída',       badge: 'badge-neutral' },
];

/* Orígenes de consulta */
export const ORIGENES = ['WhatsApp','Llamada','Referido','Instagram','Facebook','Portal Web','Zonaprop','MercadoLibre','Cartel','Otro'];

/* Tipos de evento en agenda */
export const TIPOS_EVENTO = [
  { id: 'visita',      label: 'Visita' },
  { id: 'llamada',     label: 'Llamada' },
  { id: 'reunion',     label: 'Reunión' },
  { id: 'cobro',       label: 'Cobro' },
  { id: 'vencimiento', label: 'Vencimiento' },
  { id: 'otro',        label: 'Otro' },
];

/* ============================================================
   VENTAS · Comercialización de propiedades marcadas para vender
   (la propiedad en sí se carga desde "Propiedades"; esto es
   vocabulario auxiliar para el circuito de venta)
   ============================================================ */
export const EXCLUSIVIDAD_VENTA = [
  { id: 'exclusiva',  label: 'Exclusiva' },
  { id: 'compartida', label: 'Compartida con otra inmobiliaria' },
];

export const PLAZOS_COMERCIALIZACION = [
  { id: '90',  label: '90 días' },
  { id: '180', label: '180 días' },
  { id: '365', label: '1 año' },
  { id: 'personalizado', label: 'Personalizado' },
];

export const TIPOS_DOCUMENTO_VENTA = [
  'Escritura', 'Plano', 'Matrícula', 'DNI propietario',
  'Informe de Catastro', 'Impuesto provincial', 'Impuesto municipal',
  'Informe de inhibición', 'Otros',
];

/* Peso de cada documento dentro de los 20 puntos de "Documentación completa" del
   índice de vendibilidad — los más determinantes para poder escriturar pesan más.
   Suman 20 entre todos ("Otros" no aporta puntos, es un documento sin definir). */
export const PESOS_DOCUMENTO_VENTA = {
  'Escritura':               4,
  'Informe de inhibición':   3.5,
  'Matrícula':                3,
  'Plano':                   2.5,
  'Informe de Catastro':     2.5,
  'DNI propietario':         1.5,
  'Impuesto provincial':     1.5,
  'Impuesto municipal':      1.5,
};

export const ESTADOS_DOCUMENTO = [
  { id: 'completo',  label: 'Completo',  simbolo: '✅', badge: 'badge-success' },
  { id: 'pendiente', label: 'Pendiente', simbolo: '⚠️', badge: 'badge-warning' },
  { id: 'faltante',  label: 'Faltante',  simbolo: '❌', badge: 'badge-danger' },
];

export const CANALES_COMERCIALIZACION = [
  'Publicado en sitio web', 'Facebook', 'Instagram', 'Marketplace', 'Cartel colocado',
  'Fotos profesionales', 'Videos', 'Drone', 'Reel', 'Publicidad Meta Ads',
];

export const ORIGENES_INTERESADO = ['Facebook', 'Instagram', 'Página web', 'Marketplace', 'Referido', 'Cartel', 'Otro'];

export const TIPOS_CONTACTO_INTERESADO = [
  { id: 'consulta',     label: 'Consulta' },
  { id: 'llamada',      label: 'Llamada telefónica' },
  { id: 'whatsapp',     label: 'WhatsApp' },
  { id: 'visita',       label: 'Visitó el inmueble' },
  { id: 'oferta',       label: 'Realizó una oferta' },
  { id: 'contraoferta', label: 'Contraoferta' },
  { id: 'otro',         label: 'Otro' },
];

export const FRECUENCIAS_RECORDATORIO = [
  { id: '30', label: 'Cada 30 días' },
  { id: '40', label: 'Cada 40 días' },
  { id: '50', label: 'Cada 50 días' },
  { id: 'personalizado', label: 'Personalizado' },
];

export const FRECUENCIAS_INFORME = [
  { id: '30', label: 'Cada 30 días' },
  { id: '45', label: 'Cada 45 días' },
  { id: '60', label: 'Cada 60 días' },
];

/* Días de alerta antes de vencimiento de contrato */
export const ALERTA_VENCIMIENTO_DIAS = 60;

/* Días de anticipación antes de que corresponda el próximo ajuste de alquiler,
   para que ya empiece a figurar como "por aumentar" (con cuenta regresiva). */
export const ALERTA_AJUSTE_DIAS = 10;

/* Día límite de pago del alquiler; desde el día siguiente corre la mora */
export const DIA_LIMITE_PAGO = 10;

/* Navegación del sidebar */
export const NAV = [
  { section: 'Principal' },
  { id: 'inicio',        label: 'Inicio',                icon: 'grid' },
  { id: 'clientes',      label: 'Inquilinos',   icon: 'users' },
  { id: 'propiedades',   label: 'Propiedades',             icon: 'home' },
  { section: 'Operaciones' },
  { id: 'alquileres',   label: 'Alquileres',       icon: 'key',    badgeKey: 'cobrosVencidos', danger: true },
  { id: 'recibos',       label: 'Generador de recibo', icon: 'file' },
];

/* Catálogo de iconos SVG */
export const ICONS = {
  grid:     '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  users:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  home:     '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  key:      '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  dollar:   '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail:     '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message:  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  pin:      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  plus:     '<path d="M5 12h14M12 5v14"/>',
  x:        '<path d="M18 6 6 18M6 6l12 12"/>',
  edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash:    '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check:    '<path d="M20 6 9 17l-5-5"/>',
  alert:    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock:    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  whatsapp: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9z"/><path d="M9 10a5 5 0 0 0 5 5l1.5-1.5-2-1-1 1a3 3 0 0 1-2-2l1-1-1-2z"/>',
  copy:     '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:     '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  inbox:    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  shield:   '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  trending: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  star:     '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  file:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  link:     '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  refresh:   '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  wallet:    '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/>',
  building:  '<rect x="3" y="2" width="18" height="20" rx="1"/><path d="M9 22V12h6v10M8 7h2M8 11h2M14 7h2M14 11h2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
