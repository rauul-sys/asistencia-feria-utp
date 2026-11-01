# Asistencia Feria UTP

App web para el celular que registra el ingreso a la feria: escaneas el código de barras o QR del carné, eliges la carrera y queda guardado con número, fecha y hora. Funciona sin internet y exporta a Excel.

## Cómo se usa en la feria

1. Abre la app en el celular (ver "Publicarla" abajo) y toca **Activar cámara**. Acepta el permiso.
2. Apunta al código del carné. Al leerlo, el celular suena, vibra y aparece la lista de carreras.
3. Toca la carrera (o búscala escribiendo, por ejemplo "sistemas"). Se guarda y la cámara sigue escaneando.
   - Las últimas carreras usadas salen arriba como atajos.
   - Si el código ya había ingresado, avisa con la hora y el número de su primer ingreso.
4. Si un carné no se lee: **Escribir código** o **Leer foto**.
5. En **Registros** ves el total, los estudiantes únicos, el conteo por carrera y la lista completa. Toca un ingreso para cambiarle la carrera o eliminarlo.
6. **Descargar Excel** genera un archivo con dos hojas: *Asistencia* (un ingreso por fila) y *Por carrera* (resumen con total). En Android también puedes usar **Compartir Excel** para mandarlo por WhatsApp, Drive o correo.

## Antes del evento

- En **Ajustes** pon el nombre del evento y de la puerta. Si usan varios celulares, cada uno con una puerta distinta ("Puerta 1", "Puerta 2"): al final juntas los Excel y sabes de dónde vino cada ingreso.
- La lista de carreras es la de pregrado de utp.edu.pe. Se puede editar en **Ajustes → Carreras** (una por línea; `# Nombre` para la facultad).
- Instálala en el celular (Android: menú ⋮ → *Instalar app*; iPhone: Compartir → *Agregar a inicio*) y ábrela una vez con internet. Desde ahí funciona sin conexión.
- Haz una prueba con tu propio carné para ver qué tipo de código tiene y que se lea bien.

## Dónde quedan los datos

Los ingresos se guardan **solo en ese celular**, dentro del navegador. No se envían a ningún servidor. Por eso:

- Descarga el Excel cada cierto tiempo como respaldo.
- No borres los datos del navegador ni desinstales la app hasta haber exportado.
- **Ajustes → Borrar todos los ingresos** deja la app lista para otro evento (pide escribir BORRAR).

## Publicarla

La cámara del celular solo funciona si la app se abre desde una dirección `https://`. La forma más simple y gratuita es GitHub Pages: se sube esta carpeta a un repositorio y queda en `https://<usuario>.github.io/<repositorio>/`.

Cuando cambies algo, sube el número de `CACHE` en `sw.js` (por ejemplo `asistencia-utp-v2`) para que los celulares descarguen la versión nueva.

## Probarla en la PC

```bash
node servidor.js
```

Abre http://localhost:8080. En localhost la cámara web de la PC también sirve para escanear.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Pantallas de la app |
| `styles.css` | Diseño (tema claro y oscuro) |
| `app.js` | Cámara, registro, carreras y exportación |
| `carreras.js` | Lista de carreras UTP por defecto |
| `sw.js` | Guarda la app para usarla sin internet |
| `lib/` | Lector de códigos (html5-qrcode 2.3.8) y Excel (SheetJS 0.18.5) |
| `servidor.js` | Servidor local para pruebas |
