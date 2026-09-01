/* ============================================================
   COMPONENT · Asistente — bot de reglas que responde preguntas
   sobre cómo usar el sistema (no es IA: busca palabras clave en
   una base de respuestas ya escritas y contesta la que más
   coincide, con un botón directo a la sección si corresponde).
   ============================================================ */
import { icon } from '../config.js';
import { el, esc } from '../lib.js';
import { navegar } from '../router.js';

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n');
}

/* Cada tema tiene palabras clave (ya sin acentos) y una respuesta con pasos.
 * `ruta` es opcional: si está, el bot muestra un botón para ir directo ahí. */
const TEMAS = [
  {
    id: 'nuevo-cliente',
    keywords: ['cliente', 'clientes', 'cargar cliente', 'nuevo cliente', 'agregar cliente', 'editar cliente', 'eliminar cliente', 'borrar cliente', 'filtro clientes'],
    respuesta: `Para cargar un cliente:<br>
      1. Andá a la sección <strong>Clientes</strong>.<br>
      2. Arriba a la derecha, tocá el botón <strong>"Nuevo cliente"</strong>.<br>
      3. Completá sus datos de contacto (nombre, DNI, teléfono, email, domicilio).<br>
      4. Elegí qué está buscando (Alquilar / Comprar / Otro) y, si lo sabés, los detalles de la búsqueda — eso mejora las sugerencias automáticas de propiedades.<br>
      5. Guardá.<br><br>
      Para editarlo o eliminarlo, entrá a su ficha y usá los botones <strong>"Editar"</strong> / <strong>"Eliminar"</strong>. Ahí también podés registrar cada contacto que tenés con él, lo que reinicia el contador de días sin seguimiento. Arriba de la lista podés filtrar por lo que busca (Alquilar / Comprar / Propietarios).`,
    ruta: 'clientes',
  },
  {
    id: 'nueva-propiedad',
    keywords: ['propiedad', 'propiedades', 'cargar propiedad', 'nueva propiedad', 'agregar propiedad', 'inmueble', 'editar propiedad', 'eliminar propiedad', 'filtro propiedades'],
    respuesta: `Para cargar una propiedad:<br>
      1. Andá a la sección <strong>Propiedades</strong>.<br>
      2. Tocá el botón <strong>"Nueva propiedad"</strong> arriba a la derecha.<br>
      3. Completá dirección, tipo, características y precio.<br>
      4. Elegí para qué está habilitada (Alquiler / Alquiler temporario / Venta).<br>
      5. Guardá — va a quedar disponible para asociarla a un alquiler o una venta.<br><br>
      Para editarla o eliminarla, entrá a su ficha (o tocá el lápiz en la tarjeta). Arriba del listado podés filtrar por estado: Todas / Para alquilar-vender / Alquiladas / Vendidas.`,
    ruta: 'propiedades',
  },
  {
    id: 'habilitar-propiedad',
    keywords: ['habilitar', 'habilitar propiedad', 'no aparece en temporales', 'tipo de uso', 'marcar para alquilar', 'alquilar y vender'],
    respuesta: `Cada propiedad tiene 3 casilleros independientes en su formulario: <strong>"Alquiler"</strong>, <strong>"Alquiler temporario"</strong> y <strong>"Venta"</strong>. Una misma propiedad puede estar habilitada para más de uno a la vez (por ejemplo, para alquilar y vender). Si una propiedad no te aparece para elegir en <strong>Temporales</strong>, revisá que tenga tildado "Alquiler temporario" en su ficha (Editar → Tipo de uso).`,
    ruta: 'propiedades',
  },
  {
    id: 'match-clientes',
    keywords: ['match', 'coincidencia', 'clientes interesados', 'porcentaje', 'clientes que buscan esto', 'a quien le puede interesar'],
    respuesta: `En la ficha de cada propiedad, el sistema muestra automáticamente los <strong>clientes interesados</strong>, ordenados por un % de coincidencia calculado contra lo que cada uno está buscando (zona, tipo, ambientes, presupuesto, amenities). Tocando un cliente de esa lista se abre el detalle de la comparación (qué coincide y qué no) con un botón para contactarlo por WhatsApp.`,
    ruta: 'propiedades',
  },
  {
    id: 'nuevo-propietario',
    keywords: ['propietario', 'propietarios', 'dueno', 'dueños', 'nuevo propietario', 'editar propietario', 'eliminar propietario', 'filtro propietarios'],
    respuesta: `Para cargar un propietario:<br>
      1. Andá a la sección <strong>Propietarios</strong>.<br>
      2. Tocá <strong>"Nuevo propietario"</strong> arriba a la derecha.<br>
      3. Completá sus datos (incluido CBU/banco si le vas a transferir liquidaciones) y guardá.<br><br>
      Para editarlo o eliminarlo, entrá a su ficha. Ahí también ves todas sus propiedades. Arriba del listado podés filtrar por objetivo: Para alquilar / Para vender / Ambas.`,
    ruta: 'propietarios',
  },
  {
    id: 'nuevo-contrato',
    keywords: ['contrato', 'alquiler', 'alquileres', 'nuevo contrato', 'nuevo alquiler', 'inquilino', 'editar contrato', 'eliminar contrato', 'filtro alquileres'],
    respuesta: `Para cargar un contrato de alquiler:<br>
      1. Andá a la sección <strong>Alquileres</strong>.<br>
      2. Tocá <strong>"Nuevo contrato"</strong>.<br>
      3. Elegí el inquilino y la propiedad, cargá fechas, monto y moneda.<br>
      4. Definí el tipo de ajuste (fijo, ICL, IPC u Otro) y cada cuántos meses se aplica (trimestral, cuatrimestral, semestral o anual).<br>
      5. Si corresponde, cargá garantes y si cobrás comisión inicial (ver "garantes y comisión inicial").<br>
      6. Guardá — el contrato va a aparecer en el listado con su estado (activo, por vencer, vencido, etc.).<br><br>
      Podés filtrar el listado por: Todos / Por vencer / Necesitan aumento / Con deuda / Vencidos. Para editar o eliminar un contrato usá los botones en su detalle.`,
    ruta: 'alquileres',
  },
  {
    id: 'garantes-comision',
    keywords: ['garante', 'garantes', 'fiador', 'fiadores', 'comision inicial', 'deposito', 'fecha de firma'],
    respuesta: `Un contrato puede tener varios <strong>garantes</strong> (nombre, DNI/CUIT, teléfono, email, domicilio, relación con el inquilino y, si aplica, propiedad en garantía) — se agregan y quitan desde el formulario del contrato, y cada uno tiene su botón de WhatsApp en el detalle. También podés marcar <strong>"Cobra comisión inicial"</strong>: al registrar el primer cobro del contrato, va a aparecer un bloque extra para cargar ese monto una única vez, junto al depósito y la fecha de firma.`,
    ruta: 'alquileres',
  },
  {
    id: 'renovar-contrato',
    keywords: ['renovar', 'renovar contrato', 'renovacion', 'renovacion de contrato'],
    respuesta: `Para renovar un contrato: entrá a su detalle en <strong>Alquileres</strong> y tocá <strong>"Renovar contrato"</strong>. Se abre un formulario nuevo, precargado con el mismo inquilino, propiedad y garantes, empezando el día después de que termina el actual (por defecto propone un año más). El contrato viejo queda marcado como <strong>"Renovado"</strong> y enlazado al nuevo.`,
    ruta: 'alquileres',
  },
  {
    id: 'cancelar-contrato',
    keywords: ['cancelar', 'cancelar contrato', 'rescindir', 'rescision', 'anular contrato', 'terminar contrato', 'romper contrato'],
    respuesta: `Para cancelar/rescindir un contrato antes de tiempo: entrá a su detalle y tocá <strong>"Cancelar contrato"</strong>. El sistema te muestra la deuda pendiente (si hay meses sin cobrar) y te deja agregar un cargo extra opcional (por ejemplo, una multa por rescisión anticipada). Al confirmar: el contrato pasa a <strong>"Rescindido"</strong>, la propiedad vuelve a quedar <strong>Disponible</strong> automáticamente, el cargo se registra como ingreso en Caja, y si hay deuda o cargo se imprime sola una <strong>"Factura de deuda"</strong> con el detalle.`,
    ruta: 'alquileres',
  },
  {
    id: 'registrar-cobro',
    keywords: ['cobro', 'cobros', 'registrar cobro', 'cobrar', 'pago', 'pagos', 'mes pagado', 'dividir pago'],
    respuesta: `Para registrar un cobro:<br>
      1. Entrá al contrato desde <strong>Alquileres</strong> (tocá el inquilino en la lista).<br>
      2. Buscá el mes correspondiente en "Cobros mes a mes" y tocá <strong>"Cobrar"</strong>.<br>
      3. Confirmá el monto y el medio de pago — si pagó parte en efectivo y parte por transferencia, por ejemplo, usá <strong>"Dividir pago"</strong> para cargar cada medio por separado.<br>
      4. Si es el primer mes y el contrato cobra comisión inicial, vas a ver un campo extra para cargarla junto con el alquiler.<br>
      Si un contrato tiene meses vencidos sin cobrar, van a aparecer marcados como pendientes. Una vez cobrado, podés imprimir el recibo desde el mismo mes.`,
    ruta: 'alquileres',
  },
  {
    id: 'registrar-aumento',
    keywords: ['aumento', 'aumentos', 'ajuste', 'ajustes', 'subir el alquiler', 'actualizar el alquiler', 'registrar aumento'],
    respuesta: `Para registrar un aumento (ICL, IPC, fijo u Otro):<br>
      1. Entrá al contrato desde <strong>Alquileres</strong>.<br>
      2. Si tiene un ajuste pendiente, vas a ver un cartel amarillo <strong>"Contrato por aumentar"</strong> con el botón <strong>"Registrar aumento"</strong>.<br>
      3. Si es por ICL o IPC, el sistema precarga el % real correspondiente al período pactado de ese contrato (no el % genérico del mes — ver "índices ICL/IPC"), así que no suma de más si te atrasaste en aplicarlo. Ese % lo podés editar a mano si hace falta.<br>
      4. Podés sumar un % extra acordado con el inquilino, revisar el monto nuevo y confirmar. Si hay más de un período pendiente, el modal te pide confirmar uno por uno.<br>
      En el detalle del contrato queda un historial con cada aumento aplicado (monto anterior → nuevo, fecha). También podés ver todos los contratos con aumento pendiente filtrando por <strong>"Necesitan aumento"</strong> en Alquileres, o desde la tarjeta "Contratos por aumentar" en Inicio.`,
    ruta: 'alquileres',
  },
  {
    id: 'indices-icl-ipc',
    keywords: ['icl', 'ipc', 'indice', 'indices', 'de donde sale el icl', 'de donde sale el ipc', 'actualizar indice'],
    respuesta: `El <strong>ICL</strong> y el <strong>IPC</strong> se traen automáticamente desde APIs públicas (BCRA para ICL, ArgentinaDatos para IPC) — no hay que cargarlos a mano. En <strong>Inicio</strong> se muestran dos tarjetas con el último valor conocido y un botón <strong>"Actualizar"</strong> para forzar la consulta (también se actualizan solas al abrir el sistema). Ojo: ese % es el <em>mensual</em> general — cuando registrás un aumento en un contrato puntual, el sistema calcula el % <em>real acumulado</em> del período que le corresponde a ese contrato, que puede ser distinto al de la tarjeta de Inicio.`,
    ruta: 'inicio',
  },
  {
    id: 'nueva-venta',
    keywords: ['venta', 'ventas', 'vender', 'comprador', 'nueva venta', 'editar venta', 'eliminar venta'],
    respuesta: `Para cargar una venta:<br>
      1. Andá a la sección <strong>Ventas</strong>.<br>
      2. Tocá <strong>"Nueva venta"</strong>.<br>
      3. Elegí comprador y propiedad, cargá precio, comisión, escribano y estado de la operación.<br>
      4. Guardá — vas a poder ir actualizando el estado desde el detalle.<br><br>
      El listado tiene 3 pestañas: En curso / Escrituradas / Todas. Para editar o eliminar una venta usá los botones en su detalle.`,
    ruta: 'ventas',
  },
  {
    id: 'estado-venta',
    keywords: ['estado de la venta', 'escriturar', 'escrituracion', 'reservar la venta', 'venta caida', 'cambiar estado venta', 'venta reservada'],
    respuesta: `Desde el detalle de una venta podés cambiar su estado con un solo toque: <strong>En curso</strong> → <strong>Reservada</strong> → <strong>Escriturada</strong>, o marcarla como <strong>Caída</strong> si no se concreta. No hace falta editar toda la venta para esto, hay botones dedicados en la ficha.`,
    ruta: 'ventas',
  },
  {
    id: 'agenda',
    keywords: ['agenda', 'evento', 'eventos', 'recordatorio', 'turno', 'cita', 'editar evento', 'eliminar evento'],
    respuesta: `Para agendar un evento o recordatorio:<br>
      1. Andá a <strong>Agenda</strong>.<br>
      2. Tocá <strong>"Nuevo evento"</strong>, elegí el tipo (Visita, Llamada, Reunión, Cobro, Vencimiento u Otro) y cargá título, fecha y hora.<br>
      3. Si le ponés hora, el sistema te avisa con sonido y notificación cuando llegue el momento.<br><br>
      Podés marcar un evento como <strong>"Completado"</strong>, editarlo o eliminarlo desde la lista. Los filtros Hoy / Próximas / Vencidas te ayudan a ubicarte, y en el calendario también vas a ver eventos "automáticos" (vencimientos de contrato, cobros atrasados, aumentos pendientes) marcados con un punto distinto — esos no se cargan a mano, los genera el sistema solo.`,
    ruta: 'agenda',
  },
  {
    id: 'caja',
    keywords: ['caja', 'ingreso', 'egreso', 'cerrar el dia', 'cerrar caja', 'saldo', 'eliminar movimiento', 'metodo de pago'],
    respuesta: `Para manejar la caja diaria:<br>
      1. Andá a <strong>Caja</strong>.<br>
      2. Usá <strong>"Registrar ingreso"</strong> o <strong>"Registrar egreso"</strong> para cada movimiento manual, indicando el medio de pago (Efectivo, Transferencia, Cheque, Débito, Crédito u Otro).<br>
      3. Cuando termina el día, tocá <strong>"Cerrar el día"</strong> — una vez cerrado no se pueden cargar más movimientos ese día, y al otro día se abre una caja nueva sola.<br><br>
      No todos los movimientos son manuales: los cobros de alquiler, comisiones iniciales, cargos por cancelación de contrato, liquidaciones y ventas generan su propio movimiento de caja automáticamente. Podés eliminar un movimiento con el tacho al lado, y ver el historial de días ya cerrados desplegando cada fila.`,
    ruta: 'caja',
  },
  {
    id: 'temporales',
    keywords: ['temporal', 'temporales', 'reserva', 'reservas', 'alquiler temporario', 'editar reserva', 'eliminar reserva'],
    respuesta: `Para cargar una reserva temporaria:<br>
      1. Andá a <strong>Temporales</strong>.<br>
      2. Tocá <strong>"Nueva reserva"</strong> y completá huésped, propiedad (solo se listan las que tienen habilitado "Alquiler temporario") y fechas de check-in/check-out.<br>
      3. El sistema calcula solo las noches y el total según el precio por noche (lo podés ajustar a mano). Si cargás una seña, se muestra el resto pendiente de cobrar.<br><br>
      El estado (confirmada → activa → completada) se sugiere solo según las fechas, con botones para confirmarlo con un toque; también podés editarla, eliminarla o marcarla cancelada a mano.`,
    ruta: 'temporales',
  },
  {
    id: 'liquidaciones',
    keywords: ['liquidacion', 'liquidaciones', 'liquidar', 'descuento liquidacion', 'liquidacion grupal'],
    respuesta: `Las liquidaciones (el pago a un propietario por los alquileres cobrados) se generan de dos formas:<br>
      • Desde <strong>Liquidaciones</strong>, agrupadas por propietario: un solo botón <strong>"Liquidar"</strong> junta todo lo pendiente de todas sus propiedades y meses.<br>
      • Desde el detalle de un contrato en Alquileres, liquidando un cobro puntual.<br><br>
      En ambos casos podés restar <strong>descuentos</strong> (por ejemplo, una reparación) con su propio concepto y monto, y dividir el pago en varios medios. Podés guardar la liquidación sin imprimir, o generar el PDF. En la pestaña "Historial" podés reimprimir o eliminar liquidaciones ya hechas.`,
    ruta: 'liquidaciones',
  },
  {
    id: 'inicio-dashboard',
    keywords: ['inicio', 'dashboard', 'pantalla principal', 'que veo en inicio', 'resumen general'],
    respuesta: `<strong>Inicio</strong> es el panel principal: arriba tenés las tarjetas de ICL/IPC, después 4 números clave (clientes, alquileres activos, propiedades libres, eventos de hoy) que son accesos directos a cada sección, y más abajo widgets con lo que necesita tu atención: contratos por aumentar, contratos por vencer, cobros pendientes, próximos cobros (7 días) y próximos eventos. Tocando cualquier ítem te lleva directo al registro correspondiente.`,
    ruta: 'inicio',
  },
  {
    id: 'estados-generales',
    keywords: ['estados de propiedad', 'que significa disponible', 'estado del contrato', 'por vencer', 'que significa vencido', 'estados de venta'],
    respuesta: `Estados de <strong>propiedad</strong>: Disponible, Alquilada, Vendida, Reservada — las últimas dos cambian solas cuando creás/cancelás un contrato o una venta. Estados de <strong>contrato</strong>: Activo, Por vencer (a 60 días de terminar), Vencido, Rescindido, Renovado. Estados de <strong>venta</strong>: En curso, Reservada, Escriturada, Caída. Casi todos estos cambios son automáticos según fechas y acciones que hacés en el sistema, salvo en Ventas, donde los cambiás a mano con un toque.`,
  },
  {
    id: 'imprimir-documentos',
    keywords: ['imprimir', 'recibo', 'factura de deuda', 'pdf', 'datos de la inmobiliaria', 'datos imprenta', 'ver contrato completo'],
    respuesta: `El sistema imprime 3 tipos de documento, cada uno con numeración correlativa propia y en dos copias (Original/Duplicado):<br>
      • <strong>Recibo</strong> de cada mes cobrado (botón junto al mes pagado, en el contrato).<br>
      • <strong>Liquidación</strong> al propietario (desde Liquidaciones o desde un cobro puntual).<br>
      • <strong>Factura de deuda</strong>, que se genera sola al cancelar un contrato con meses impagos o un cargo pendiente.<br><br>
      Todos se abren en una ventana nueva con el botón <strong>"Imprimir / Guardar PDF"</strong>. Antes de imprimir el primero, configurá los <strong>"Datos de la inmobiliaria"</strong> (nombre, CUIT, condición ante IVA, dirección, teléfono) desde el botón "Datos imprenta" en el detalle de un contrato — esos datos van a aparecer en el encabezado de todos los documentos. También podés abrir "Ver contrato" para ver toda la info (inquilino, garantes, fechas) en una sola pantalla, sin imprimir nada.`,
    ruta: 'alquileres',
  },
  {
    id: 'buscar',
    keywords: ['buscar', 'busqueda', 'encontrar'],
    respuesta: `Podés usar el buscador general de arriba (o el atajo <strong>Ctrl/Cmd + K</strong>) para encontrar <strong>clientes, propiedades, alquileres o ventas</strong> por nombre, dirección o teléfono. No busca dentro de Propietarios, Temporales ni Agenda — para esos entrá directamente a la sección.`,
  },
  {
    id: 'notificaciones',
    keywords: ['notificacion', 'notificaciones', 'campanita', 'alertas', 'badge', 'activar alertas', 'sonido'],
    respuesta: `La campanita de arriba muestra alertas de clientes sin seguimiento (7 días sin contacto), contratos por vencer (60 días antes) y eventos de hoy. El número rojo al lado de "Alquileres" en el menú son los meses de cobro vencidos sin registrar; el de "Agenda" son los eventos de hoy. La primera vez, la campanita te va a pedir <strong>activar las alertas del sistema</strong> (permiso de notificaciones del navegador) — una vez activado, podés probar el sonido desde el mismo panel.`,
  },
  {
    id: 'sidebar-menu',
    keywords: ['colapsar menu', 'minimizar menu', 'menu lateral', 'achicar menu', 'menu movil', 'abrir menu'],
    respuesta: `En pantallas grandes podés colapsar el menú lateral para ganar espacio con el botón de flecha junto al logo. En el celular, el menú se abre y cierra tocando el ícono de hamburguesa arriba a la izquierda.`,
  },
  {
    id: 'tema',
    keywords: ['tema oscuro', 'modo oscuro', 'modo claro', 'cambiar tema', 'dark mode'],
    respuesta: `Para cambiar entre tema claro y oscuro, tocá el ícono de sol/luna arriba a la derecha.`,
  },
];

const SUGERENCIAS = [
  '¿Cómo cargo un cliente?',
  '¿Cómo registro un cobro?',
  '¿Cómo hago un aumento de ICL?',
  '¿Cómo cierro la caja?',
];

function buscarRespuesta(texto) {
  const q = normalizar(texto);
  let mejor = null;
  let mejorScore = 0;
  for (const tema of TEMAS) {
    let score = 0;
    for (const kw of tema.keywords) {
      if (q.includes(normalizar(kw))) score += kw.split(' ').length; // frases completas pesan más
    }
    if (score > mejorScore) { mejorScore = score; mejor = tema; }
  }
  return mejor;
}

function mensajeBienvenida() {
  return `¡Hola! Soy el asistente de InmoCRM 🙂 Preguntame cómo hacer algo en el sistema, por ejemplo:<br><br>
    ${SUGERENCIAS.map(s => `• ${esc(s)}`).join('<br>')}`;
}

export function initAsistente() {
  const btn = el(`
    <button class="asistente-fab" id="asistenteBtn" aria-label="Ayuda">
      ${icon('message')}
    </button>`);
  const panel = el(`
    <div class="asistente-panel" id="asistentePanel" style="display:none">
      <div class="asistente-head">
        <strong>Asistente</strong>
        <button class="icon-btn" id="asistenteCerrar" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="asistente-msgs" id="asistenteMsgs"></div>
      <form class="asistente-input" id="asistenteForm">
        <input id="asistenteInput" placeholder="Escribí tu pregunta…" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">${icon('check')}</button>
      </form>
    </div>`);

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const msgs = panel.querySelector('#asistenteMsgs');
  let abierto = false;
  let saludoMostrado = false;

  const agregarMensaje = (html, propio = false) => {
    const burbuja = el(`<div class="asistente-msg ${propio ? 'propio' : ''}">${html}</div>`);
    msgs.appendChild(burbuja);
    msgs.scrollTop = msgs.scrollHeight;
  };

  const responder = (texto) => {
    agregarMensaje(esc(texto), true);
    const tema = buscarRespuesta(texto);
    setTimeout(() => {
      if (!tema) {
        agregarMensaje(`No estoy seguro de eso todavía. Probá preguntar por algo puntual, como:<br><br>${SUGERENCIAS.map(s => `• ${esc(s)}`).join('<br>')}`);
        return;
      }
      agregarMensaje(tema.respuesta);
      if (tema.ruta) {
        const rutaLabel = tema.ruta.charAt(0).toUpperCase() + tema.ruta.slice(1);
        const boton = el(`<button class="btn btn-xs btn-primary" style="margin-top:.5rem">Ir a ${rutaLabel} →</button>`);
        boton.addEventListener('click', () => { navegar(tema.ruta); panel.style.display = 'none'; abierto = false; });
        msgs.lastElementChild.appendChild(document.createElement('br'));
        msgs.lastElementChild.appendChild(boton);
        msgs.scrollTop = msgs.scrollHeight;
      }
    }, 300);
  };

  btn.addEventListener('click', () => {
    abierto = !abierto;
    panel.style.display = abierto ? 'flex' : 'none';
    if (abierto && !saludoMostrado) {
      agregarMensaje(mensajeBienvenida());
      saludoMostrado = true;
    }
    if (abierto) panel.querySelector('#asistenteInput')?.focus();
  });
  panel.querySelector('#asistenteCerrar').addEventListener('click', () => { abierto = false; panel.style.display = 'none'; });

  panel.querySelector('#asistenteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = panel.querySelector('#asistenteInput');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    responder(texto);
  });
}
