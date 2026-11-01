// Asistencia Feria UTP: escanea el carné, pide la carrera y guarda el ingreso.
// Todo se guarda en este navegador (localStorage) y funciona sin internet.
'use strict';

const CLAVE_DATOS = 'feriaUTP.datos.v1';
const CLAVE_AJUSTES = 'feriaUTP.ajustes.v1';
const CLAVE_CAMARA = 'feriaUTP.camara.v1';
// Si el mismo carné sigue frente a la cámara, no lo vuelve a leer hasta pasado este tiempo.
const ESPERA_MISMO_CODIGO_MS = 6000;

const AJUSTES_BASE = {
  evento: 'Feria de Emprendimientos',
  puerta: 'Puerta principal',
  pedirCarrera: true,
  avisarDuplicados: true,
  sonido: true,
  vibracion: true,
  carreras: null, // null = lista UTP de carreras.js
};

const NOMBRES_FORMATO = {
  QR_CODE: 'Código QR',
  CODE_128: 'Código de barras (Code 128)',
  CODE_39: 'Código de barras (Code 39)',
  CODE_93: 'Código de barras (Code 93)',
  EAN_13: 'Código de barras (EAN-13)',
  EAN_8: 'Código de barras (EAN-8)',
  UPC_A: 'Código de barras (UPC-A)',
  UPC_E: 'Código de barras (UPC-E)',
  ITF: 'Código de barras (ITF)',
  CODABAR: 'Código de barras (Codabar)',
  PDF_417: 'Código PDF417',
  DATA_MATRIX: 'Código Data Matrix',
  MANUAL: 'Escrito a mano',
};

const $ = (id) => document.getElementById(id);

// ---------- Almacenamiento ----------
function leerJSON(clave, porDefecto) {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (err) {
    console.error('No se pudo guardar', clave, err);
    return false;
  }
}

function cargarDatos() {
  const d = leerJSON(CLAVE_DATOS, null);
  if (d && Array.isArray(d.registros)) {
    const mayor = d.registros.reduce((m, r) => Math.max(m, r.n || 0), 0);
    return { seq: Math.max(Number(d.seq) || 0, mayor), registros: d.registros };
  }
  return { seq: 0, registros: [] };
}

const estado = {
  datos: cargarDatos(),
  ajustes: { ...AJUSTES_BASE, ...leerJSON(CLAVE_AJUSTES, {}) },
  vista: 'escanear',
};

const guardarDatos = () => guardarJSON(CLAVE_DATOS, estado.datos);
const guardarAjustes = () => guardarJSON(CLAVE_AJUSTES, estado.ajustes);

// ---------- Utilidades ----------
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'text') nodo.textContent = v;
    else if (k === 'style') nodo.style.cssText = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'type') nodo.setAttribute(k, v);
    else nodo[k] = v;
  }
  for (const h of hijos.flat()) if (h != null && h !== false) nodo.append(h);
  return nodo;
}

const sinTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nro = (n) => String(n ?? 0).padStart(4, '0');
const hora = (ts) => new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const horaLarga = (ts) => new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const fecha = (ts) => new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const etiquetaFormato = (f) => NOMBRES_FORMATO[f] || f || 'Código leído';
const algunDialogoAbierto = () => !!document.querySelector('dialog[open]');

// Los carnés UTP llevan un código tipo U20231234; si aparece dentro del texto leído, se usa ese.
function normalizarCodigo(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  const utp = limpio.match(/\b[Uu]\d{7,9}\b/);
  if (utp) return utp[0].toUpperCase();
  return limpio.length <= 32 ? limpio.toUpperCase() : limpio;
}

// ---------- Carreras ----------
function grupos() {
  const propias = estado.ajustes.carreras;
  return Array.isArray(propias) && propias.length ? propias : CARRERAS_UTP;
}

function facultadDe(carrera) {
  for (const g of grupos()) if (g.carreras.includes(carrera)) return g.facultad;
  return '';
}

function gruposATexto(gs) {
  return gs.map((g) => ['# ' + g.facultad, ...g.carreras].join('\n')).join('\n\n');
}

function textoAGrupos(texto) {
  const gs = [];
  let actual = null;
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;
    if (l.startsWith('#')) {
      actual = { facultad: l.replace(/^#+/, '').trim() || 'Otras', carreras: [] };
      gs.push(actual);
    } else {
      if (!actual) {
        actual = { facultad: 'Carreras', carreras: [] };
        gs.push(actual);
      }
      if (!actual.carreras.includes(l)) actual.carreras.push(l);
    }
  }
  return gs.filter((g) => g.carreras.length);
}

// ---------- Registros ----------
function ultimoDe(codigo) {
  const rs = estado.datos.registros;
  for (let i = rs.length - 1; i >= 0; i--) if (rs[i].codigo === codigo) return rs[i];
  return null;
}

function carrerasRecientes(max = 4) {
  const vistas = [];
  const rs = estado.datos.registros;
  for (let i = rs.length - 1; i >= 0 && vistas.length < max; i--) {
    const c = rs[i].carrera;
    if (c && !vistas.includes(c)) vistas.push(c);
  }
  return vistas;
}

function conteoPorCarrera() {
  const m = new Map();
  for (const r of estado.datos.registros) m.set(r.carrera || '', (m.get(r.carrera || '') || 0) + 1);
  return m;
}

function registrar({ codigo, raw, formato, carrera }) {
  const d = estado.datos;
  const r = {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    n: d.seq + 1,
    codigo,
    carrera: carrera || '',
    facultad: carrera ? facultadDe(carrera) : '',
    ts: Date.now(),
    puerta: estado.ajustes.puerta || '',
    formato: formato || '',
    raw: raw ?? codigo,
  };
  d.registros.push(r);
  d.seq = r.n;
  if (!guardarDatos()) {
    d.registros.pop();
    d.seq = r.n - 1;
    aviso('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado. Descarga el Excel.', 'error');
    return null;
  }
  if (d.registros.length === 1) navigator.storage?.persist?.().catch(() => {});
  pintarTodo();
  return r;
}

function confirmarRegistro(r) {
  aviso(`N.º ${nro(r.n)} · ${r.codigo} · ${r.carrera || 'sin carrera'}`, 'ok');
  destello('ok');
}

// Punto de entrada de todo código leído: cámara, foto o escrito a mano.
function procesarCodigo(textoLeido, formato) {
  const codigo = normalizarCodigo(textoLeido);
  if (!codigo) {
    reanudarLector();
    return;
  }
  const previo = ultimoDe(codigo);
  if (previo && estado.ajustes.avisarDuplicados) {
    sonar('dup');
    vibrar([60, 80, 60]);
    destello('dup');
    abrirHoja('duplicado', { codigo, raw: textoLeido, formato, previo });
    return;
  }
  sonar('ok');
  vibrar(50);
  if (estado.ajustes.pedirCarrera) {
    abrirHoja('nuevo', { codigo, raw: textoLeido, formato });
  } else {
    const r = registrar({ codigo, raw: textoLeido, formato, carrera: previo?.carrera || '' });
    if (r) confirmarRegistro(r);
    setTimeout(reanudarLector, 700);
  }
}

// ---------- Avisos, sonido y vibración ----------
let temporizadorAviso;
function aviso(texto, tipo = 'info') {
  const a = $('aviso');
  a.textContent = texto;
  a.dataset.tipo = tipo;
  a.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { a.hidden = true; }, tipo === 'error' ? 5000 : 2600);
}

let audio = null;
function prepararAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function sonar(tipo) {
  if (!estado.ajustes.sonido || !audio) return;
  if (audio.state === 'suspended') audio.resume();
  const tonos = tipo === 'ok' ? [[1175, 0, 0.1]] : [[440, 0, 0.13], [330, 0.17, 0.16]];
  for (const [frecuencia, inicio, duracion] of tonos) {
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    const t = audio.currentTime + inicio;
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(vol).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duracion + 0.02);
  }
}

function vibrar(patron) {
  if (estado.ajustes.vibracion && navigator.vibrate) navigator.vibrate(patron);
}

function destello(tipo) {
  const d = $('visorDestello');
  d.dataset.tipo = tipo;
  d.classList.remove('on');
  void d.offsetWidth;
  d.classList.add('on');
}

// ---------- Cámara ----------
const escaner = {
  lector: null,
  lectorArchivo: null,
  estado: 'apagado', // apagado | iniciando | activo | pausado | error
  error: '',
  deseada: false, // la persona quiere la cámara encendida
  camaras: [],
  camaraIdx: -1,
  linterna: false,
  ultimoTexto: '',
  ultimoMomento: 0,
  cola: Promise.resolve(),
};

function formatos() {
  const F = Html5QrcodeSupportedFormats;
  return [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR, F.PDF_417, F.DATA_MATRIX];
}

// Encender y apagar la cámara toma tiempo: se ejecuta en orden para no pisarse.
function enCola(tarea) {
  escaner.cola = escaner.cola.then(tarea).catch((err) => console.error(err));
  return escaner.cola;
}

function debeEstarEncendida() {
  return escaner.deseada && estado.vista === 'escanear' && document.visibilityState === 'visible';
}

function sincronizarCamara() {
  if (debeEstarEncendida()) {
    if (escaner.estado === 'apagado') iniciarCamara();
  } else if (escaner.estado === 'activo' || escaner.estado === 'pausado') {
    detenerCamara();
  }
}

// Marco con la proporción de un carné (85,6 × 54 mm).
function cajaEscaneo(ancho, alto) {
  const w = Math.max(160, Math.floor(Math.min(ancho * 0.86, 460)));
  const h = Math.max(110, Math.floor(Math.min(alto * 0.7, w / 1.586)));
  return { width: w, height: h };
}

function mensajeErrorCamara(err) {
  const t = `${err?.name || ''} ${err?.message || err || ''}`;
  if (/NotAllowed|Permission|denied/i.test(t)) return 'No hay permiso para usar la cámara. Toca el candado junto a la dirección, permite la cámara y vuelve a intentar.';
  if (/NotFound|not found|Requested device|no camera/i.test(t)) return 'No se encontró ninguna cámara. Puedes escribir el código a mano.';
  if (/NotReadable|Could not start|in use|TrackStart/i.test(t)) return 'Otra app está usando la cámara. Ciérrala y vuelve a intentar.';
  if (/secure|https/i.test(t)) return 'La cámara solo funciona si la app se abre desde una dirección https://.';
  return `No se pudo encender la cámara (${t.trim().slice(0, 80)}).`;
}

function iniciarCamara() {
  return enCola(async () => {
    if (!debeEstarEncendida() || !['apagado', 'error'].includes(escaner.estado)) return;
    escaner.estado = 'iniciando';
    pintarVisor();
    if (!escaner.lector) {
      escaner.lector = new Html5Qrcode('lector', {
        formatsToSupport: formatos(),
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
    }
    const cam = escaner.camaras[escaner.camaraIdx];
    const fuente = cam ? { deviceId: { exact: cam.id } } : { facingMode: 'environment' };
    try {
      await escaner.lector.start(fuente, { fps: 12, qrbox: cajaEscaneo }, alDetectar, () => {});
    } catch (err) {
      console.warn('Cámara:', err);
      escaner.estado = 'error';
      escaner.error = mensajeErrorCamara(err);
      escaner.camaras = [];
      escaner.camaraIdx = -1;
      pintarVisor();
      return;
    }
    escaner.estado = 'activo';
    escaner.linterna = false;
    escaner.ultimoMomento = Date.now();
    pintarVisor();
    pedirPantallaEncendida();
    await prepararControlesCamara();
    if (!debeEstarEncendida()) await apagarLector();
  });
}

async function apagarLector() {
  try {
    await escaner.lector.stop();
  } catch (err) {
    console.warn('Al apagar la cámara:', err);
  }
  escaner.estado = 'apagado';
  escaner.linterna = false;
  soltarPantallaEncendida();
  pintarVisor();
}

function detenerCamara() {
  return enCola(async () => {
    if (escaner.estado === 'activo' || escaner.estado === 'pausado') await apagarLector();
  });
}

async function prepararControlesCamara() {
  try {
    const linterna = escaner.lector.getRunningTrackCameraCapabilities().torchFeature();
    $('btnLinterna').hidden = !linterna.isSupported();
  } catch {
    $('btnLinterna').hidden = true;
  }
  try {
    if (!escaner.camaras.length) {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      escaner.camaras = dispositivos.filter((d) => d.kind === 'videoinput').map((d) => ({ id: d.deviceId, nombre: d.label }));
    }
    if (escaner.camaraIdx < 0) {
      const actual = escaner.lector.getRunningTrackSettings?.().deviceId;
      escaner.camaraIdx = Math.max(0, escaner.camaras.findIndex((c) => c.id === actual));
    }
    $('btnCambiarCam').hidden = escaner.camaras.length < 2;
  } catch {
    $('btnCambiarCam').hidden = true;
  }
}

function cambiarCamara() {
  if (escaner.camaras.length < 2) return;
  escaner.camaraIdx = (escaner.camaraIdx + 1) % escaner.camaras.length;
  const nombre = escaner.camaras[escaner.camaraIdx].nombre;
  detenerCamara();
  iniciarCamara().then(() => {
    if (escaner.estado === 'activo') aviso(nombre ? `Cámara: ${nombre}` : `Cámara ${escaner.camaraIdx + 1} de ${escaner.camaras.length}`);
  });
}

async function alternarLinterna() {
  try {
    const linterna = escaner.lector.getRunningTrackCameraCapabilities().torchFeature();
    await linterna.apply(!escaner.linterna);
    escaner.linterna = !escaner.linterna;
  } catch {
    aviso('Esta cámara no permite encender la linterna.', 'error');
  }
  pintarVisor();
}

function alDetectar(texto, resultado) {
  if (escaner.estado !== 'activo' || algunDialogoAbierto()) return;
  const ahora = Date.now();
  if (texto === escaner.ultimoTexto && ahora - escaner.ultimoMomento < ESPERA_MISMO_CODIGO_MS) return;
  escaner.ultimoTexto = texto;
  escaner.ultimoMomento = ahora;
  try {
    escaner.lector.pause(true);
    escaner.estado = 'pausado';
  } catch (err) {
    console.warn(err);
  }
  pintarVisor();
  procesarCodigo(texto, resultado?.result?.format?.formatName || '');
}

function reanudarLector() {
  if (escaner.estado === 'pausado' && debeEstarEncendida()) {
    try {
      escaner.lector.resume();
      escaner.estado = 'activo';
    } catch (err) {
      console.warn(err);
    }
    escaner.ultimoMomento = Date.now();
    pintarVisor();
  } else {
    sincronizarCamara();
  }
}

async function leerFoto(archivo) {
  if (!archivo) return;
  if (!escaner.lectorArchivo) escaner.lectorArchivo = new Html5Qrcode('lectorArchivo', { formatsToSupport: formatos(), verbose: false });
  try {
    const res = await escaner.lectorArchivo.scanFileV2(archivo, false);
    procesarCodigo(res.decodedText, res.result?.format?.formatName || '');
  } catch {
    aviso('No se encontró ningún código en la foto. Acércate más y que se vea nítido.', 'error');
  }
}

// Mantener la pantalla encendida mientras se escanea en la puerta.
let bloqueoPantalla = null;
async function pedirPantallaEncendida() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') bloqueoPantalla = await navigator.wakeLock.request('screen');
  } catch {
    bloqueoPantalla = null;
  }
}
function soltarPantallaEncendida() {
  bloqueoPantalla?.release().catch(() => {});
  bloqueoPantalla = null;
}

// ---------- Hoja de carrera ----------
const hoja = { modo: null, ctx: null, mostrandoCarreras: false };

function abrirHoja(modo, ctx) {
  hoja.modo = modo;
  hoja.ctx = ctx;
  const dlg = $('dlgHoja');
  dlg.dataset.modo = modo;
  const r = ctx.registro;
  $('hojaEtq').textContent = {
    nuevo: 'Nuevo ingreso · elige la carrera',
    duplicado: 'Este código ya ingresó',
    editar: `Ingreso N.º ${nro(r?.n)}`,
  }[modo];
  $('hojaCodigo').textContent = ctx.codigo;
  $('hojaMeta').textContent = modo === 'editar'
    ? `${fecha(r.ts)} · ${horaLarga(r.ts)}${r.puerta ? ' · ' + r.puerta : ''}`
    : etiquetaFormato(ctx.formato);
  const cajaAviso = $('hojaAviso');
  cajaAviso.hidden = modo !== 'duplicado';
  if (modo === 'duplicado') {
    const p = ctx.previo;
    cajaAviso.textContent = `Ingresó a las ${hora(p.ts)} con el N.º ${nro(p.n)} · ${p.carrera || 'sin carrera'}.`;
  }
  $('buscarCarrera').value = '';
  mostrarCarreras(modo !== 'duplicado');
  if (!dlg.open) dlg.showModal();
  $('hojaCuerpo').scrollTop = 0;
}

function mostrarCarreras(si) {
  hoja.mostrandoCarreras = si;
  $('hojaCuerpo').hidden = !si;
  $('hojaDup').hidden = si || hoja.modo !== 'duplicado';
  if (si) pintarCarreras();
  pintarPieHoja();
}

function carreraActualHoja() {
  if (hoja.modo === 'editar') return hoja.ctx.registro.carrera;
  if (hoja.modo === 'duplicado') return hoja.ctx.previo.carrera;
  return null;
}

function pintarCarreras() {
  const palabras = sinTildes($('buscarCarrera').value.trim()).split(/\s+/).filter(Boolean);
  const actual = carreraActualHoja();
  const conteo = conteoPorCarrera();
  const botonCarrera = (c) => el('button', { type: 'button', class: 'carrera', 'data-carrera': c, 'aria-pressed': String(c === actual) },
    el('span', { text: c }),
    conteo.get(c) ? el('span', { class: 'carrera-num', text: conteo.get(c) }) : null);

  const lista = $('listaCarreras');
  lista.replaceChildren();
  let total = 0;
  for (const g of grupos()) {
    const visibles = g.carreras.filter((c) => {
      const t = sinTildes(`${c} ${g.facultad}`);
      return palabras.every((p) => t.includes(p));
    });
    if (!visibles.length) continue;
    total += visibles.length;
    lista.append(el('section', { class: 'grupo' },
      el('h3', { class: 'grupo-titulo', text: g.facultad }),
      visibles.map(botonCarrera)));
  }
  $('carrerasVacio').hidden = total > 0;

  const recientes = palabras.length ? [] : carrerasRecientes(4);
  const caja = $('recientes');
  caja.replaceChildren();
  caja.hidden = !recientes.length;
  if (recientes.length) {
    caja.append(el('span', { class: 'recientes-etq', text: 'Recientes' }),
      ...recientes.map((c) => el('button', { type: 'button', class: 'chip', 'data-carrera': c, text: c })));
  }
}

function pintarPieHoja() {
  const pie = $('hojaPie');
  const boton = (texto, clase, accion) => {
    const b = el('button', { type: 'button', class: clase, text: texto });
    b.addEventListener('click', accion);
    return b;
  };
  pie.replaceChildren();
  if (hoja.modo === 'editar') {
    pie.append(boton('Eliminar', 'btn btn-peligro', eliminarDesdeHoja), boton('Listo', 'btn btn-secundario', cerrarHoja));
  } else if (hoja.mostrandoCarreras) {
    pie.append(boton('Cancelar', 'btn btn-secundario', cerrarHoja), boton('Guardar sin carrera', 'btn btn-secundario', () => elegirCarrera('')));
  }
}

function elegirCarrera(carrera) {
  const { modo, ctx } = hoja;
  if (modo === 'editar') {
    const r = ctx.registro;
    r.carrera = carrera;
    r.facultad = carrera ? facultadDe(carrera) : '';
    if (guardarDatos()) aviso(`N.º ${nro(r.n)}: ${carrera || 'sin carrera'}`, 'ok');
    else aviso('No se pudo guardar el cambio.', 'error');
    pintarTodo();
    cerrarHoja();
    return;
  }
  const r = registrar({ codigo: ctx.codigo, raw: ctx.raw, formato: ctx.formato, carrera });
  cerrarHoja();
  if (r) confirmarRegistro(r);
}

async function eliminarDesdeHoja() {
  const r = hoja.ctx.registro;
  const ok = await confirmar({
    titulo: `¿Eliminar el ingreso N.º ${nro(r.n)}?`,
    texto: `${r.codigo} · ${r.carrera || 'Sin carrera'} · ${hora(r.ts)}. No se puede deshacer.`,
    boton: 'Eliminar',
  });
  if (!ok) return;
  estado.datos.registros = estado.datos.registros.filter((x) => x.id !== r.id);
  guardarDatos();
  pintarTodo();
  cerrarHoja();
  aviso(`Ingreso N.º ${nro(r.n)} eliminado`);
}

function cerrarHoja() {
  const dlg = $('dlgHoja');
  if (dlg.open) dlg.close();
}

function abrirEdicion(id) {
  const r = estado.datos.registros.find((x) => x.id === id);
  if (r) abrirHoja('editar', { codigo: r.codigo, registro: r });
}

// ---------- Confirmación ----------
function confirmar({ titulo, texto, boton = 'Eliminar', escribir = '' }) {
  const dlg = $('dlgConfirmar');
  const entrada = $('confInput');
  const aceptar = $('confAceptar');
  $('confTitulo').textContent = titulo;
  $('confTexto').textContent = texto;
  $('confCampo').hidden = !escribir;
  $('confEtq').textContent = escribir ? `Escribe ${escribir} para confirmar` : '';
  entrada.value = '';
  entrada.oninput = () => { aceptar.disabled = entrada.value.trim().toUpperCase() !== escribir; };
  aceptar.textContent = boton;
  aceptar.disabled = !!escribir;
  dlg.returnValue = '';
  return new Promise((resolver) => {
    dlg.addEventListener('close', () => resolver(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

// ---------- Pintar ----------
function filaRegistro(r) {
  return el('li', {}, el('button', { type: 'button', class: 'fila', 'data-id': r.id },
    el('span', { class: 'fila-n', text: nro(r.n) }),
    el('span', { class: 'fila-codigo', text: r.codigo }),
    el('span', { class: 'fila-hora', text: hora(r.ts) }),
    el('span', { class: 'fila-carrera' + (r.carrera ? '' : ' sin-carrera'), text: r.carrera || 'Sin carrera' })));
}

function pintarCabecera() {
  $('txtEvento').textContent = estado.ajustes.evento || 'Feria';
  $('txtPuerta').textContent = estado.ajustes.puerta || '';
  $('txtTotal').textContent = estado.datos.registros.length;
}

function pintarUltimos() {
  const ultimos = estado.datos.registros.slice(-5).reverse();
  $('listaUltimos').replaceChildren(...ultimos.map(filaRegistro));
  $('ultimosVacio').hidden = ultimos.length > 0;
}

function pintarRegistros() {
  const rs = estado.datos.registros;
  const palabras = sinTildes($('buscarRegistro').value.trim()).split(/\s+/).filter(Boolean);
  const filtrados = rs.filter((r) => {
    const t = sinTildes(`${r.codigo} ${r.carrera || 'sin carrera'} ${nro(r.n)}`);
    return palabras.every((p) => t.includes(p));
  }).reverse();
  $('listaRegistros').replaceChildren(...filtrados.map(filaRegistro));
  $('registrosVacio').hidden = filtrados.length > 0;
  $('registrosVacio').textContent = rs.length ? 'No hay ingresos que coincidan.' : 'Aún no hay ingresos.';

  $('cfIngresos').textContent = rs.length;
  $('cfUnicos').textContent = new Set(rs.map((r) => r.codigo)).size;
  $('cfCarreras').textContent = new Set(rs.map((r) => r.carrera).filter(Boolean)).size;

  const filas = [...conteoPorCarrera()].sort((a, b) => b[1] - a[1]);
  const max = filas[0]?.[1] || 1;
  $('listaResumen').replaceChildren(...filas.map(([c, n]) => el('li', {},
    el('div', { class: 'res-cab' },
      el('span', { class: 'res-nombre' + (c ? '' : ' sin-carrera'), text: c || 'Sin carrera' }),
      el('span', { class: 'res-num', text: n })),
    el('div', { class: 'res-pista' }, el('div', { class: 'res-barra', style: `width:${Math.max(2, (n / max) * 100)}%` })))));
  $('resumenVacio').hidden = filas.length > 0;
}

function pintarAjustes() {
  const a = estado.ajustes;
  $('ajEvento').value = a.evento;
  $('ajPuerta').value = a.puerta;
  $('ajPedirCarrera').checked = a.pedirCarrera;
  $('ajAvisarDuplicados').checked = a.avisarDuplicados;
  $('ajSonido').checked = a.sonido;
  $('ajVibracion').checked = a.vibracion;
  $('ajCarreras').value = gruposATexto(grupos());
  pintarResumenDatos();
}

function pintarResumenDatos() {
  const n = estado.datos.registros.length;
  $('ajResumenDatos').textContent = n === 1 ? 'Hay 1 ingreso guardado en este celular.' : `Hay ${n} ingresos guardados en este celular.`;
}

function pintarVisor() {
  const v = $('visor');
  v.dataset.estado = escaner.estado;
  const mensajes = {
    apagado: 'Apunta la cámara al código de barras o QR del carné.',
    iniciando: 'Encendiendo la cámara…',
    error: escaner.error || 'No se pudo encender la cámara.',
  };
  if (mensajes[escaner.estado]) $('visorMsg').textContent = mensajes[escaner.estado];
  $('btnActivar').hidden = escaner.estado === 'iniciando';
  $('btnActivar').textContent = escaner.estado === 'error' ? 'Reintentar' : 'Activar cámara';
  $('chipTexto').textContent = escaner.estado === 'pausado' ? 'Código leído' : 'Escaneando';
  $('btnLinterna').setAttribute('aria-pressed', String(escaner.linterna));
}

function pintarTodo() {
  pintarCabecera();
  pintarUltimos();
  pintarRegistros();
  pintarResumenDatos();
}

function mostrarVista(vista) {
  estado.vista = vista;
  for (const s of document.querySelectorAll('.vista')) s.hidden = s.id !== `vista-${vista}`;
  for (const p of document.querySelectorAll('.pestana')) {
    if (p.dataset.vista === vista) p.setAttribute('aria-current', 'page');
    else p.removeAttribute('aria-current');
  }
  document.querySelector('.contenido').scrollTop = 0;
  sincronizarCamara();
}

// ---------- Exportar ----------
function nombreArchivo(ext) {
  const slug = (s) => sinTildes(s || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hoy = new Date();
  const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return ['asistencia', slug(estado.ajustes.evento), slug(estado.ajustes.puerta), dia].filter(Boolean).join('_') + '.' + ext;
}

function filasExportacion() {
  return estado.datos.registros.map((r) => ({
    'N.º': r.n,
    'Código': r.codigo,
    'Carrera': r.carrera || 'Sin carrera',
    'Facultad': r.facultad || '',
    'Fecha': fecha(r.ts),
    'Hora': horaLarga(r.ts),
    'Puerta / equipo': r.puerta || '',
    'Tipo de código': etiquetaFormato(r.formato),
    'Texto leído': r.raw ?? r.codigo,
  }));
}

function crearExcel() {
  const libro = XLSX.utils.book_new();
  const asistencia = XLSX.utils.json_to_sheet(filasExportacion());
  asistencia['!cols'] = [6, 14, 44, 16, 12, 10, 20, 28, 30].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(libro, asistencia, 'Asistencia');

  const resumen = [...conteoPorCarrera()].sort((a, b) => b[1] - a[1])
    .map(([c, n]) => ({ 'Carrera': c || 'Sin carrera', 'Facultad': c ? facultadDe(c) : '', 'Ingresos': n }));
  resumen.push({ 'Carrera': 'Total', 'Facultad': '', 'Ingresos': estado.datos.registros.length });
  const porCarrera = XLSX.utils.json_to_sheet(resumen);
  porCarrera['!cols'] = [44, 16, 10].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(libro, porCarrera, 'Por carrera');

  const bytes = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function crearCsv() {
  const filas = filasExportacion();
  const columnas = Object.keys(filas[0]);
  const celda = (v) => {
    const s = String(v ?? '');
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [columnas, ...filas.map((f) => columnas.map((k) => f[k]))]
    .map((linea) => linea.map(celda).join(','))
    .join('\r\n');
  return new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
}

function hayRegistros() {
  if (estado.datos.registros.length) return true;
  aviso('Aún no hay ingresos para exportar.', 'error');
  return false;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  aviso(`Descargado: ${nombre}`, 'ok');
}

async function compartirExcel() {
  if (!hayRegistros()) return;
  const nombre = nombreArchivo('xlsx');
  const archivo = new File([crearExcel()], nombre, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  try {
    await navigator.share({ files: [archivo], title: nombre });
  } catch (err) {
    if (err?.name !== 'AbortError') aviso('No se pudo compartir. Usa “Descargar Excel”.', 'error');
  }
}

function puedeCompartirArchivos() {
  try {
    const prueba = new File(['x'], 'prueba.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return !!navigator.canShare?.({ files: [prueba] });
  } catch {
    return false;
  }
}

// ---------- Eventos ----------
function enlazarEventos() {
  document.addEventListener('pointerdown', prepararAudio, { once: true });

  for (const p of document.querySelectorAll('.pestana')) p.addEventListener('click', () => mostrarVista(p.dataset.vista));
  for (const b of document.querySelectorAll('[data-ir]')) b.addEventListener('click', () => mostrarVista(b.dataset.ir));

  $('btnActivar').addEventListener('click', () => {
    prepararAudio();
    escaner.deseada = true;
    try { localStorage.setItem(CLAVE_CAMARA, '1'); } catch {}
    if (escaner.estado === 'error') escaner.estado = 'apagado';
    sincronizarCamara();
  });
  $('btnApagar').addEventListener('click', () => {
    escaner.deseada = false;
    try { localStorage.setItem(CLAVE_CAMARA, '0'); } catch {}
    sincronizarCamara();
  });
  $('btnLinterna').addEventListener('click', alternarLinterna);
  $('btnCambiarCam').addEventListener('click', cambiarCamara);

  $('btnManual').addEventListener('click', () => {
    $('inpManual').value = '';
    $('dlgManual').showModal();
  });
  $('btnManualCancelar').addEventListener('click', () => $('dlgManual').close());
  $('frmManual').addEventListener('submit', (e) => {
    e.preventDefault();
    const valor = $('inpManual').value.trim();
    if (!valor) return;
    $('dlgManual').close();
    prepararAudio();
    procesarCodigo(valor, 'MANUAL');
  });

  $('btnFoto').addEventListener('click', () => $('inpFoto').click());
  $('inpFoto').addEventListener('change', (e) => {
    leerFoto(e.target.files?.[0]);
    e.target.value = '';
  });

  // Hoja de carrera
  const elegirDesde = (e) => {
    const b = e.target.closest('[data-carrera]');
    if (b) elegirCarrera(b.dataset.carrera);
  };
  $('listaCarreras').addEventListener('click', elegirDesde);
  $('recientes').addEventListener('click', elegirDesde);
  $('buscarCarrera').addEventListener('input', pintarCarreras);
  $('btnIgnorarDup').addEventListener('click', cerrarHoja);
  $('btnRegistrarDup').addEventListener('click', () => {
    if (!estado.ajustes.pedirCarrera) {
      elegirCarrera(hoja.ctx.previo.carrera || '');
      return;
    }
    $('hojaEtq').textContent = 'Reingreso · elige la carrera';
    mostrarCarreras(true);
  });
  $('dlgHoja').addEventListener('close', () => {
    hoja.modo = null;
    hoja.ctx = null;
    setTimeout(reanudarLector, 250);
  });
  // Tocar fuera de la hoja la cierra
  for (const id of ['dlgHoja', 'dlgManual']) {
    $(id).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  $('confAceptar').addEventListener('click', () => $('dlgConfirmar').close('ok'));
  $('confCancelar').addEventListener('click', () => $('dlgConfirmar').close('cancelar'));

  // Listas: tocar un ingreso para editarlo
  const editarDesde = (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrirEdicion(b.dataset.id);
  };
  $('listaUltimos').addEventListener('click', editarDesde);
  $('listaRegistros').addEventListener('click', editarDesde);
  $('buscarRegistro').addEventListener('input', pintarRegistros);

  // Exportar
  $('btnExcel').addEventListener('click', () => { if (hayRegistros()) descargar(crearExcel(), nombreArchivo('xlsx')); });
  $('btnCsv').addEventListener('click', () => { if (hayRegistros()) descargar(crearCsv(), nombreArchivo('csv')); });
  $('btnCompartir').addEventListener('click', compartirExcel);

  // Ajustes
  for (const [id, clave] of [['ajEvento', 'evento'], ['ajPuerta', 'puerta']]) {
    $(id).addEventListener('input', (e) => {
      estado.ajustes[clave] = e.target.value.trim();
      guardarAjustes();
      pintarCabecera();
    });
  }
  for (const [id, clave] of [['ajPedirCarrera', 'pedirCarrera'], ['ajAvisarDuplicados', 'avisarDuplicados'], ['ajSonido', 'sonido'], ['ajVibracion', 'vibracion']]) {
    $(id).addEventListener('change', (e) => {
      estado.ajustes[clave] = e.target.checked;
      guardarAjustes();
    });
  }
  $('btnGuardarCarreras').addEventListener('click', () => {
    const gs = textoAGrupos($('ajCarreras').value);
    if (!gs.length) {
      aviso('La lista está vacía. Escribe al menos una carrera.', 'error');
      return;
    }
    estado.ajustes.carreras = gs;
    guardarAjustes();
    $('ajCarreras').value = gruposATexto(gs);
    aviso(`Lista guardada: ${gs.reduce((n, g) => n + g.carreras.length, 0)} carreras`, 'ok');
  });
  $('btnRestaurarCarreras').addEventListener('click', () => {
    estado.ajustes.carreras = null;
    guardarAjustes();
    $('ajCarreras').value = gruposATexto(CARRERAS_UTP);
    aviso('Se restauró la lista de carreras UTP', 'ok');
  });
  $('btnBorrarTodo').addEventListener('click', async () => {
    const n = estado.datos.registros.length;
    if (!n) {
      aviso('No hay ingresos que borrar.');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Borrar todos los ingresos?',
      texto: `Se eliminarán los ${n} ingresos de este celular. Descarga el Excel antes si lo necesitas.`,
      boton: 'Borrar todo',
      escribir: 'BORRAR',
    });
    if (!ok) return;
    estado.datos = { seq: 0, registros: [] };
    guardarDatos();
    pintarTodo();
    aviso('Se borraron todos los ingresos');
  });

  // Instalar como app
  let eventoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    $('btnInstalar').hidden = false;
  });
  $('btnInstalar').addEventListener('click', async () => {
    if (!eventoInstalar) return;
    eventoInstalar.prompt();
    await eventoInstalar.userChoice.catch(() => {});
    eventoInstalar = null;
    $('btnInstalar').hidden = true;
  });

  document.addEventListener('visibilitychange', () => {
    sincronizarCamara();
    if (document.visibilityState === 'visible' && escaner.estado === 'activo') pedirPantallaEncendida();
  });
}

// ---------- Inicio ----------
function iniciar() {
  enlazarEventos();
  pintarAjustes();
  pintarTodo();
  $('btnCompartir').hidden = !puedeCompartirArchivos();

  if (typeof Html5Qrcode === 'undefined') {
    escaner.estado = 'error';
    escaner.error = 'No se pudo cargar el lector de códigos. Recarga la página con internet.';
  } else if (!window.isSecureContext) {
    escaner.estado = 'error';
    escaner.error = 'La cámara solo funciona si la app se abre desde una dirección https://.';
  } else {
    let recordada = false;
    try { recordada = localStorage.getItem(CLAVE_CAMARA) === '1'; } catch {}
    escaner.deseada = recordada;
  }
  pintarVisor();
  sincronizarCamara();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Sin modo sin conexión:', err));
  }
}

iniciar();
