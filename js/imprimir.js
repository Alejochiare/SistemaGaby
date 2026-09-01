/* ============================================================
   IMPRIMIR — Generación de Recibos y Liquidaciones
   ============================================================ */

const KEY_AGENCIA  = 'inmocrm_agencia';
const KEY_NUM_REC  = 'inmocrm_num_recibo';
const KEY_NUM_LIQ  = 'inmocrm_num_liquidacion';
const KEY_NUM_DEUDA = 'inmocrm_num_deuda';
const KEY_NUM_INFORME_VENTA = 'inmocrm_num_informe_captacion';
const KEY_NUM_CONTRATO = 'inmocrm_num_contrato';

/* ── Agencia config ──────────────────────────────────────── */
export function getAgencia() {
  try { return JSON.parse(localStorage.getItem(KEY_AGENCIA) || '{}'); } catch { return {}; }
}
export function setAgencia(data) {
  localStorage.setItem(KEY_AGENCIA, JSON.stringify(data));
}

/* ── Numeración correlativa ──────────────────────────────── */
function nextNum(key) {
  const n = (parseInt(localStorage.getItem(key) || '0', 10)) + 1;
  localStorage.setItem(key, String(n));
  return String(n).padStart(8, '0');
}
function fmtDocNum(num) { return `0001-${num}`; }

/* ── Helpers ─────────────────────────────────────────────── */
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fmtMoneda(n, moneda = 'ARS') {
  if (n == null) return '—';
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  return simbolo + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

function fmtFecha(d) {
  if (!d) return '—';
  const [y, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${y}`;
}

function mesLabel(mes) {
  if (!mes) return '—';
  const [y, m] = mes.split('-');
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${nombres[+m - 1]} de ${y}`;
}

/** Convierte número a texto en pesos o dólares (simplificado, cubre hasta millones) */
function enLetras(n, unidad = 'pesos') {
  if (!n) return `Cero ${unidad}`;
  const entero = Math.floor(n);
  const cents  = Math.round((n - entero) * 100);

  const unidades = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
  const decenas  = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

  function grupo(num) {
    if (num === 0) return '';
    if (num === 100) return 'cien';
    let res = '';
    const c = Math.floor(num / 100);
    const r = num % 100;
    if (c) res += centenas[c] + (r ? ' ' : '');
    if (r < 20) { res += unidades[r]; }
    else {
      const d = Math.floor(r / 10), u = r % 10;
      res += decenas[d] + (u ? ' y ' + unidades[u] : '');
    }
    return res;
  }

  function convertir(num) {
    if (num === 0) return 'cero';
    let res = '';
    const mill = Math.floor(num / 1_000_000);
    const miles = Math.floor((num % 1_000_000) / 1000);
    const resto = num % 1000;
    if (mill) res += (mill === 1 ? 'un millón' : grupo(mill) + ' millones') + ' ';
    if (miles) res += (miles === 1 ? 'mil' : grupo(miles) + ' mil') + ' ';
    if (resto) res += grupo(resto);
    return res.trim();
  }

  const pesos = convertir(entero);
  const txt   = pesos.charAt(0).toUpperCase() + pesos.slice(1) + ' ' + unidad;
  return cents ? txt + ` con ${cents}/100` : txt;
}

/** Calcula pago Nº X de Y total del contrato */
function numPago(alq, mes) {
  if (!alq.fechaInicio || !alq.fechaFin) return null;
  const ini = new Date(alq.fechaInicio.slice(0, 10) + 'T00:00:00');
  const fin = new Date(alq.fechaFin.slice(0, 10) + 'T00:00:00');
  const [y, m] = mes.split('-').map(Number);
  const cur = new Date(y, m - 1, 1);
  const total = (fin.getFullYear() - ini.getFullYear()) * 12 + (fin.getMonth() - ini.getMonth()) + 1;
  const actual = (y - ini.getFullYear()) * 12 + (m - 1 - ini.getMonth()) + 1;
  return { actual: Math.max(1, actual), total };
}

/* Prefija cada selector de un bloque de CSS con un ancestro (ej. "#id") — se usa para poder
   inyectar temporalmente el CSS de impresión en el documento principal de la app sin que
   ninguna regla "se escape" y afecte por accidente algo fuera de ese contenedor. No soporta
   @media/@page (CSS_PRINT_REST no los usa). */
function scopeCss(css, scope) {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return sinComentarios.replace(/([^{}]+)\{/g, (m, selectores) =>
    selectores.split(',').map(s => `${scope} ${s.trim()}`).join(', ') + ' {');
}

/* ── CSS compartido para impresión ──────────────────────── */
/* El reset (*, body) va separado del resto porque para exportar a PDF/WhatsApp lo inyectamos
   directo en el documento principal (ver generarPDFBlobDesdeHTML) — un iframe aparte resultó
   poco confiable para que html2canvas lea el <style>, así que ahí el reset se aplica scoped
   a un contenedor propio en vez de a "*"/"body" globales, para no romper el resto de la app. */
const CSS_PRINT_REST = `
  .pagina { width: 210mm; margin: 0 auto; padding: 8mm; }
  .copia { border: 1px solid #999; border-radius: 2px; padding: 12px 16px; margin-bottom: 8px; }
  .separador { text-align: center; font-size: 11.5px; color: #aaa; margin: 6px 0; letter-spacing: 3px; }

  /* Header — con display:table en vez de flex: html2canvas (usado para exportar a PDF y
     mandar por WhatsApp) no soporta bien flexbox/grid y los renderiza como texto plano sin
     ningún layout, así que todo este bloque usa table/float/inline-block, que sí soporta. */
  .doc-header { display: table; width: 100%; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #111; }
  .doc-header > * { display: table-cell; vertical-align: top; }
  .doc-logo { height: 46px; width: auto; max-width: 160px; object-fit: contain; display: block; margin-bottom: 3px; }
  .agencia-logo { font-size: 23px; font-weight: 900; color: #111; letter-spacing: -0.5px; line-height: 1.1; }
  .agencia-logo-sub2 { font-size: 12px; font-weight: 700; color: #333; margin-top: 1px; }
  .agencia-sub  { font-size: 10.5px; color: #666; margin-top: 2px; }
  .agencia-info { font-size: 10.5px; color: #666; line-height: 1.5; margin-top: 4px; }

  .doc-tipo-bloque { display: table-cell; vertical-align: top; text-align: right; width: 170px; }
  .doc-tipo  { font-size: 25px; font-weight: 900; letter-spacing: 2px; color: #111; }
  .doc-num   { font-size: 15px; font-weight: 700; margin-top: 3px; }
  .doc-fecha { font-size: 11.5px; color: #444; margin-top: 2px; }
  .doc-cuit  { font-size: 10.5px; color: #666; margin-top: 2px; }

  /* Sello discreto */
  .sello { border: 1px solid #bbb; border-radius: 2px; padding: 3px 7px; text-align: center; margin: 0 18px; white-space: nowrap; }
  .sello-txt { font-size: 7.5px; color: #888; text-align: center; line-height: 1.5; letter-spacing: .2px; }

  /* Banda de concepto */
  .banda-concepto { background: #f4f4f4; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 4px 8px; font-size: 10.5px; font-weight: 700; color: #333; margin: 8px 0; letter-spacing: .5px; }

  /* Datos cliente — columnas por flotado en vez de grid */
  .cliente-blk { margin: 8px 0; font-size: 11.5px; overflow: hidden; }
  .dato-fld, .cliente-col { float: left; width: 50%; box-sizing: border-box; padding-right: 10px; margin-bottom: 4px; }
  .lbl, .label-fld { color: #777; font-size: 10.5px; white-space: nowrap; margin-right: 3px; }

  /* Bloque contrato */
  .contrato-blk { border: 1px solid #ccc; padding: 6px 10px; margin: 8px 0; font-size: 11.5px; overflow: hidden; }
  .contrato-titulo { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; margin-bottom: 5px; color: #333; }
  .contrato-grid { overflow: hidden; }
  .contrato-row  { float: left; width: 50%; box-sizing: border-box; padding-right: 10px; margin-bottom: 3px; }

  /* Tabla detalle */
  .tabla { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11.5px; }
  .tabla th { background: #ebebeb; border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
  .tabla td { border: 1px solid #ddd; padding: 5px 8px; }
  .tabla .right { text-align: right; font-weight: 700; }

  /* Totales */
  .totales { margin: 6px 0 5px; overflow: hidden; }
  .total-row { text-align: right; font-size: 11.5px; padding: 2px 0; overflow: hidden; }
  .total-row.grand { font-size: 15px; font-weight: 900; border-top: 2px solid #111; padding-top: 5px; margin-top: 3px; }
  .total-label { display: inline-block; vertical-align: top; min-width: 140px; text-align: right; }
  .total-val   { display: inline-block; vertical-align: top; min-width: 100px; text-align: right; margin-left: 24px; }

  /* Letras + forma pago */
  .letras-blk { display: table; width: 100%; font-size: 11px; margin: 6px 0 4px; padding: 5px 8px; background: #f9f9f9; border: 1px solid #e8e8e8; border-radius: 2px; }
  .letras-blk > div { display: table-cell; vertical-align: top; }

  /* Firma */
  .firma-blk { display: table; width: 100%; margin-top: 10px; padding-top: 6px; border-top: 1px solid #ccc; }
  .firma-blk > * { display: table-cell; vertical-align: bottom; }
  .firma-linea { border-top: 1px solid #555; width: 170px; text-align: center; padding-top: 3px; font-size: 10.5px; color: #444; }
  .copia-label { font-size: 10.5px; font-weight: 700; color: #555; text-align: right; }
`;

/* Versión completa (con reset global) para la ventana de impresión, que vive en su propio
   documento/pestaña y no tiene riesgo de afectar el resto de la app. */
const CSS_PRINT = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12.5px; color: #111; background: #fff; }
  ${CSS_PRINT_REST}
  @media print {
    body { margin: 0; }
    .pagina { padding: 9mm; }
    .no-print { display: none; }
    /* margin:0 en @page evita que el navegador dibuje su propio encabezado/pie
       (URL, fecha, "página 1 de 1") — ese espacio ya no existe para que los dibuje.
       El margen visual del documento lo sigue dando el padding de .pagina de arriba. */
    @page { margin: 0; size: A4; }
  }
`;

/* Versión con TODAS las reglas prefijadas con #pdfExportRoot (en vez de "*"/"body"/".clase"
   globales) — para inyectar temporalmente en el documento principal de la app (ver
   generarPDFBlobDesdeHTML) sin que nada se filtre y afecte al resto de la UI mientras se
   genera el PDF. */
const CSS_PRINT_SCOPED = `
  #pdfExportRoot, #pdfExportRoot * { box-sizing: border-box; margin: 0; padding: 0; }
  #pdfExportRoot { font-family: Arial, sans-serif; font-size: 12.5px; color: #111; background: #fff; }
  ${scopeCss(CSS_PRINT_REST, '#pdfExportRoot')}
`;

/* ── Abrir ventana de impresión ──────────────────────────── */
function abrirVentana(titulo, cuerpo) {
  const win = window.open('', '_blank', 'width=850,height=700');
  if (!win) {
    alert('El navegador bloqueó la ventana del documento. Permití las ventanas emergentes para este sitio y volvé a intentar.');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <base href="${location.href}">
  <title>${titulo}</title>
  <style>${CSS_PRINT}</style>
</head>
<body>
<div class="pagina">
  <div class="no-print" style="text-align:center;padding:8px;background:#1a5276;color:#fff;margin-bottom:10px;cursor:pointer;font-size:13px;border-radius:4px"
    onclick="window.print()">🖨 Imprimir / Guardar PDF</div>
  ${cuerpo}
</div>
</body>
</html>`);
  win.document.close();
}

/* ── Header común del documento ──────────────────────────── */
function headerDoc(ag, tipo, num, fecha) {
  const nombre = ag.nombre || 'Gaby';
  const cuit   = ag.cuit   || '';
  const dir    = [ag.direccion, ag.localidad].filter(Boolean).join(' | ');
  const tel    = ag.telefono || '';
  // Nombre en dos líneas si tiene más de una palabra (ej. "Gaby Propiedades" ->
  // "Gaby" grande + "Propiedades" como bajada) — si es una sola palabra, queda igual.
  const espacio = nombre.indexOf(' ');
  const nombreLinea1 = espacio === -1 ? nombre : nombre.slice(0, espacio);
  const nombreLinea2 = espacio === -1 ? '' : nombre.slice(espacio + 1);

  return `
  <div class="doc-header">
    <div>
      <div class="agencia-logo">${esc(nombreLinea1)}</div>
      ${nombreLinea2 ? `<div class="agencia-logo-sub2">${esc(nombreLinea2)}</div>` : ''}
      <div class="agencia-info" style="margin-top:4px">
        ${dir ? esc(dir) + '<br>' : ''}
        ${tel ? 'Tel: ' + esc(tel) : ''}
      </div>
    </div>

    <div class="sello">
      <span class="sello-txt">DOCUMENTO<br>NO VÁLIDO<br>COMO FACTURA</span>
    </div>

    <div class="doc-tipo-bloque">
      <div class="doc-tipo">${tipo}</div>
      <div class="doc-num">${num}</div>
      <div class="doc-fecha">${fmtFecha(fecha)}</div>
      ${cuit ? `<div class="doc-cuit">C.U.I.T.: ${esc(cuit)}</div>` : ''}
      ${ag.inicioActividades ? `<div class="doc-cuit">Inicio act.: ${fmtFecha(ag.inicioActividades)}</div>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   RECIBO DE PAGO (inquilino → inmobiliaria)
   ============================================================ */
function construirReciboHTML({ alq, cobro, inquilino, propiedad, propietario }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_REC));
  const fecha = cobro.fechaPago || new Date().toISOString().slice(0, 10);
  const monto = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const montoMora = cobro.montoMora || 0;
  const montoAlquiler = cobro.montoAlquiler ?? (monto - montoMora);
  const pago  = cobro.mes ? numPago(alq, cobro.mes) : null;
  const pagos = (cobro.pagos && cobro.pagos.length) ? cobro.pagos : null;
  const saldoPendiente = Number(cobro.saldoPendiente) || 0;
  const esPagoParcial  = saldoPendiente > 0;
  const completaParcial = !!cobro.completaParcial;
  const montoCorresponde = esPagoParcial ? Number(cobro.montoEsperado) || (montoAlquiler + saldoPendiente) : montoAlquiler;

  const dniInq = alq.inquilinoDni || inquilino?.dni || '';
  const telInq = alq.inquilinoTelefono || inquilino?.telefono || '';
  const domInq = alq.inquilinoDomicilio || inquilino?.domicilio || inquilino?.direccion || '';

  const copia = (tipoCop) => `
  <div class="copia">
    ${headerDoc(ag, 'RECIBO', num, fecha)}

    <div class="banda-concepto">
      COBRO POR CUENTA Y ORDEN DE TERCEROS — IMPORTE A ENTREGAR AL PROPIETARIO O QUIEN CORRESPONDA
    </div>

    <!-- Datos del inquilino -->
    <div class="cliente-blk">
      <div class="dato-fld"><span class="lbl">Sr./Sra.:</span> <strong>${esc(inquilino?.nombre || '—')}</strong></div>
      ${dniInq ? `<div class="dato-fld"><span class="lbl">DNI:</span> <strong>${esc(dniInq)}</strong></div>` : '<div class="dato-fld"></div>'}
      ${domInq ? `<div class="dato-fld" style="width:100%"><span class="lbl">Domicilio:</span> ${esc(domInq)}</div>` : ''}
      ${telInq ? `<div class="dato-fld"><span class="lbl">Teléfono:</span> ${esc(telInq)}</div>` : ''}
      <div class="dato-fld"><span class="lbl">Condición IVA:</span> Consumidor Final</div>
    </div>

    <!-- Datos del contrato -->
    <div class="contrato-blk">
      <div class="contrato-titulo">Detalle del contrato</div>
      <div class="contrato-grid">
        <div class="contrato-row"><span class="lbl">Concepto:</span> <strong>ALQUILER</strong></div>
        ${pago ? `<div class="contrato-row"><span class="lbl">Cuota N°:</span> <strong>${pago.actual} de ${pago.total}</strong></div>` : '<div class="contrato-row"></div>'}
        <div class="contrato-row" style="width:100%"><span class="lbl">Inmueble:</span> <strong>${esc(propiedad?.direccion || '—')}${propiedad?.ciudad ? ' — ' + esc(propiedad.ciudad) : ''}</strong></div>
        <div class="contrato-row"><span class="lbl">Período:</span> <strong>${cobro.mes ? mesLabel(cobro.mes) : '—'}</strong></div>
        <div class="contrato-row"><span class="lbl">Propietario:</span> ${esc(propietario?.nombre || '—')}</div>
        <div class="contrato-row"><span class="lbl">Inicio contrato:</span> ${fmtFecha(alq.fechaInicio)}</div>
        <div class="contrato-row"><span class="lbl">Fin contrato:</span> ${fmtFecha(alq.fechaFin)}</div>
      </div>
    </div>

    ${esPagoParcial ? `
    <div style="padding:6px 10px;border-radius:4px;background:#fef3e2;border:1px solid #d97706;margin-bottom:10px;font-size:11px;color:#7c4a03">
      ⚠ <strong>PAGO PARCIAL</strong> — este recibo cubre parte del alquiler del período. Queda un saldo pendiente.
    </div>` : ''}
    ${completaParcial ? `
    <div style="padding:6px 10px;border-radius:4px;background:#e8f5e9;border:1px solid #2e7d32;margin-bottom:10px;font-size:11px;color:#1b5e20">
      ✓ <strong>PAGO COMPLETADO</strong> — con este pago se saldó el mes que tenía un saldo pendiente de un abono anterior.
    </div>` : ''}

    <!-- Tabla importe -->
    <table class="tabla">
      <thead><tr>
        <th>Descripción</th>
        <th>Inmueble</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
      <tr>
        <td>Alquiler mensual${esPagoParcial ? ' (corresponde)' : ''}</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right">${fmtMoneda(montoCorresponde)}</td>
      </tr>
      ${esPagoParcial ? `
      <tr>
        <td>Pagado en este recibo</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right">${fmtMoneda(montoAlquiler)}</td>
      </tr>
      <tr>
        <td>Saldo pendiente (debe)</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right" style="color:#dc2626;font-weight:700">${fmtMoneda(saldoPendiente)}</td>
      </tr>` : ''}
      ${montoMora > 0 ? `
      <tr>
        <td>Recargo por mora (${cobro.pctMoraAplicado}% x ${cobro.diasMora} día${cobro.diasMora === 1 ? '' : 's'})</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right">${fmtMoneda(montoMora)}</td>
      </tr>` : ''}
      ${(cobro.itemsExtra || []).map(it => {
        const esDescuento = it.tipo === 'descuento';
        return `
      <tr>
        <td>${esc(it.concepto)}${esDescuento ? ' (descuento)' : ''}</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right"${esDescuento ? ' style="color:#dc2626"' : ''}>${esDescuento ? '-' : ''}${fmtMoneda(it.monto)}</td>
      </tr>`;
      }).join('')}
      </tbody>
    </table>

    <div class="totales">
      <div class="total-row grand">
        <div class="total-label">TOTAL RECIBIDO:</div>
        <div class="total-val">${fmtMoneda(monto)}</div>
      </div>
      ${esPagoParcial ? `
      <div class="total-row" style="color:#dc2626;font-weight:700">
        <div class="total-label">SALDO PENDIENTE:</div>
        <div class="total-val">${fmtMoneda(saldoPendiente)}</div>
      </div>` : ''}
    </div>

    <!-- Letras y forma de pago -->
    <div class="letras-blk">
      <div>
        <div><span class="lbl">Son pesos:</span> <strong>${enLetras(monto)}</strong></div>
        ${cobro.nota ? `<div style="margin-top:2px"><span class="lbl">Observaciones:</span> ${esc(cobro.nota)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:12px">
        ${pagos && pagos.length > 1 ? `
        <div><span class="lbl">Forma de pago:</span></div>
        ${pagos.map(p => `
        <div style="margin-top:2px">
          <strong>${esc(p.metodoPago)}:</strong> ${fmtMoneda(p.monto)}
          ${p.referencia ? ` <span class="lbl">(${esc(p.referencia)})</span>` : ''}
        </div>`).join('')}
        ` : `
        <div><span class="lbl">Forma de pago:</span> <strong>${esc((pagos && pagos[0]?.metodoPago) || cobro.metodoPago || 'Efectivo')}</strong></div>
        ${(pagos && pagos[0]?.referencia) || cobro.referencia ? `<div style="margin-top:2px"><span class="lbl">Ref.:</span> ${esc((pagos && pagos[0]?.referencia) || cobro.referencia)}</div>` : ''}
        `}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">— ${tipoCop} —</div>
    </div>
  </div>`;

  return `
    ${copia('ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia('DUPLICADO')}
  `;
}

export function imprimirRecibo(params) {
  abrirVentana('Recibo de Pago', construirReciboHTML(params));
}

export function generarPDFRecibo(params, filename = 'recibo.pdf') {
  return generarPDFBlobDesdeHTML(construirReciboHTML(params), filename);
}

/* ============================================================
   RECIBO DE ADELANTO (inquilino paga varios meses juntos de una vez)
   Un solo recibo que detalla, mes por mes, todas las cuotas cubiertas.
   ============================================================ */
function construirReciboAdelantoHTML({ alq, cobros, inquilino, propiedad, propietario }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_REC));
  const lista = [...cobros].sort((a, b) => (a.mes || '').localeCompare(b.mes || ''));
  const fecha = lista[0]?.fechaPago || new Date().toISOString().slice(0, 10);
  const total = lista.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const primerPago = alq.fechaInicio && alq.fechaFin && lista[0]?.mes ? numPago(alq, lista[0].mes) : null;
  const ultimoPago  = alq.fechaInicio && alq.fechaFin && lista.at(-1)?.mes ? numPago(alq, lista.at(-1).mes) : null;
  const notaComun = lista.find(c => c.nota)?.nota || null;
  const metodoComun = lista[0]?.metodoPago || 'Efectivo';
  const referenciaComun = lista[0]?.referencia || null;

  const dniInq = alq.inquilinoDni || inquilino?.dni || '';
  const telInq = alq.inquilinoTelefono || inquilino?.telefono || '';
  const domInq = alq.inquilinoDomicilio || inquilino?.domicilio || inquilino?.direccion || '';

  const copia = (tipoCop) => `
  <div class="copia">
    ${headerDoc(ag, 'RECIBO', num, fecha)}

    <div class="banda-concepto">
      ADELANTO DE ALQUILER — ${lista.length} MESES — COBRO POR CUENTA Y ORDEN DE TERCEROS
    </div>

    <!-- Datos del inquilino -->
    <div class="cliente-blk">
      <div class="dato-fld"><span class="lbl">Sr.\Sra.:</span> <strong>${esc(inquilino?.nombre || '—')}</strong></div>
      ${dniInq ? `<div class="dato-fld"><span class="lbl">DNI:</span> <strong>${esc(dniInq)}</strong></div>` : '<div class="dato-fld"></div>'}
      ${domInq ? `<div class="dato-fld" style="width:100%"><span class="lbl">Domicilio:</span> ${esc(domInq)}</div>` : ''}
      ${telInq ? `<div class="dato-fld"><span class="lbl">Teléfono:</span> ${esc(telInq)}</div>` : ''}
      <div class="dato-fld"><span class="lbl">Condición IVA:</span> Consumidor Final</div>
    </div>

    <!-- Datos del contrato -->
    <div class="contrato-blk">
      <div class="contrato-titulo">Detalle del contrato</div>
      <div class="contrato-grid">
        <div class="contrato-row"><span class="lbl">Concepto:</span> <strong>ADELANTO DE ALQUILER</strong></div>
        ${primerPago ? `<div class="contrato-row"><span class="lbl">Cuotas N°:</span> <strong>${primerPago.actual} a ${ultimoPago?.actual ?? primerPago.actual} de ${primerPago.total}</strong></div>` : '<div class="contrato-row"></div>'}
        <div class="contrato-row" style="width:100%"><span class="lbl">Inmueble:</span> <strong>${esc(propiedad?.direccion || '—')}${propiedad?.ciudad ? ' — ' + esc(propiedad.ciudad) : ''}</strong></div>
        <div class="contrato-row"><span class="lbl">Período cubierto:</span> <strong>${mesLabel(lista[0]?.mes)} a ${mesLabel(lista.at(-1)?.mes)}</strong></div>
        <div class="contrato-row"><span class="lbl">Propietario:</span> ${esc(propietario?.nombre || '—')}</div>
      </div>
    </div>

    <!-- Tabla importe: una fila por mes cubierto -->
    <table class="tabla">
      <thead><tr>
        <th>Descripción</th>
        <th>Inmueble</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
      ${lista.map(c => `
      <tr>
        <td>Alquiler mensual — ${mesLabel(c.mes)}</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right">${fmtMoneda(c.monto)}</td>
      </tr>`).join('')}
      </tbody>
    </table>

    <div class="totales">
      <div class="total-row grand">
        <div class="total-label">TOTAL RECIBIDO:</div>
        <div class="total-val">${fmtMoneda(total)}</div>
      </div>
    </div>

    <!-- Letras y forma de pago -->
    <div class="letras-blk">
      <div>
        <div><span class="lbl">Son pesos:</span> <strong>${enLetras(total)}</strong></div>
        ${notaComun ? `<div style="margin-top:2px"><span class="lbl">Observaciones:</span> ${esc(notaComun)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:12px">
        <div><span class="lbl">Forma de pago:</span> <strong>${esc(metodoComun)}</strong></div>
        ${referenciaComun ? `<div style="margin-top:2px"><span class="lbl">Ref.:</span> ${esc(referenciaComun)}</div>` : ''}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">— ${tipoCop} —</div>
    </div>
  </div>`;

  return `
    ${copia('ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia('DUPLICADO')}
  `;
}

export function imprimirReciboAdelanto(params) {
  abrirVentana('Recibo de Adelanto', construirReciboAdelantoHTML(params));
}

export function generarPDFReciboAdelanto(params, filename = 'recibo-adelanto.pdf') {
  return generarPDFBlobDesdeHTML(construirReciboAdelantoHTML(params), filename);
}

/* ============================================================
   CONSTANCIA DE ENTREGA DE EJEMPLAR DEL CONTRATO — no es una copia
   del contrato en sí, es un recibo/constancia que deja asentado que
   tal persona recibió tal día un ejemplar, con un resumen de las
   condiciones (precio, ajuste, vencimiento) y un renglón para que
   lo firme quien lo recibe. Un "copia" firmable por destinatario.
   ============================================================ */
function construirEntregaContratoHTML({ alq, inquilino, propiedad, propietario, destinatarios = [], fecha, nota }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_CONTRATO));
  const fechaDoc = fecha || new Date().toISOString().slice(0, 10);

  const fila = (label, val) => val ? `<div class="contrato-row"><span class="lbl">${esc(label)}:</span> <strong>${esc(String(val))}</strong></div>` : '';
  const dirLabel = propiedad ? `${propiedad.direccion || '—'}${propiedad.ciudad ? ', ' + propiedad.ciudad : ''}` : '—';

  const copia = (destinatario, tipoCop) => `
  <div class="copia">
    ${headerDoc(ag, 'RECIBO', num, fechaDoc)}

    <div class="banda-concepto">
      CONSTANCIA DE ENTREGA DE EJEMPLAR DEL CONTRATO — ${tipoCop}
    </div>

    <div class="cliente-blk">
      <div class="dato-fld" style="width:100%">
        Se deja constancia de que en el día de la fecha se hizo entrega a <strong>${esc(destinatario)}</strong>
        de un (1) ejemplar del contrato de locación correspondiente al inmueble sito en <strong>${esc(dirLabel)}</strong>,
        cuyas condiciones se detallan a continuación.
      </div>
    </div>

    <div class="contrato-blk">
      <div class="contrato-titulo">Condiciones del contrato</div>
      <div class="contrato-grid">
        ${fila('Locador', propietario?.nombre)}
        ${fila('Locatario', inquilino?.nombre)}
        ${fila('Inicio', fmtFecha(alq.fechaInicio))}
        ${fila('Vencimiento', fmtFecha(alq.fechaFin))}
        ${fila('Monto inicial', alq.montoInicial ? fmtMoneda(alq.montoInicial, alq.moneda) : null)}
        ${fila('Monto actual', alq.montoActual ? fmtMoneda(alq.montoActual, alq.moneda) : null)}
        ${fila('Depósito', alq.deposito ? fmtMoneda(alq.deposito, alq.moneda) : null)}
        ${fila('Ajuste', alq.tipoAjuste && alq.frecuenciaAjuste ? `${alq.tipoAjuste} · cada ${alq.frecuenciaAjuste} meses` : null)}
      </div>
    </div>

    ${nota ? `<div style="font-size:10px;margin-top:6px"><span class="lbl">Observaciones:</span> ${esc(nota)}</div>` : ''}

    <div class="firma-blk" style="justify-content:space-around;gap:12px;margin-top:22px">
      <div class="firma-linea">Firma de quien recibe<br>(${esc(destinatario)})</div>
      <div class="firma-linea">Firma<br>${esc(ag.nombre || 'Gaby')}</div>
    </div>
  </div>`;

  return destinatarios
    .map(d => `
    ${copia(d, 'ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia(d, 'DUPLICADO')}`)
    .join(`<div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>`);
}

export function imprimirEntregaContrato(params) {
  abrirVentana('Constancia de Entrega de Contrato', construirEntregaContratoHTML(params));
}

export function generarPDFEntregaContrato(params, filename = 'entrega-contrato.pdf') {
  return generarPDFBlobDesdeHTML(construirEntregaContratoHTML(params), filename);
}

/* ============================================================
   RECIBO GENERAL (cualquier persona, cualquier concepto)
   Para casos que no están atados a un contrato de alquiler: señas,
   comisiones, pagos a cuenta, etc. La persona puede ser una ya
   cargada en el sistema (cliente/propietario) o alguien nuevo.
   { persona: { nombre, dni, telefono, domicilio }, concepto, monto,
     moneda, fecha, formaPago, referencia, nota }
   ============================================================ */
function construirReciboGeneralHTML({ persona = {}, concepto, monto, moneda = 'ARS', fecha, formaPago = 'Efectivo', referencia = '', nota = '' }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_REC));
  const fechaDoc = fecha || new Date().toISOString().slice(0, 10);
  const unidad = moneda === 'USD' ? 'dólares' : 'pesos';

  const copia = (tipoCop) => `
  <div class="copia">
    ${headerDoc(ag, 'RECIBO', num, fechaDoc)}

    <div class="banda-concepto">
      ${esc((concepto || 'RECIBO DE PAGO').toUpperCase())}
    </div>

    <!-- Datos de la persona -->
    <div class="cliente-blk">
      <div class="dato-fld"><span class="lbl">Sr./Sra.:</span> <strong>${esc(persona.nombre || '—')}</strong></div>
      ${persona.dni ? `<div class="dato-fld"><span class="lbl">DNI:</span> <strong>${esc(persona.dni)}</strong></div>` : '<div class="dato-fld"></div>'}
      ${persona.domicilio ? `<div class="dato-fld" style="width:100%"><span class="lbl">Domicilio:</span> ${esc(persona.domicilio)}</div>` : ''}
      ${persona.telefono ? `<div class="dato-fld"><span class="lbl">Teléfono:</span> ${esc(persona.telefono)}</div>` : ''}
      <div class="dato-fld"><span class="lbl">Condición IVA:</span> Consumidor Final</div>
    </div>

    <!-- Tabla importe -->
    <table class="tabla">
      <thead><tr>
        <th>Concepto</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
      <tr>
        <td>${esc(concepto || '—')}</td>
        <td class="right">${fmtMoneda(monto, moneda)}</td>
      </tr>
      </tbody>
    </table>

    <div class="totales">
      <div class="total-row grand">
        <div class="total-label">TOTAL RECIBIDO:</div>
        <div class="total-val">${fmtMoneda(monto, moneda)}</div>
      </div>
    </div>

    <!-- Letras y forma de pago -->
    <div class="letras-blk">
      <div>
        <div><span class="lbl">Son ${unidad}:</span> <strong>${enLetras(monto, unidad)}</strong></div>
        ${nota ? `<div style="margin-top:2px"><span class="lbl">Observaciones:</span> ${esc(nota)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:12px">
        <div><span class="lbl">Forma de pago:</span> <strong>${esc(formaPago)}</strong></div>
        ${referencia ? `<div style="margin-top:2px"><span class="lbl">Ref.:</span> ${esc(referencia)}</div>` : ''}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">— ${tipoCop} —</div>
    </div>
  </div>`;

  return `
    ${copia('ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia('DUPLICADO')}
  `;
}

export function imprimirReciboGeneral(params) {
  abrirVentana('Recibo', construirReciboGeneralHTML(params));
}

export function generarPDFReciboGeneral(params, filename = 'recibo.pdf') {
  return generarPDFBlobDesdeHTML(construirReciboGeneralHTML(params), filename);
}

/* ============================================================
   LIQUIDACIÓN (inmobiliaria → propietario)
   Recibe datos ya calculados desde el modal previo.
   {
     alq, cobro, inquilino, propiedad, propietario,
     pctHonorarios,          // número
     descuentos: [{ monto, nota }],  // descuentos adicionales
     formaPago,
   }
   ============================================================ */
function construirLiquidacionHTML({ alq, cobro, inquilino, propiedad, propietario, propietarios = null,
                                      pctHonorarios = 0, descuentos = [], formaPago = 'Efectivo', pagos = [], porcentajeReparto = null, periodoLabel = null, detalle = null, montoOverride = null }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_LIQ));
  const fecha = cobro.fechaPago || new Date().toISOString().slice(0, 10);
  const tieneDetalle  = Array.isArray(detalle) && detalle.length > 0;
  const totalAlquiler = montoOverride
    ? montoOverride.totalAlquiler
    : tieneDetalle
      ? detalle.reduce((s, d) => s + (Number(d.monto) || 0), 0)
      : (cobro.monto || alq.montoActual || alq.montoInicial || 0);
  const esMultiPropietario = Array.isArray(propietarios) && propietarios.length > 0;
  const honorarios    = montoOverride
    ? montoOverride.honorarios
    : esMultiPropietario
      ? propietarios.reduce((s, p) => s + (Number(p.montoHonorarios) || 0), 0)
      : Math.round(totalAlquiler * pctHonorarios / 100);
  // Cargos suman, descuentos restan (las liquidaciones viejas solo tenían descuentos,
  // sin `tipo` — por eso el default es tratarlas como descuento).
  const ajusteTotal   = descuentos.reduce((s, d) => s + (d.tipo === 'cargo' ? 1 : -1) * (Number(d.monto) || 0), 0);
  const totalPagar    = montoOverride
    ? montoOverride.totalPagar
    : esMultiPropietario
      ? propietarios.reduce((s, p) => s + (Number(p.totalPagar) || 0), 0)
      : totalAlquiler - honorarios + ajusteTotal;
  const pago          = cobro.mes ? numPago(alq, cobro.mes) : null;
  const periodo        = periodoLabel || (cobro.mes ? mesLabel(cobro.mes)
                          : (tieneDetalle ? `${detalle.length} período${detalle.length > 1 ? 's' : ''}` : '—'));

  const copia = (tipoCopia) => `
  <div class="copia">
    ${headerDoc(ag, 'LIQUIDACIÓN', num, fecha)}

    <div class="banda-concepto">
      LIQUIDACIÓN A PROPIETARIO${esMultiPropietario ? 'S' : ''} — ${esc(periodo)}
    </div>

    ${esMultiPropietario ? `
    <div class="cliente-blk" style="display:block">
      <div style="font-weight:700;margin-bottom:4px">Propietarios — reparto de esta liquidación</div>
      <table class="tabla" style="margin:0 0 6px">
        <thead><tr>
          <th>Propietario</th>
          <th class="right">%</th>
          <th class="right">Bruto</th>
          <th class="right">Comisión</th>
          <th class="right">Total pagado</th>
        </tr></thead>
        <tbody>
          ${propietarios.map(p => `
          <tr>
            <td>${esc(p.nombre || '—')}</td>
            <td class="right">${p.porcentaje}%</td>
            <td class="right">${fmtMoneda(p.montoBruto)}</td>
            <td class="right">${p.montoHonorarios ? `− ${fmtMoneda(p.montoHonorarios)} (${p.pctHonorarios || 0}%)` : '—'}</td>
            <td class="right"><strong>${fmtMoneda(p.totalPagar)}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ` : `
    <div class="cliente-blk">
      <div class="cliente-col">
        <div><span class="label-fld">Cliente: </span><strong>${esc(propietario?.nombre || '—')}</strong></div>
        ${porcentajeReparto != null && porcentajeReparto < 100 ? `<div><span class="label-fld">Corresponde: </span>${porcentajeReparto}% de la propiedad</div>` : ''}
        <div><span class="label-fld">Dirección: </span>${esc(propietario?.direccion || propietario?.domicilio || '')}</div>
        <div><span class="label-fld">I.V.A.: </span>Consumidor Final</div>
      </div>
      <div class="cliente-col" style="text-align:right">
        ${propietario?.dni ? `<div><span class="label-fld">CUIT: </span>${esc(propietario.dni)}</div>` : ''}
        <div><span class="label-fld">Localidad: </span>${esc(ag.localidad || '')}</div>
      </div>
    </div>
    `}

    <table class="tabla">
      <thead><tr>
        <th>Inmueble</th>
        <th>Detalles</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
        ${tieneDetalle ? detalle.map(d => `
        <tr>
          <td>${esc(d.propiedad || propiedad?.direccion || '—')}</td>
          <td>${esc(d.periodo || '—')}</td>
          <td class="right">${fmtMoneda(d.monto, d.moneda)}</td>
        </tr>`).join('') : `
        <tr>
          <td>${esc(propiedad?.tipo || '')} ${esc(propiedad?.direccion || '—')}</td>
          <td>${periodo}${pago ? ` [pago ${pago.actual} / ${pago.total}]` : ''}</td>
          <td class="right"><strong>${fmtMoneda(totalAlquiler)}</strong></td>
        </tr>`}
      </tbody>
    </table>

    <div class="totales">
      <div class="total-row">
        <div class="total-label">Total Liquidación:</div>
        <div class="total-val">${fmtMoneda(totalAlquiler)}</div>
      </div>
      <div class="total-row">
        <div class="total-label">${esMultiPropietario ? 'Comisión total:' : `Honorarios (${pctHonorarios}%):`}</div>
        <div class="total-val">− ${fmtMoneda(honorarios)}</div>
      </div>
      ${descuentos.filter(d => d.monto).map(d => {
        const esCargo = d.tipo === 'cargo';
        return `
      <div class="total-row">
        <div class="total-label" style="font-size:10.5px">${esc(d.nota || d.concepto || (esCargo ? 'Cargo' : 'Descuento'))}:</div>
        <div class="total-val">${esCargo ? '+' : '−'} ${fmtMoneda(d.monto)}</div>
      </div>`;
      }).join('')}
      <div class="total-row grand">
        <div class="total-label">Total Pagado ${esMultiPropietario ? 'a los propietarios' : 'al propietario'}:</div>
        <div class="total-val">${fmtMoneda(totalPagar)}</div>
      </div>
    </div>

    <div class="letras-blk">
      <div><span class="label-fld">Total a liquidar: </span><strong>${enLetras(totalPagar)}</strong></div>
      <div style="text-align:right">
        ${esMultiPropietario ? `
          <div><span class="label-fld">Forma de pago por propietario:</span></div>
          ${propietarios.map(p => `
          <div style="margin-top:2px">
            <strong>${esc(p.nombre)}:</strong> ${fmtMoneda(p.totalPagar)}
            ${p.pagos && p.pagos.length > 1
              ? ` — ${p.pagos.map(pg => `${esc(pg.metodoPago)}: ${fmtMoneda(pg.monto)}`).join(', ')}`
              : ` — ${esc(p.formaPago || p.pagos?.[0]?.metodoPago || 'Efectivo')}`}
          </div>`).join('')}
        ` : pagos && pagos.length > 1 ? `
          <div><span class="label-fld">Forma de pago:</span></div>
          ${pagos.map(p => `
          <div style="margin-top:2px">
            <strong>${esc(p.metodoPago)}:</strong> ${fmtMoneda(p.monto)}
            ${p.referencia ? ` <span class="label-fld">(${esc(p.referencia)})</span>` : ''}
          </div>`).join('')}
        ` : `<span class="label-fld">Forma de pago: </span><strong>${esc(formaPago)}</strong>`}
      </div>
    </div>

    ${esMultiPropietario ? `
    <div class="firma-blk" style="justify-content:space-around;flex-wrap:wrap;gap:8px">
      ${propietarios.map(p => `<div class="firma-linea">Firma — ${esc(p.nombre)}</div>`).join('')}
    </div>
    <div class="copia-label" style="text-align:right;margin-top:4px">– ${tipoCopia} –</div>
    ` : `
    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">– ${tipoCopia} –</div>
    </div>
    `}
  </div>`;

  return `
    ${copia('ORIGINAL')}
    <div class="separador">– – – – – – – – – – – – – – – – – – – – – – – – – – – – – –</div>
    ${copia('DUPLICADO')}
  `;
}

export function imprimirLiquidacion(params) {
  abrirVentana('Liquidación', construirLiquidacionHTML(params));
}

export function generarPDFLiquidacion(params, filename = 'liquidacion.pdf') {
  return generarPDFBlobDesdeHTML(construirLiquidacionHTML(params), filename);
}

/* ============================================================
   FACTURA DE DEUDA (al cancelar un contrato con cobros pendientes)
   { alq, inquilino, propiedad, propietario,
     cobrosPendientes: [{ mes, monto, moneda?, concepto? }] }
   Cada ítem puede tener su propia moneda (ej: alquiler adeudado en USD
   y una multa en ARS) — no se suman montos de monedas distintas.
   ============================================================ */
function construirFacturaDeudaHTML({ alq, inquilino, propiedad, propietario, cobrosPendientes = [] }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_DEUDA));
  const fecha = new Date().toISOString().slice(0, 10);

  const monedaDefault = alq.moneda || 'ARS';
  const totalesPorMoneda = {};
  cobrosPendientes.forEach(c => {
    const m = c.moneda || monedaDefault;
    totalesPorMoneda[m] = (totalesPorMoneda[m] || 0) + (Number(c.monto) || 0);
  });
  const monedas = Object.keys(totalesPorMoneda);

  const dniInq = alq.inquilinoDni || inquilino?.dni || '';

  const copia = (tipoCopia) => `
  <div class="copia">
    ${headerDoc(ag, 'DEUDA', num, fecha)}

    <div class="banda-concepto">
      DETALLE DE DEUDA PENDIENTE AL CANCELAR CONTRATO DE ALQUILER
    </div>

    <div class="cliente-blk">
      <div class="dato-fld"><span class="lbl">Inquilino:</span> <strong>${esc(inquilino?.nombre || '—')}</strong></div>
      ${dniInq ? `<div class="dato-fld"><span class="lbl">DNI:</span> <strong>${esc(dniInq)}</strong></div>` : '<div class="dato-fld"></div>'}
      <div class="dato-fld" style="width:100%"><span class="lbl">Inmueble:</span> ${esc(propiedad?.direccion || '—')}</div>
      <div class="dato-fld"><span class="lbl">Propietario:</span> ${esc(propietario?.nombre || '—')}</div>
      <div class="dato-fld"><span class="lbl">Contrato:</span> ${fmtFecha(alq.fechaInicio)} — ${fmtFecha(alq.fechaFin)}</div>
    </div>

    <table class="tabla">
      <thead><tr>
        <th>Inmueble</th>
        <th>Período</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
        ${cobrosPendientes.map(c => `
        <tr>
          <td>${esc(propiedad?.direccion || '—')}</td>
          <td>${c.mes ? mesLabel(c.mes) : esc(c.concepto || 'Cargo adicional')}</td>
          <td class="right">${fmtMoneda(c.monto, c.moneda || monedaDefault)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="totales">
      ${monedas.map(m => `
      <div class="total-row grand">
        <div class="total-label">TOTAL ADEUDADO${monedas.length > 1 ? ` (${m})` : ''}:</div>
        <div class="total-val">${fmtMoneda(totalesPorMoneda[m], m)}</div>
      </div>`).join('')}
    </div>

    <div class="letras-blk">
      <div>
        ${monedas.map(m => `<div><span class="lbl">Son ${m === 'USD' ? 'dólares' : 'pesos'}${monedas.length > 1 ? ` (${m})` : ''}:</span> <strong>${enLetras(totalesPorMoneda[m], m === 'USD' ? 'dólares' : 'pesos')}</strong></div>`).join('')}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">— ${tipoCopia} · deuda al cancelar contrato —</div>
    </div>
  </div>`;

  return `
    ${copia('ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia('DUPLICADO')}
  `;
}

export function imprimirFacturaDeuda(params) {
  abrirVentana('Deuda pendiente', construirFacturaDeudaHTML(params));
}

export function generarPDFFacturaDeuda(params, filename = 'deuda.pdf') {
  return generarPDFBlobDesdeHTML(construirFacturaDeudaHTML(params), filename);
}

/* ============================================================
   INFORME DE CAPTACIÓN (VENTAS)
   Resumen periódico para el propietario: consultas, visitas,
   ofertas, acciones de marketing e índice de vendibilidad.
   { captacion, periodoDesde, periodoHasta, stats: {
       consultas, visitas, ofertas, accionesMkt: [{fecha,accion}],
       canalesActivos: [...], metaAdsActivas: [...],
       indice: { score, color }, recomendaciones: [...]
   } }
   ============================================================ */
function construirInformeCaptacionHTML({ captacion: c, periodoDesde, periodoHasta, stats }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_INFORME_VENTA));
  const fecha = new Date().toISOString().slice(0, 10);
  const colorIndice = stats.indice.color === 'green' ? '#16a34a' : stats.indice.color === 'yellow' ? '#d97706' : '#dc2626';

  const cuerpo = `
  <div class="copia">
    ${headerDoc(ag, 'INFORME', num, fecha)}

    <div class="banda-concepto">
      INFORME DE COMERCIALIZACIÓN — ${esc(c.direccion || 'Propiedad')}
    </div>

    <div class="cliente-blk">
      <div class="dato-fld" style="width:100%"><span class="lbl">Propiedad:</span> <strong>${esc(c.direccion || '—')}</strong>${(c.ciudad || c.localidad) ? ' — ' + esc(c.ciudad || c.localidad) : ''}</div>
      <div class="dato-fld"><span class="lbl">Período informado:</span> ${fmtFecha(periodoDesde)} — ${fmtFecha(periodoHasta)}</div>
      <div class="dato-fld"><span class="lbl">Estado:</span> ${esc(c.estado || '—')}</div>
    </div>

    <div class="contrato-blk">
      <div class="contrato-titulo">Actividad del período</div>
      <div class="contrato-grid">
        <div class="contrato-row"><span class="lbl">Consultas:</span> <strong>${stats.consultas}</strong></div>
        <div class="contrato-row"><span class="lbl">Visitas:</span> <strong>${stats.visitas}</strong></div>
        <div class="contrato-row"><span class="lbl">Ofertas recibidas:</span> <strong>${stats.ofertas}</strong></div>
        <div class="contrato-row"><span class="lbl">Acciones de marketing:</span> <strong>${stats.accionesMkt.length}</strong></div>
      </div>
    </div>

    ${stats.accionesMkt.length ? `
    <table class="tabla">
      <thead><tr><th>Fecha</th><th>Acción de comercialización</th></tr></thead>
      <tbody>
        ${stats.accionesMkt.map(a => `<tr><td>${fmtFecha(a.fecha)}</td><td>${esc(a.accion)}</td></tr>`).join('')}
      </tbody>
    </table>` : ''}

    <div class="contrato-blk">
      <div class="contrato-titulo">Publicaciones activas</div>
      <div style="font-size:10px">${stats.canalesActivos.length ? esc(stats.canalesActivos.join(' · ')) : 'Sin publicaciones registradas'}</div>
    </div>

    ${stats.metaAdsActivas.length ? `
    <div class="contrato-blk">
      <div class="contrato-titulo">Publicidad ejecutada (Meta Ads)</div>
      ${stats.metaAdsActivas.map(m => `<div style="font-size:10px;margin-bottom:3px">Del ${fmtFecha(m.fechaInicio)} al ${fmtFecha(m.fechaFin)}${m.presupuesto ? ' · Presupuesto: ' + fmtMoneda(m.presupuesto) : ''}</div>`).join('')}
    </div>` : ''}

    <div class="totales" style="margin-top:10px">
      <div class="total-row grand" style="text-align:left">
        <div class="total-label" style="min-width:0;text-align:left">Índice de vendibilidad:</div>
        <div class="total-val" style="min-width:0;text-align:left;color:${colorIndice}">${stats.indice.score}/100</div>
      </div>
    </div>

    <div class="letras-blk" style="display:block">
      <div class="lbl" style="margin-bottom:4px">Recomendaciones:</div>
      <ul style="margin:0;padding-left:16px;font-size:9.5px">
        ${stats.recomendaciones.map(r => `<li style="margin-bottom:2px">${esc(r)}</li>`).join('')}
      </ul>
    </div>

    <div class="firma-blk" style="border-top:1px solid #ccc;margin-top:10px;padding-top:6px">
      <div style="font-size:9px;color:#888">Informe generado el ${fmtFecha(fecha)} · uso informativo para el propietario.</div>
    </div>
  </div>`;

  return cuerpo;
}

export function imprimirInformeCaptacion(datos) {
  abrirVentana('Informe de Comercialización', construirInformeCaptacionHTML(datos));
}

export function generarPDFInformeCaptacion(datos) {
  const cuerpo = construirInformeCaptacionHTML(datos);
  return generarPDFBlobDesdeHTML(cuerpo);
}

/** Genera el PDF de un documento como Blob real (para compartirlo, ej. por WhatsApp),
 *  usando html2pdf.js (cargado por CDN en index.html) sobre un iframe oculto para
 *  no mezclar los estilos de impresión con los del resto de la app. */
/* Genera el PDF renderizando dentro del documento principal de la app (no en un iframe aparte):
   probamos con un iframe (document.write y después srcdoc) y en ambos casos html2canvas
   terminaba capturando el contenido sin el <style> aplicado — texto plano, sin bordes ni
   colores. Acá el contenido y su CSS viven un instante en el propio documento (invisible,
   fuera de pantalla), con el reset scoped a #pdfExportRoot para no afectar el resto de la
   UI mientras se genera el PDF, y se sacan los dos apenas termina. */
export function generarPDFBlobDesdeHTML(cuerpoHTML, filename = 'documento.pdf') {
  return new Promise((resolve, reject) => {
    if (typeof html2pdf === 'undefined') {
      reject(new Error('html2pdf no está disponible (revisá la conexión a internet)'));
      return;
    }
    const style = document.createElement('style');
    style.textContent = CSS_PRINT_SCOPED;

    // El nodo que se le pasa a html2canvas (.from(cont)) NO puede tener "position" propio
    // (ni absolute ni fixed): comprobado que en ese caso captura un área vacía y el PDF sale
    // en blanco sin ningún error, sea cual sea el offset o el renderer usado. Por eso "cont"
    // queda en el flujo normal del documento (sin position), y es el WRAPPER que lo contiene
    // el que se posiciona fuera de pantalla — un ancestro con position sí es inofensivo.
    const cont = document.createElement('div');
    cont.id = 'pdfExportRoot';
    cont.style.cssText = 'width:210mm';
    cont.innerHTML = `<div class="pagina">${cuerpoHTML}</div>`;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:-10000px;top:0;z-index:-1';
    wrap.appendChild(cont);

    const limpiar = () => { wrap.remove(); style.remove(); };

    document.head.appendChild(style);
    document.body.appendChild(wrap);

    setTimeout(() => {
      html2pdf()
        .from(cont)
        .set({
          margin: 5,
          filename,
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          html2canvas: { scale: 2, useCORS: true },
        })
        .outputPdf('blob')
        .then(blob => { limpiar(); resolve(blob); })
        .catch(err => { limpiar(); reject(err); });
    }, 60);
  });
}
