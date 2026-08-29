# CLAUDE.md

Este archivo es el **mapa del monorepo**: lo transversal (base de datos, despliegue,
VPS, variables de entorno, reglas que valen en los tres sitios). **El detalle de cada
paquete vive en su propio `CLAUDE.md`** y Claude Code lo carga solo cuando se trabaja
en esa carpeta:

| Archivo | Qué contiene |
|---|---|
| `CLAUDE.md` (este) | Visión general, base de datos compartida, latencia de Mongo, `cld()`/`videoPlayUrl`, comandos, VPS y despliegue, variables de entorno, orden de despliegue, tests, nginx |
| `chat-app-backend/CLAUDE.md` | API, Socket.io, auth, Biblia (versiones y copyright), `/upload`, `/public`, reels backend, encuestas, popups, limpieza de Cloudinary |
| `chat-app-frontend/CLAUDE.md` | App móvil (Expo): arquitectura, gestos, temas, notas de voz, YouTube en WebView, gotchas de New Architecture, protocolo de clonado de pantallas |
| `holy_app/CLAUDE.md` | Web (repo aparte): feed y posts, reels/historias en la web, seminario, materiales, contabilidad y socios, PayPal, correos, push web, póster de versículos |

**Al añadir una regla, va al archivo del paquete que la aplica.** Este solo crece si
la regla afecta a dos o más paquetes a la vez.

---

## Reglas espejadas — dónde está la copia que hay que editar también

Hay lógica **duplicada a propósito** entre la app móvil y la web (no comparten
paquete). Cada una de estas reglas dice "al tocarlas, editar las dos"; aquí está el
índice para no perderlas al trabajar en un solo lado. El texto completo está en el
archivo indicado.

| Regla | Copias | Texto completo |
|---|---|---|
| `cld()` — servir imágenes de Cloudinary con transformación | `chat-app-frontend/src/lib/cldImage.ts` ↔ `holy_app/frontend/src/lib/cldImage.js` | **aquí abajo** |
| `videoPlayUrl` / `videoThumbUrl` — MP4 para iOS y póster del video | mismos dos archivos | **aquí abajo** |
| Formato de texto del chat (`*negrita*`, `_cursiva_`) | `chatFormat.ts` ↔ `extraLinkChat.js` | **aquí abajo** |
| Banner de correo sin verificar | `EmailNotVerifiedBanner.tsx` ↔ `EmailNotVerifiedNotice.jsx` | **aquí abajo** |
| Póster de versículos (medidas, fuentes, plantillas) | `versePosterLayout.ts` + `VerseImageSheet.tsx` ↔ `posterLayout.js` + `versePoster.js` + `VerseImageModal.jsx` | `holy_app/CLAUDE.md` |
| Notas de pasaje / elegir varios versículos | `useBibleStore.ts` ↔ `bibleService.js` | `holy_app/CLAUDE.md` |
| Referencia de un pasaje bíblico (`normalizeVerses`) | `backend/utils/biblePassage.js` ↔ `frontend/src/lib/biblePassage.js` | `holy_app/CLAUDE.md` |
| Subtítulos de YouTube (`unloadModule`) | `YouTubeEmbed.tsx` ↔ `lib/ytCaptions.js` | `holy_app/CLAUDE.md` |
| `isVideoUrl` — decidir si un adjunto es video | `postMedia.ts` ↔ `fileName.js` | `holy_app/CLAUDE.md` |
| `UploadBar` — barra de subida | `UploadBar.tsx` ↔ `UploadBar.jsx` | `holy_app/CLAUDE.md` |
| Acceso de socio a materiales (`materialAccess`) | `backend/utils/` ↔ `frontend/src/lib/` | `holy_app/CLAUDE.md` |
| Archivos de una clase de seminario (`seminarFiles`) | `backend/utils/` ↔ `frontend/src/lib/` | `holy_app/CLAUDE.md` |
| Dinero (`money.js`), métodos de gasto y de ofrenda | `backend/utils/` ↔ `frontend/src/lib/` | `holy_app/CLAUDE.md` |
| Órdenes canónicos de la Biblia — **TRES** espejos | `bibleNames.ts` ↔ `constants/bible.ts` ↔ `bibleOrder.js` | `chat-app-backend/CLAUDE.md` |
| Borrado de un asset de Cloudinary con recuento de referencias | `mediaCleanup.ts` ↔ `cloudinaryDelete.js` | `chat-app-backend/CLAUDE.md` |
| Política de popups de inicio | `dailyPopupService.ts` ↔ `popupPolicy.js` | `chat-app-backend/CLAUDE.md` |
| Topes de tamaño de `/upload` (`MAX_MB`) | `uploadController.ts` ↔ `utils/chatFiles.js` | `chat-app-backend/CLAUDE.md` |
| Extracción de enlaces de un post (`&nbsp;` de Quill) | `linkMeta.ts` ↔ `extraLinks.js` | `chat-app-backend/CLAUDE.md` |
| Colores del nombre del remitente (`nameColor`) | `MessageBubble.tsx` ↔ `messages/Message.jsx` | `chat-app-frontend/CLAUDE.md` |

---

## Project overview

**HolyChat** — WhatsApp-like mobile chat app (React Native/Expo) with a Christian/religious community layer: group activities (fasting, vigils, prayer), activity commitments with timezone-aware push reminders, prayer requests, in-app Bible reader, and PayPal offerings/subscriptions.

Monorepo structure:
- `chat-app-backend/` — Node.js + Express + Socket.io + MongoDB API (TypeScript)
- `chat-app-frontend/` — React Native Expo 54 app (TypeScript). Carpeta normal dentro de este repo (antes era submódulo; se integró el 2026-06-20 porque no tenía remoto propio). Los cambios de la app se commitean directo en `chatApp`; se despliega con `eas update`.
- `holy_app/` — **red social web** (Node/Express + React) que **comparte la misma base de datos** que la app móvil. Es su propio repo git (no parte de este). Ver "Base de datos unificada".

## Imágenes de Cloudinary — SIEMPRE servirlas con `cld()`

Hasta 2026-08-04 no se usaba **ninguna** transformación: se subía el archivo original y se pintaba el `secure_url` crudo, así que un avatar de 46dp se descargaba como la foto de 3000px que subió el usuario. Medido contra la cuenta real (`drojpkloa`), una portada de material de 2.129 KB baja a **238 KB solo con `f_auto,q_auto` (−89%)** y a **39 KB pidiendo el ancho que se pinta (−98%)**.

**Helper espejado — al tocar las reglas, editar los dos**: `chat-app-frontend/src/lib/cldImage.ts` (móvil) y `holy_app/frontend/src/lib/cldImage.js` (web). Firma: `cld(url, anchoEnDp?, { crop, h })`.

- **Regla: toda imagen de Cloudinary se pinta con `cld(url, ancho)`**, donde `ancho` es el tamaño al que se MUESTRA (dp en móvil, px CSS en web), no el del archivo. Sin ancho aplica solo `f_auto,q_auto` — es el modo seguro cuando no se sabe el tamaño (visores a pantalla completa, contenedores fluidos).
- **Solo toca `/image/upload/`**. Devuelve la URL intacta si no es de Cloudinary (Pexels, YouTube, `blob:`, `/avatar.png`, avatares de Google), si es `/video/upload/` o `/raw/upload/` (los documentos se romperían), o si ya trae transformaciones (el póster de video de `MessageBubble` las pone a mano).
- **El ancho se redondea a escalones** (`LADDER`) y se multiplica por el DPR (×3 tope en móvil, ×2 en web). Los escalones existen para que dos dispositivos parecidos compartan la MISMA URL: cada ancho distinto es un asset derivado nuevo, y las transformaciones también se facturan. **Los escalones deben ser idénticos en las dos copias** o cada cliente genera su propio juego de derivados.
- **Abrir/descargar/compartir usa SIEMPRE la URL original**, nunca la de `cld()`: la miniatura del chat va a `cld(item.content, 224)` pero `onDownload(item)` y `Linking.openURL` siguen con `item.content`.
- **Un ancho demasiado pequeño se ve borroso** — es el único modo de estropear la calidad con esto. Al añadir un `<img>`/`<Image>`, leer el tamaño real pintado; si el `className` de Tailwind está en un div padre y no en la imagen, es mejor pasar `cld(url)` sin ancho que adivinar.
- Cómo comprobarlo: abrir la página y leer el DOM (`document.querySelectorAll('img')`), verificando que `pedido >= pintado * devicePixelRatio` para todas. Un `vite build` no detecta ni un ancho corto ni un `cld` sin importar.

Esto es solo la ENTREGA. La subida sigue guardando el original sin transformar (los ~10 `upload_stream`/`upload` de los dos backends no pasan opciones): reduce ancho de banda, no almacenamiento.

## Base de datos unificada (web + móvil)

Desde 2026-06-08, la app móvil (`chat-app-backend`) y la web (`holy_app`) **comparten una única base de datos MongoDB: `chatapp`** (cluster `uyjlwo2`). La base antigua de la web (`Authentication`, cluster `jsfmxek`) quedó **solo como respaldo** — nada la lee ya. Un registro/borrado en cualquiera de las dos apps se refleja en la otra.

**Colección `users` compartida con campos espejo** (cada app usa nombres distintos para lo mismo; se mantienen sincronizados):
- `emailVerified` (móvil) ↔ `isVerified` (web)
- `avatar` (móvil) ↔ `profilePicture` (web)
- La sincronización la hacen hooks `pre('save')` / `pre('findOneAndUpdate')` en **ambos** modelos User (`chat-app-backend/src/models/User.ts` y `holy_app/backend/models/userModel.js`). Al crear/editar usuarios, escribir el campo de tu lado; el hook espeja el otro.
- El modelo User de la web usa `strict: false` (para NO borrar los campos del móvil al guardar), `username` con `sparse: true` (los usuarios del móvil no tienen username) y `email` con `lowercase: true`.

**Colisiones de nombre de colección** (web vs móvil, esquemas distintos): las colecciones de chat de la web se renombraron vía la opción `collection` en sus modelos:
- web `messages` → `web_messages`, `conversations` → `web_conversations`, `reports` → `web_reports`.
- Las `messages`/`conversations`/`reports` de `chatapp` son del **móvil**. No mezclar.

**Login con Google**: el móvil (`googleSignIn`) primero busca por `googleId`; si no hay, cae a buscar por email y adjunta el `googleId` (necesario porque los usuarios migrados de la web nunca guardaron `googleId`). La web hace match por email.

**Borrado de usuario — cascada obligatoria en AMBOS dominios** (al compartir base, borrar deja huérfanos si no se limpia):
- Web: `holy_app/backend/utils/cascadeDeleteUser.js`, llamado desde `deleteUser`.
- Móvil: `chat-app-backend/src/services/userCascade.ts` (`cleanWebDomainReferences`) + lógica de chat en `deleteAccount`.
- Campos por colección al limpiar refs: `posts`(`author`,`likes`,`savedBy`,`comments.user`), `notifications`(`recipient`,`relatedUser`), `petitions`(`userId`,`prayingUsers`), `connectionrequests`(`sender`,`recipient`), `users`(`followers`,`following`,`connections`,`blockedUsers`).

**Scripts de migración/limpieza**: `holy_app/backend/_migration/` (numerados `0_`…`6_`). Contienen URIs de Mongo en texto plano y backups con datos de usuarios → **gitignored, nunca commitear**.

**VPS**: la web corre como PM2 `holy-backend` (puerto 5000) en `/var/www/holy-app/backend`, sirve `holyholyholy.es`. Su `MONGO_URI` apunta a `chatapp`. La app móvil sigue en `chat-backend` (puerto 3000).

## Latencia de la base — cada viaje a Mongo cuesta ~205 ms (medido 2026-08-21)

**El cluster de Atlas está en París y el VPS en São Paulo.** Son ~9.200 km:

```
ac-mb5jyfo-shard-00-00.uyjlwo2.mongodb.net
  -> ec2-65-62-2-141.eu-west-3.compute.amazonaws.com   (AWS París)
VPS 145.223.27.84                                       (Hostinger, São Paulo)
```

Y es el **plan gratuito**: el host real se llama `mtm-aws-euw3-2-m0-11-shard-00-00`
— la `m0` es la pista. CPU compartida, límites de conexión y estrangulamiento.

**La regla práctica: `tiempo de respuesta ≈ (viajes SECUENCIALES a Mongo) × 205 ms`.**
Verificado midiendo cada consulta de `/notifications` con `LOG_LEVEL=debug`: da igual
lo que haga la consulta —un `findOne` por `_id`, un agregado sobre miles de mensajes—
todas tardan ~205 ms. **No son consultas lentas: es la distancia.** Lo que importa al
optimizar un endpoint aquí NO es afinar consultas ni añadir índices, es **reducir el
número de idas y vueltas**: agrupar en `Promise.all` y evitar `populate` anidados
(`.populate({path:'lastMessage', populate:{path:'senderId'}})` son varios viajes él solo).

Esto ya se aplicó en `getNotifications` (14 viajes → ~6, o sea 3,6 s → 1,2 s) y es el
patrón a seguir en cualquier endpoint que se note lento. Hay un test que lo vigila:
`scripts/notificationsPerf.test.mjs`.

**DECISIÓN (2026-08-21): NO se migra el cluster de región.** Mover Atlas a `sa-east-1`
bajaría ese 205 ms a ~2 ms —un factor de ~40 en TODOS los endpoints— pero no arregla
ningún problema que el usuario note: el chat va por WebSocket con actualización
optimista (no espera a Mongo), la app arranca con datos cacheados de Zustand, y
`/notifications` es un sondeo de fondo. Un M0 no se puede cambiar de región: habría que
crear cluster nuevo, migrar con `mongodump`/`mongorestore`, parar el servicio y cambiar
`MONGO_URI` en **los dos** backends a la vez. Riesgo y trabajo real para algo que nadie
percibe. Aplazado a propósito.

**Las dos señales que SÍ obligarían a hacerlo** (vigilar, no tocar hasta entonces):
1. **Almacenamiento del M0 cerca de los 512 MB.** Al llenarse fallan las ESCRITURAS —
   eso sí es una caída real, y forzaría la migración con prisas. Es lo único de esto
   que puede morder sin avisar. Se mira en el panel de Atlas.
2. **`MongoNetworkTimeoutError` / `ReplicaSetNoPrimary` frecuentes** en
   `/root/.pm2/logs/chat-backend-error.log`. A 2026-08-21 son esporádicos y el backend
   reconecta solo; si se vuelven habituales, el sospechoso es el plan M0 compartido,
   no la región.

## Reels e Historias (cortos verticales ≤60 s, 2026-08-24)

Estilo Instagram: historias efímeras (24 h, TTL) + reels permanentes en feed vertical. Dos orígenes: video subido (reutiliza `/upload`) o **enlace de YouTube** (el móvil lo reproduce con `YouTubeEmbed` — ver el apartado siguiente, NO con el embed a pelo; el backend resuelve ID/título/miniatura con `src/lib/youtube.ts` → oEmbed, cacheado 6 h).

- **Backend**: modelo `Reel` (`src/models/Reel.ts`, `expiresAt` con TTL para stories) + `reelController.ts` + rutas `/reels` (todas con auth): `GET /` (feed paginado), `GET /stories` (activas ≤24 h), `POST /` (crear con `videoUrl`/`cloudinaryPublicId` o `youtubeUrl`), `POST /:id/like` (toggle), `POST /:id/view` (una por usuario, `$ne` atómico), `GET /:id/views` (solo autor), `DELETE /:id`, `GET /youtube-meta?url=` (preview del formulario).
- **Móvil**: rutas `app/reels.tsx` (feed vertical, autoplay con `expo-video`, like, paginación), `app/stories.tsx` (visor a pantalla completa con barras de progreso vía `useEvent(player,'timeUpdate')`, tocar lados para avanzar, sheet de viewers para las propias), `app/reel-create.tsx` (grabar con `expo-camera` ≤60 s / galería `expo-image-picker` / pegar enlace YouTube + caption + tipo). Carrusel `StoriesRow` como header de Comunidad + botón Reels.
- **Web (`holy_app`)**: `src/lib/reelService.js` (usa `chatApi`, que ya adjunta el token) + `src/components/reels/` (`StoriesRow` en el feed de Home con `useQuery(["reelStories"])` refrescada cada minuto, `StoryViewer` overlay con `<video>` muted (autoplay exige muted en navegador) o iframe de YouTube, `ReelCreateModal` con file input (duración ≤60 s medida con `video.onloadedmetadata`) o enlace YouTube) + `src/pages/ReelsPage.jsx` (ruta `/reels`, un video a la vez con like y navegación ↑/↓). El visor y el modal viven en `Home.jsx`. (2026-08-24) En el feed de Home hay ahora **carruseles de previo de video**: `VideoPreviewCard` (hover reproduce el video silenciado; miniatura + iframe para YouTube, `<video preload="metadata">` para los subidos) en `StoriesRow` (tarjetas pequeñas `w-28 aspect-[9/16]` bajo el editor) y `ReelsStrip` (tarjetas grandes `w-40 aspect-[9/16]`) intercalado **tras cada 3 publicaciones** (`(i+1)%3===0` en `Home.jsx`; era cada 2 hasta 2026-08-27 — la tira de sugeridos se movió al 4º post para no chocar con él); `SuggestedPeopleStrip` rediseñado.
- **El tipo (`kind`) lo decide DE DÓNDE se pulse "Crear"** (arreglado 2026-08-26).
  Los dos clientes abrían el formulario con `kind: 'reel'` fijo, también al
  pulsar "Crear" dentro de la fila de HISTORIAS: todo lo publicado desde ahí
  nacía como reel y el carrusel de historias se quedaba vacío pasara lo que
  pasara (medido en producción: 4 reels, **0 historias**, y el usuario reportó
  "no se muestran las historias"). Web: `Home.jsx` pasa
  `defaultKind={mediaTab === "stories" ? "story" : "reel"}` **y monta el modal
  solo al abrirlo** — `defaultKind` es el valor inicial de un `useState`, así que
  con el modal siempre montado se quedaba con el tipo de la primera vez (y con el
  borrador anterior dentro). Móvil: `reel-create` lee `kind` de los params y
  `StoriesRow`/`reels.tsx` lo pasan.
- **El feed y la página /reels usan claves de caché DISTINTAS** (`["reelFeed"]` y
  `["reels"]`): al publicar hay que invalidar las dos, o el reel recién creado no
  aparece en el feed hasta recargar.
- **⚠️ Módulos nativos nuevos** (`expo-video`, `expo-camera`, `react-native-webview`): estos reels NO funcionan en Expo Go ni en el APK anterior — requieren `eas build` y reinstalar. Las pantallas se importan perezosamente (expo-router), así que la app vieja arranca bien; solo esas rutas fallarían.
- **Regla de duración**: el cliente mide y topea a 60 s; el backend acepta `durationSeconds` declarado y lo clava a 60. No hay sondeo del archivo.
- **Navegación estilo Facebook en la web (2026-08-26)**: `frontend/src/lib/useSwipeNav.js` (teclado, rueda y deslizar con el dedo) lo usan `StoryViewer` (eje x) y `ReelsPage` (eje y). El gesto exige que el **eje dominante** coincida —si no, un deslizamiento en diagonal salta de historia— y bloquea la rueda 500 ms, porque un solo gesto de trackpad emite decenas de eventos; se desactiva con un modal abierto (comentarios, "quién la vio") o las flechas del teclado navegarían mientras se escribe. **Las flechas visibles son `md:` solamente**: en el móvil se desliza y unos botones ahí taparían el video. Los carruseles usan `components/reels/CarouselRow.jsx`, que mide con `ResizeObserver` (el contenido llega por consulta, no basta medir al montar) y solo enciende la flecha del lado que tiene recorrido. En `StoriesRow`, **"Crear" y "Reels" van FUERA del contenedor que se desplaza**: son accesos, y con unas cuantas historias se perdían de vista.

## Videos que no se veían en iPhone (2026-08-24) — `videoPlayUrl`

Safari/iOS NO reproduce WebM (lo que Android/Chrome suelen subir) → el video se veía negro. Fix espejado: `videoPlayUrl(url)` en `src/lib/cldImage.ts` (móvil) y `holy_app/frontend/src/lib/cldImage.js` (web) — reescribe `/video/upload/` → `/video/upload/f_mp4/` (MP4/H.264, sí compatible con iOS). Solo toca URLs de Cloudinary video; para **descargar/compartir se sigue usando la URL original**. Aplicado en: móvil `MessageBubble` + `group-media/[id]`; web `FileImageVideo`, `FilePreview`, `GroupMediaModal`, `LiveChatPanel`, `Posts`, `FileLibraryModal`.

- **Fuente única**: `chat-app-backend/src/lib/bible/<ID>.json`, con forma `{libro: {capítulo: {versículo: texto}}}` (~4-5 MB, ~10 MB de heap ya parseados → el controlador los carga de forma **perezosa** y cachea). La web NO codifica la lista: la pide a `GET /bible/versions`.
- **Añadir una versión**: dejar el JSON + una línea en `ALLOWED_VERSIONS`/`VERSION_META` (`bibleController.ts`) y en el `VERSION_META` del móvil (`app/(tabs)/bible.tsx` y `src/components/chat/BibleModal.tsx`). **Los nombres de libro del JSON deben ser los de la RVA (español) o los de KJV/WEB (inglés)**, o la vista paralela no podrá emparejar los libros.
- **Retirar una versión** (patrón ya montado, `RETIRED_VERSIONS` en ambos `bibleService`): no basta con quitarla del backend. Hay que (1) migrar la preferencia guardada del usuario (`safeVersion`), (2) **borrar la copia descargada** en su dispositivo/navegador (`purgeRetiredBibles` / `purgeRetiredVersions`) o la seguiría leyendo offline, y (3) dejar que el backend responda con la versión por defecto —nunca 400— a los clientes viejos que la sigan pidiendo (APKs sin OTA).
- Las rutas `/api/bible` de `holy_app` (Mongo) **se eliminaron** junto con sus colecciones `bibles`/`bibleverses`: contenían la RVR1960 y estaban expuestas sin auth.

## Commands

### Backend (`chat-app-backend/`)
```bash
npm run dev      # ts-node-dev with hot reload
npm run build    # tsc → dist/
npm start        # node dist/app.js (production)
```

### Frontend (`chat-app-frontend/`)
```bash
npx expo start           # Metro bundler local (Expo Go — no native modules)
npx expo start --android # Android emulator
eas update --channel preview --message "descripción"  # Deploy JS update (no build needed)
```

## Acceso al VPS: clave SSH, nunca contraseña en un archivo (2026-08-28)

La contraseña de root estuvo un rato en `chat-app-backend/.env` como
`clave_hostinger=`. **Ya no está**: el acceso va por clave SSH.

- Clave **exclusiva de este servidor**: `~/.ssh/id_ed25519_holy` (ed25519). No se
  reutiliza para GitHub ni para nada más, así que revocarla no arrastra ningún
  otro acceso: basta con borrar su línea de `~/.ssh/authorized_keys` en el VPS.
- `~/.ssh/config` define el alias **`holyvps`**, así que en los comandos de
  despliegue basta `ssh holyvps` y `scp … holyvps:/ruta` — sin `root@ip`, sin
  contraseña y sin `-i`.
- **Sin frase de paso**, a propósito: con una, cada despliegue exigiría
  desbloquear el agente a mano y no se podría automatizar. Lo que protege el
  archivo es la cuenta de Windows; por eso la clave es de un solo servidor.
- Comprobar que va por clave y no por contraseña: `ssh -o BatchMode=yes holyvps
  "hostname"`. `BatchMode` PROHÍBE pedir contraseña, así que si responde, es la
  clave.
- La contraseña sigue funcionando en el servidor (no se desactivó el acceso por
  contraseña). Si alguna vez se desactiva (`PasswordAuthentication no` en
  `/etc/ssh/sshd_config`), **antes hay que confirmar que la consola web de
  Hostinger sigue siendo una vía de entrada**: perder la clave sin esa red de
  seguridad deja el servidor inaccesible.
  Medido el 2026-08-28 en `/var/log/auth.log`: **82 intentos fallidos de
  contraseña en 5 días desde 9 IPs distintas**, 30 de ellos contra `root`. Eso es
  lo que cierra desactivarla; contra una clave esos intentos no pueden nada.

**Otra máquina (otro portátil) → SU PROPIA clave, nunca copiar la privada.**
`chat-app-backend/deploy/nueva-maquina-ssh.sh` lo hace: genera la clave ahí, la
autoriza en el VPS y deja el alias `holyvps`. Copiar la clave de un equipo a otro
funciona, pero el secreto viaja y queda copiado donde no se controla, y revocar
el acceso de UN equipo obligaría a revocar el de todos. Con una clave por máquina,
revocar es borrar **una línea** de `~/.ssh/authorized_keys` en el servidor.
**Hay que hacerlo mientras el acceso por contraseña siga habilitado** (el script
entra una vez para dejar la clave); si ya se desactivó, hay que pegar la clave
pública a mano desde la consola web de Hostinger.

## Deploy workflow

### Backend → VPS

```bash
# 1. Compilar local
cd chat-app-backend && npm run build

# 2. Subir al VPS (SIEMPRE incluir src/lib/ — los JSONs de la Biblia no los copia tsc)
scp -r dist/ package.json package-lock.json holyvps:/var/www/chat-backend/
scp -r src/lib holyvps:/var/www/chat-backend/dist/

# 3. En el VPS: instalar deps nuevas si las hay y reiniciar
ssh holyvps "cd /var/www/chat-backend && npm install --production && pm2 restart chat-backend"
```

VPS: `145.223.27.84` · PM2: `chat-backend` (puerto 3000) · URL: `https://api.holyholyholy.es`
La app web existente corre en `holy-backend` (puerto 5000) — no tocar.

**nginx config**: `/etc/nginx/sites-enabled/api-chat` (no `api.holyholyholy.es`). Contiene el proxy a puerto 3000. Para editar: `scp` un archivo local al VPS y luego `nginx -t && systemctl reload nginx`.

**Verificar WebSocket desde terminal** (debe devolver `101`):
```bash
curl.exe -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "https://api.holyholyholy.es/socket.io/?EIO=4&transport=websocket"
```
Si devuelve `400 Missing or invalid Sec-WebSocket-Key` el WebSocket llega al backend (nginx OK). Si devuelve `400 Bad Gateway` o error de nginx, revisar los headers de nginx.

### Frontend → EAS Updates (OTA — no requiere rebuild)

Para cualquier cambio de JS (pantallas, lógica, stores, estilos):
```bash
cd chat-app-frontend
eas update --channel preview --message "descripción del cambio"
```
La app descarga el bundle actualizado al próximo arranque. No hay que reinstalar nada.

### Frontend → EAS Build (solo cuando sea necesario)

Solo hacer build cuando se agregue o quite un **paquete nativo** (LiveKit, WebRTC, cámara, notificaciones, etc.):
```bash
cd chat-app-frontend
eas build --platform android --profile preview
```

**Regla crítica — variables de entorno en builds EAS:** El archivo `.env` está en `.gitignore` y los servidores de EAS nunca lo reciben. Todas las variables `EXPO_PUBLIC_*` deben estar declaradas en `eas.json` bajo `env` en cada perfil de build. Si se agrega una nueva variable de entorno al frontend, agregarla también en `eas.json`.

### Web (`holy_app`) → VPS

Repo aparte (`holy_app`). Backend PM2 `holy-backend` en `/var/www/holy-app/backend`; frontend (Vite/PWA) servido desde `/var/www/holy-app/frontend/dist`.

**Backend web** (no requiere build; reiniciar PM2): subir por `scp` los archivos cambiados a su ruta espejo bajo `/var/www/holy-app/backend/` y luego:
```bash
ssh holyvps "pm2 restart holy-backend"
```

**Frontend web** (requiere build: `npm run build` en `holy_app/frontend` → `dist/`). Subir el dist completo (incluye `sw.js`/`registerSW.js` del PWA) — **estas son las líneas exactas que usa el usuario**:
```bash
cd holy_app/frontend
scp -r dist/* holyvps:/var/www/holy-app/frontend/dist/
ssh holyvps "chmod -R a+rX /var/www/holy-app/frontend/dist"
```
PWA con Service Worker: tras subir puede requerir recarga forzada (Ctrl+Shift+R) para ver el cambio.

**Gotcha PWA — deploys que "no se ven"**: el navegador puede quedarse con un `sw.js` viejo cacheado y servir la app vieja indefinidamente; "borrar datos de navegación" de Chrome NO desregistra el Service Worker (solo "Clear site data" en DevTools o desinstalar la PWA). Fix permanente ya aplicado en nginx (`deploy/nginx-holyholyholy.conf`): `location = /sw.js` y `location = /registerSW.js` con `Cache-Control: no-cache` → cada visita revalida el SW. Para diagnosticar: confirmar primero que el SERVIDOR ya sirve el bundle nuevo (`curl` a index.html → ver el hash `index-*.js` → `curl` al bundle → grep de una clase única del cambio); si el servidor ya lo tiene, es caché del cliente, no el deploy.

**APK de la app móvil (página /descargar)**: se sirve desde `/var/www/holy-app/downloads/HolyChat.apk` (carpeta ESTABLE, **fuera de `dist/`** para que los deploys limpios no lo borren) vía `location /downloads/` en nginx. Para publicar una versión nueva: sacar la URL del APK de `eas build:list` (Application Archive URL) y `scp` a esa ruta. **No vive dentro de `dist/`.**

## Tipos de mensaje nuevos (leer antes de añadir uno)

Al estrenar `type: 'contact'` (2026-07-09) el mensaje se guardaba bien pero **no se veía en ningún cliente**. Tres trampas, todas vuelven a morder con el próximo tipo:

1. **Desplegar el backend ANTES que los clientes.** Con el enum viejo de `Message.type`, `Message.create` lanza `ValidationError`, el `try/catch` de `message:send` se lo traga y el envío se descarta en silencio. La app entretanto dice "enviado": la confirmación es optimista, no espera al servidor (no hay `ack`).
2. **Móvil — burbuja invisible**: `MessageBubble` renderiza por rama (`isImage`/`isAudio`/…). Un tipo sin rama produce una burbuja de altura cero, indistinguible de "el mensaje no llegó". Hay una rama de respaldo `isUnknownType` → "Actualiza la aplicación"; mantenerla.
3. **Web — el mensaje ni se monta**: `Messages.jsx` solo renderiza `<Message>` si hay `files` o `message` (texto). Los mensajes de llamada se salvan por casualidad (su `content` es `"audio"`/`"video"`). El guardia acepta ahora cualquier `type !== "text"`; **no vaciar `message` en `adaptMessage`** para un tipo nuevo (es lo que hizo desaparecer los contactos).

Sitios a actualizar al añadir un tipo: `Message.ts` (enum + campos), `message:send`, `previewOf` (`notificationController.ts`), preview push en `socketHandler.ts`, `lastMsgPreview` (`chats.tsx`), `lastMessagePreview` (`Conversation.jsx` web), `ReplyPreview` en ambos clientes.

## Formato de texto del chat (*negrita*, _cursiva_, ~tachado~)

Parser espejo en `chat-app-frontend/src/utils/chatFormat.ts` (app) y `holy_app/frontend/src/utils/extraLinkChat.js` (web) — al tocar las reglas, editar los dos. Soporta `*negrita*` y `**negrita**`, `_cursiva_`, `~tachado~`, anidados; el interior no puede empezar/terminar en espacio ni contener saltos de línea (igual que WhatsApp).

**El recorte de "Ver más" (250 caracteres) se aplica DESPUÉS de formatear, nunca antes.** Recortar el texto crudo partía en dos un `*negrita*` largo: el delimitador de cierre caía detrás del corte, se perdía la pareja y el mensaje se veía sin formato hasta expandirlo. Ahora se formatea el texto completo y se gasta un presupuesto de caracteres **visibles** al emitir los trozos (`takeText`), así las etiquetas siempre acaban cerradas. Las URLs y las menciones no se parten: entran enteras o no entran.

## Correo sin verificar — no bloquea nada (2026-07-18)

Antes las dos apps hacían cosas opuestas con el mismo usuario: la web lo dejaba entrar sin más y la app respondía **403** en el login. Quien se registraba por la web e ignoraba el correo quedaba fuera de la app **para siempre y sin explicación**. Se unificó por lo blando: **verificar ya no es requisito en ninguna de las dos.**

- **App**: se quitó el bloqueo de `login` (`chat-app-backend/src/controllers/authController.ts`). Ojo: ese bloque además **reenviaba el código en CADA intento de login** — un correo por intento.
- `login`, `verifyEmail` y `googleSignIn` devuelven ahora `emailVerified` dentro de `user`; se guarda en `AuthUser` del store.
- **El aviso está duplicado y hay que editar los dos**: `holy_app/frontend/src/components/EmailNotVerifiedNotice.jsx` (en el perfil) y `chat-app-frontend/src/components/EmailNotVerifiedBanner.tsx` (en Ajustes).
- **El aviso no puede amenazar con consecuencias que no existen.** El texto anterior decía "necesitas verificarlo para entrar en la app móvil" y dejó de ser cierto en cuanto se quitó el 403. Ahora solo explica para qué sirve (recuperar la cuenta) y ofrece reenviar.
- **El banner de la app solo se muestra si `emailVerified === false`**, nunca con `undefined`: las sesiones guardadas por APKs anteriores no traen el campo y `loadToken` restaura el usuario de SecureStore **sin volver a pedir `/auth/me`** — o sea que el campo solo llega al hacer login de nuevo.
- En la web, el middleware `verifiedOnly` existe pero **no está aplicado a ninguna ruta**; no confundir su existencia con que haya restricciones.
- Se borró `EmailVerificationCard.jsx` (ocupaba lo alto del feed, estaba en inglés, y su botón "Deny" usaba `useState(true)` → **reaparecía en cada recarga**). Se le mostraba a 3 usuarios de 520.

## Tests — los únicos del repo (`npm test` en cada paquete)

No hay runner ni CI: son ficheros de `node:test` que se ejecutan a mano. **Al tocar cuentas, socios o la gráfica, correrlos.**

| Paquete | Qué cubre |
|---|---|
| `holy_app/frontend` | rangos y comparativas, libro de cuentas (duplicados, anulaciones, reembolsos parciales, monedas, CSV), render real de la gráfica, de las dos páginas de admin y del guarda `RequireAdmin`, extracción de enlaces (`extraLinks`) y render de los carruseles/visores de reels (`reelsUi`) |
| `holy_app/backend` | esquema de cuotas de socio, métricas comprometido/cobrado/retraso, esquema de gastos y conversión de dinero |
| `chat-app-backend` | reembolsos de PayPal, comisiones, códigos de un solo uso (caducidad/bloqueo/hasheo), límites de auth contra un servidor HTTP real, contrato de variables de entorno, y el logger (importa de `dist/`, así que compila primero) |

`frontend/scripts/jsx-loader.mjs` es lo que permite importar `.jsx` desde Node sin Vite: compila JSX con esbuild, resuelve los imports sin extensión y sustituye `import.meta.env`. **Un `vite build` compila igual una página que revienta al pintarse** — por eso las pruebas de render montan los componentes con `react-dom/server`. En SSR no corren los efectos, así que lo que se prueba es el estado inicial (sin datos).

## Environment variables

### Backend (`chat-app-backend/.env`)
```
PORT=3000
MONGO_URI=
JWT_SECRET=
JWT_REFRESH_SECRET=
GOOGLE_WEB_CLIENT_ID=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_PLAN_SUB_5_ID=
PAYPAL_PLAN_SUB_10_ID=
PAYPAL_PLAN_SUB_20_ID=
PAYPAL_PLAN_SUB_50_ID=
PAYPAL_PLAN_SUB_100_ID=
PAYPAL_PLAN_SUB_200_ID=
BACKEND_URL=https://api.holyholyholy.es
FRONTEND_URL=https://holyholyholy.es
WEB_JWT_SECRET=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:info@holyholyholy.es
PEXELS_API_KEY=
```

**Ojo con los nombres**: son `MONGO_URI` (no `MONGODB_URI`) y `GOOGLE_WEB_CLIENT_ID`
(no `GOOGLE_CLIENT_ID`). Estuvieron mal escritos aquí hasta 2026-08-21 y esta
sección es lo que un agente lee como verdad: con el nombre equivocado, "arreglar"
el código para que encaje con la doc tumba el arranque (`config/database.ts` lanza
`MONGO_URI no está definido en .env`). El contrato real lo fija
`scripts/env.test.mjs`, que compara `.env.example` contra los `process.env.*` del código.

`PEXELS_API_KEY` (opcional): clave gratuita de https://www.pexels.com/api/ para los fondos de foto de "compartir versículo como imagen". Solo el backend la usa (`/public/photos` busca, `/public/photo?url=` hace de proxy CORS para que html2canvas capture la foto sin manchar el canvas; el host se valida contra pexels/pixabay para evitar SSRF). Sin la clave, `/public/photos` devuelve 503 y la pestaña "Foto" del modal muestra un aviso; los temas de color siguen funcionando.

### Frontend (`chat-app-frontend/.env` — solo para desarrollo local)
```
EXPO_PUBLIC_API_URL=https://api.holyholyholy.es
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=4776256007-bisf5j580pn4se9tuhil5bkkc10u5umg.apps.googleusercontent.com
```
**Para builds EAS estas variables viven en `eas.json` bajo `env`, no en `.env`.**

## Convenciones de infraestructura y despliegue

- **nginx WebSocket — headers obligatorios**: Para que Socket.io funcione a través del proxy nginx, el bloque `location /` DEBE incluir:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
  Sin estos headers, el WebSocket no hace upgrade y todos los eventos de socket fallan silenciosamente (los mensajes parecen enviarse localmente con optimistic update pero no persisten en MongoDB). La sintoma clave: mensajes desaparecen al reiniciar la app.
- **nginx `X-Forwarded-For` — sin esto el límite de intentos castiga a TODA la comunidad** (faltaba hasta 2026-08-21). El mismo `location /` debe incluir:
  ```nginx
  proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  ```
  nginx hace de proxy a `localhost:3000`, así que sin esa cabecera **todas** las peticiones llegan con la IP del proxy: `req.ip` es `127.0.0.1` para todo el mundo y los límites de `middleware/rateLimit.ts` se convierten en un cubo ÚNICO compartido — 20 logins cada 15 min para los ~500 usuarios juntos, y el primero que agote el cupo deja fuera al resto. `app.set('trust proxy', 1)` (en `app.ts`) es la otra mitad: sin él Express ignora la cabecera aunque llegue.
  `$proxy_add_x_forwarded_for` **añade** la IP real al final de lo que mandara el cliente; combinado con `trust proxy: 1` Express lee esa última entrada, así que nadie se salta el límite mandando su propia cabecera.
  Hay red de seguridad: si la cabecera NO llega, `rateLimit.ts` **desactiva el límite** y escribe un error (una sola vez) en vez de bloquear a todos — se prefiere perder la capa de volumen a dejar la app inservible; la protección del ataque real es el contador por cuenta de `authCodes.ts`, que no depende de la IP.
  **Comprobarlo sin gastar cupo**: una petición y mirar las cabeceras. Si salen `RateLimit-Policy`/`RateLimit`, la IP real está llegando; si NO salen, la red de seguridad está actuando y nginx sigue mal.
  ```powershell
  curl.exe -s -i -X POST -H "Content-Type: application/json" -d "{}" https://api.holyholyholy.es/auth/verify-email
  ```
  El arreglo está guionizado y es idempotente: `chat-app-backend/deploy/fix-nginx-xff.sh` (copia de seguridad + `nginx -t` + revierte solo si no valida).
- El archivo `.env` del frontend **no llega a EAS**. Cualquier `EXPO_PUBLIC_*` nueva debe añadirse también en `eas.json` bajo `env` en cada perfil.
- `src/lib/` contiene los JSONs de la Biblia — TypeScript no los copia al compilar. Siempre subir junto con `dist/` al VPS.

---

## Plan de distribución de la app (decidido 2026-06-01, arranca 2026-06-02)

Estrategia de 3 pasos para compartir HolyChat **fuera de la Play Store** (empezar por el paso 1):

1. **EAS Internal Distribution** — generar el APK/build con `eas build --platform android --profile preview`; EAS devuelve un **link + QR** para compartir por WhatsApp y grupos. Rápido y gratis. *(Empezar aquí, desde mañana 2026-06-02.)*
2. **Botón de descarga en la web** — en paralelo, alojar el APK en el VPS existente (`holyholyholy.es`) y poner un botón "Descargar app" para una distribución más "oficial". Mismo APK; gestión de versiones manual.
3. **Tiendas alternativas (más adelante)** — considerar **Samsung Galaxy Store** (público mayormente Samsung) o **Amazon Appstore** para crecer y dar más confianza. Opcional, no urgente.

Nota: la Play Store queda como opción futura (cuota única $25, requiere AAB, política de privacidad, y revisar el tema PayPal/ofrendas vs Google Play Billing — las donaciones de organizaciones sin ánimo de lucro pueden estar exentas).

## Pending work

- **Migrar expo-av** — `expo-av` muestra warning de deprecación en SDK 54. Migrar a `expo-audio` y `expo-video` en algún momento (no urgente).
