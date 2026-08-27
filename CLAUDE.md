# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**HolyChat** — WhatsApp-like mobile chat app (React Native/Expo) with a Christian/religious community layer: group activities (fasting, vigils, prayer), activity commitments with timezone-aware push reminders, prayer requests, in-app Bible reader, and PayPal offerings/subscriptions.

Monorepo structure:
- `chat-app-backend/` — Node.js + Express + Socket.io + MongoDB API (TypeScript)
- `chat-app-frontend/` — React Native Expo 54 app (TypeScript). Carpeta normal dentro de este repo (antes era submódulo; se integró el 2026-06-20 porque no tenía remoto propio). Los cambios de la app se commitean directo en `chatApp`; se despliega con `eas update`.
- `holy_app/` — **red social web** (Node/Express + React) que **comparte la misma base de datos** que la app móvil. Es su propio repo git (no parte de este). Ver "Base de datos unificada".

---

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

---

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

---

---

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

---

## Seminario web (`holy_app`) — gotchas

El "seminario" es una `Activity` con `seminar.enabled` (`activityModel.js`). Toda la lógica vive en `seminarController.js` + `submissionController.js` (backend) y `frontend/src/components/seminario/`.

- **`seminar.studentProgress` embebido — SIEMPRE escribir con updates atómicos**, nunca `findById`+`.save()` (reescribe el doc y pisa cambios concurrentes de otros alumnos → lost-update). Patrón: paso 1 crea la entrada del alumno solo si falta (`{ "seminar.studentProgress.user": { $ne: userId } }` + `$push`), paso 2 modifica con `$[s]`/`$[t]` + `arrayFilters`. **OJO**: en `arrayFilters` Mongoose NO castea por esquema → convertir `req.params.userId`/`classId` a ObjectId explícito (`new mongoose.Types.ObjectId`); `req.user._id` ya es ObjectId.
- **Proyección anti-fuga**: los endpoints que NO necesitan el progreso de todos lo excluyen con `.select("-seminar.studentProgress")` (`getActivityById`, `getSeminarDetails`, `getAllActivities` también `-seminar.classes`). El populate de usuarios SIEMPRE con `select` (el campo `password` del User web NO tiene `select:false`).
- **`getActivityById` NO ordena `seminar.classes`** — el reordenar (`reorderSeminarClasses`) cambia el campo `order`, no la posición en el array. Cualquier vista que liste clases desde `/activities/:id` debe ordenar por `order` en cliente (`getSeminarDetails` sí ordena).
- **React Query con `staleTime: 1h` global** (`main.jsx`): tras editar algo, los datos cacheados se muestran hasta refrescar. Fix: invalidar la key concreta en `onSuccess` (no solo la lista — p.ej. `["activity", id]` además de `["activities"]`) o `refetchOnMount: "always"` en la query de la página de destino. Patrón ya aplicado en `SeminarPage`/`AdminStudentProgressPage`/`EditActivityPage`.
- **Enlaces a archivos de Cloudinary**: usar `target="_blank" rel="noopener noreferrer"`. El atributo `download` se ignora en URLs cross-origin → sin `target` el navegador navega la pestaña actual al PDF y "cierra" la web.

---

## Biblia — versiones y copyright (LEER ANTES DE AÑADIR NINGUNA)

**La RVR1960 se retiró el 2026-07-11 y NO se puede volver a añadir sin licencia por escrito.** Su texto es propiedad de Sociedades Bíblicas Unidas (marca registrada; derechos administrados por la American Bible Society). El límite de cita libre es de 500 versículos — compartir versículos sueltos entra; distribuir la Biblia completa, y más aún permitir descargarla para uso offline, no.

Las 34 versiones actuales son **todas de dominio público**: `RV1909` (por defecto), `RVA`, `SSE`, `RV1865` en español; `KJV`, `WEB`, `ASV`, `BBE`, `DARBY`, `YLT`, `ACV`, `ANDERSON`, `CPDV`, `DRC`, `GENEVA1599`, `HAWEIS`, `JPS`, `KJVPCE`, `NOYES`, `OEB`, `OEBUK`, `RNKJV`, `ROTHERHAM`, `RWEBSTER`, `TCNT`, `TYNDALE`, `UKJV`, `WEBSTER` en inglés; y **6 idiomas añadidos el 2026-08-21**: `MARTIN` (francés, David Martin 1744), `SVV` (holandés, Statenvertaling 1637), `ELBERFELDER` (alemán, 1905), `SYNODAL` (ruso, 1876 — trae deuterocanónicos ortodoxos), `ESPERANTO` (Londona Biblio) y `VAMVAS` (griego, 1850). Todas desde `scrollmapper/bible_databases`.

**Sistema de idiomas (2026-08-21)**: cada versión declara `lang` en `VERSION_META` y el orden canónico de los 66 libros se resuelve por idioma desde **tres espejos** — al añadir un idioma, tocar los tres: `chat-app-backend/src/lib/bibleNames.ts` (`BOOK_ORDERS` + `namesFor`), `chat-app-frontend/src/constants/bible.ts` (`CANONICAL_ORDERS` + `langFlag` en `LANG_FLAGS`) y `holy_app/frontend/src/lib/bibleOrder.js` (arrays canónicos registrados en `ORDER_INDEX`; la web normaliza tildes, así que los idiomas entran solos). Los nombres del JSON de cada versión DEBEN coincidir exactamente con los del array de su idioma (verificado 66/66 en el smoke test). La búsqueda del versículo del día y el filtro por testamento usan `namesFor(lang)`; en el móvil la lectura por voz usa el código `lang` directamente y el orden alfabético el `lang` como locale.

**Versiones "solo en línea" (`remote: true`, desde 2026-08-21)**: la `RVR60` (© Sociedades Bíblicas Unidas 1960) NO tiene JSON local ni descarga offline — se sirve verso a verso desde **api.biblia.com** (Faithlife/Logos, key `BIBLIA_API_KEY` en el `.env`, solo en el servidor). Backend: `REMOTE_VERSIONS` en `bibleController.ts` + `src/services/bibliaService.ts` (caché por capítulo, TTL 6 h, máx. 200 LRU — nunca el texto completo). `getBooks`/`getChapters` se sirven de los órdenes canónicos sin llamar a la API; `getVerses`/`searchVerses` la llaman (el pasaje se pide con el nombre de libro EN INGLÉS, mapeado por índice canónico, formato `eachVerse=[VerseNum].[VerseText]`); `/bible/download`, el versículo del día, xrefs y temas **se niegan/degradan** (400/404/vacío). Móvil: el picker muestra "☁️ en línea", se oculta el botón de descarga y se muestra la atribución "Reina Valera 1960 © Sociedades Bíblicas Unidas". La web funciona transparente (usa los mismos endpoints). **Parseo del capítulo**: `raw.split(/(?=\b\d+\.)/)` — el `\b` es imprescindible (sin él, "10." se partía en "1" + "0.").

**Ojo con las versiones parciales** (las biblias históricas no traen todo): `ANDERSON`, `HAWEIS`, `TCNT` son **solo NT**; `TYNDALE` solo Génesis + parte del NT; `JPS` **solo AT** (39 libros); `NOYES` NT + Salmos/Job/profetas; `OEB`/`OEBUK` Salmos + NT; `CPDV`/`DRC` traen los **deuterocanónicos** (73 libros: Tobit, Judit, Sabiduría, Eclesiástico, Baruc, 1-2 Macabeos — salen al final de la lista canónica). La tarjeta del versículo del día se oculta sola (el móvil captura el 404) cuando el pasaje de ese día no existe en la versión elegida.

**Excluidas a propósito** (el propio repo las marca con copyright/GPL, no subirlas): `AKJV`, `JUBILEE2000`, `LITV`, `MKJV` ("Copyrighted"), `KJVA`, `RLT` (GPL por los Strong's), `BSB`, `LEB`, `NHEB*` y `SpaRVG` (Gómez). `SpaRV` del repo es la **misma RV1909** que ya tenemos (solo difiere en corchetes de notas) y `SpaPlatense` (Straubinger, 1962) quedó fuera por duda razonable de copyright (Argentina: 70 años post-mortem).

**Gotcha de calidad (2026-08-21)**: el DARBY de scrollmapper llega con el espacio anterior a "God" eliminado ("AndGod", "ofGod", ",God", "]God"… ~3.900 casos). Se arregló con `/([^ "'\[])(God)/g` → `$1 $2` — los `[God` y `'God` son legítimos y se excluyen. Otros fixes puntuales aplicados en el mismo lote: `RWEBSTER` (8 versos reconstruidos desde Webster + 1 ligadura "fFrom"), `DRC` ("SauI"→"Saul"), `GENEVA1599` ("toAsaph"→"to Asaph"), `TYNDALE` (5 espacios perdidos + "BenIamin"→"Benjamin"), `RNKJV` (1 etiqueta `face="..."` colada en Mt 12:50). Los "pegados" que QUEDAN son ortografía intencional de esas ediciones: `JPS` ("HaShem"/"G-d"), `RNKJV` ("EliYah", יהוה), `UKJV` ("EleloheIsrael", "MeribahKadesh"), `TYNDALE` ("xM" = 10.000 en romano).

**Gotcha de IDs (2026-08-21)**: los ids de versión deben ir en MAYÚSCULAS (`DARBY`, no `Darby`). `getVersionData`/`resolveVersionId` normalizan el parámetro con `.toUpperCase()`, así que un id con minúsculas jamás coincide con `ALLOWED_VERSIONS` y cae en silencio a la RV1909 (los libros salen en español y no hay error). Es lo que pasó al añadir DARBY la primera vez.

---

## Reels e Historias (cortos verticales ≤60 s, 2026-08-24)

Estilo Instagram: historias efímeras (24 h, TTL) + reels permanentes en feed vertical. Dos orígenes: video subido (reutiliza `/upload`) o **enlace de YouTube** (el móvil lo reproduce con `YouTubeEmbed` — ver el apartado siguiente, NO con el embed a pelo; el backend resuelve ID/título/miniatura con `src/lib/youtube.ts` → oEmbed, cacheado 6 h).

- **Backend**: modelo `Reel` (`src/models/Reel.ts`, `expiresAt` con TTL para stories) + `reelController.ts` + rutas `/reels` (todas con auth): `GET /` (feed paginado), `GET /stories` (activas ≤24 h), `POST /` (crear con `videoUrl`/`cloudinaryPublicId` o `youtubeUrl`), `POST /:id/like` (toggle), `POST /:id/view` (una por usuario, `$ne` atómico), `GET /:id/views` (solo autor), `DELETE /:id`, `GET /youtube-meta?url=` (preview del formulario).
- **Móvil**: rutas `app/reels.tsx` (feed vertical, autoplay con `expo-video`, like, paginación), `app/stories.tsx` (visor a pantalla completa con barras de progreso vía `useEvent(player,'timeUpdate')`, tocar lados para avanzar, sheet de viewers para las propias), `app/reel-create.tsx` (grabar con `expo-camera` ≤60 s / galería `expo-image-picker` / pegar enlace YouTube + caption + tipo). Carrusel `StoriesRow` como header de Comunidad + botón Reels.
- **Web (`holy_app`)**: `src/lib/reelService.js` (usa `chatApi`, que ya adjunta el token) + `src/components/reels/` (`StoriesRow` en el feed de Home con `useQuery(["reelStories"])` refrescada cada minuto, `StoryViewer` overlay con `<video>` muted (autoplay exige muted en navegador) o iframe de YouTube, `ReelCreateModal` con file input (duración ≤60 s medida con `video.onloadedmetadata`) o enlace YouTube) + `src/pages/ReelsPage.jsx` (ruta `/reels`, un video a la vez con like y navegación ↑/↓). El visor y el modal viven en `Home.jsx`. (2026-08-24) En el feed de Home hay ahora **carruseles de previo de video**: `VideoPreviewCard` (hover reproduce el video silenciado; miniatura + iframe para YouTube, `<video preload="metadata">` para los subidos) en `StoriesRow` (tarjetas pequeñas `w-28 aspect-[9/16]` bajo el editor) y `ReelsStrip` (tarjetas grandes `w-40 aspect-[9/16]`) intercalado **tras cada 2 publicaciones** (`(i+1)%2===0` en `Home.jsx`); `SuggestedPeopleStrip` rediseñado.
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

## YouTube en el móvil — el embed NUNCA como URL del WebView (2026-08-25)

`source={{ uri: 'https://www.youtube.com/embed/<id>' }}` es lo que produce el **error 153**: así el WebView es el marco superior y el reproductor llega **sin referer**, o sea un embed en un sitio no autorizado. Añadir `mute=1`, `domStorageEnabled` u `originWhitelist` no toca la causa. Lo correcto es servir un **HTML propio con el iframe dentro** y declarar `baseUrl` (el documento pasa a tener ese origen) — es lo que hace `react-native-youtube-iframe`, replicado sin dependencia en `src/components/comunidad/YouTubeEmbed.tsx`.

- **150/152/153 son la misma familia: «embed no autorizado en ESTE contexto»**, y el contexto es el par (origen del documento, host del reproductor). Por eso el componente prueba **contextos en cascada** (`CONTEXTS`): primero `holyholyholy.es` —donde el embed ya funciona en la web—, luego el host `youtube-nocookie.com`, y por último `youtube.com`. Solo si los tres fallan se propaga `onError`.
- **El código de error distingue el diagnóstico**: que llegue un 15x significa que el reproductor CARGÓ (el IFrame API respondió) → no es códecs ni emulador. Un WebView sin códecs da 5 o pantalla negra. El respaldo enseña el número en pantalla a propósito: sin adb es la única forma de saberlo.
- El `userAgent` se fija a Chrome de Android — el del WebView lleva `; wv` y YouTube trata esos embeds distinto.
- **`pointerEvents="none"` en el WebView**: los toques son de las capas de acciones que van encima (me gusta, avanzar historia). Sin eso el WebView se los queda y un toque abre la app de YouTube. Corolario: cualquier respaldo tocable debe ir con `zIndex` **por encima** de la capa de zonas táctiles de `stories.tsx` (que es `zIndex: 10`), o el botón no hace nada.
- El API se carga siempre desde `www.youtube.com/iframe_api`; el host alternativo solo se pasa como opción `host` del `YT.Player`.
- El control (play/pausa, silencio) va por `injectJavaScript`, no recreando el HTML: recrearlo recarga el WebView. El HTML solo se rehace al cambiar de video o de contexto.

**Dos trampas de estas pantallas que dejaban PANTALLA EN BLANCO** (un crash de render no enseña nada en producción):

- **Nada de tocar el reproductor de `expo-video` en la limpieza de un efecto.** `return () => player.pause()` revienta al salir de la pantalla: expo-video ya liberó el objeto nativo y llamar un método sobre un `SharedObject` liberado lanza. Igual `useVideoPlayer('')` para las historias de YouTube — la fuente vacía es inválida; `VideoSource` admite **`null`**, que es lo que hay que pasar cuando no hay video.
- **`scrollToIndex` con índice `-1`** (lo que devuelve `findIndex` si el elemento ya no está en el store) también lanza. Comprobar el rango antes.

**Abrir la lista por el elemento tocado: `initialScrollIndex`, no un efecto.** El carrusel pasa el id (`router.push({ pathname: '/reels', params: { id } })`) y `reels.tsx` lo resuelve con `initialScrollIndex` + `getItemLayout`. Un efecto con `listRef.current?.scrollToIndex(...)` **no funciona** aquí: mientras la pantalla enseña el indicador de carga la `FlatList` no existe, el `?.` se traga la llamada en silencio y el "ya salté" queda marcado. La lista solo se monta cuando la carga terminó, así que en ese momento el índice ya es correcto — es lo que `stories.tsx` hacía bien desde el principio.

**`ErrorBoundary` en `app/_layout.tsx`**: un fallo al pintar cualquier ruta muestra el mensaje del error en vez de dejar la app en blanco. Es el sustituto del logcat — **el adb de BlueStacks no sirve** para diagnosticar (`logcat` y `pull` fallan, y su `HD-Adb` se pelea por el puerto 5037 con el adb del SDK).

## Videos que no se veían en iPhone (2026-08-24) — `videoPlayUrl`

Safari/iOS NO reproduce WebM (lo que Android/Chrome suelen subir) → el video se veía negro. Fix espejado: `videoPlayUrl(url)` en `src/lib/cldImage.ts` (móvil) y `holy_app/frontend/src/lib/cldImage.js` (web) — reescribe `/video/upload/` → `/video/upload/f_mp4/` (MP4/H.264, sí compatible con iOS). Solo toca URLs de Cloudinary video; para **descargar/compartir se sigue usando la URL original**. Aplicado en: móvil `MessageBubble` + `group-media/[id]`; web `FileImageVideo`, `FilePreview`, `GroupMediaModal`, `LiveChatPanel`, `Posts`, `FileLibraryModal`.

- **Fuente única**: `chat-app-backend/src/lib/bible/<ID>.json`, con forma `{libro: {capítulo: {versículo: texto}}}` (~4-5 MB, ~10 MB de heap ya parseados → el controlador los carga de forma **perezosa** y cachea). La web NO codifica la lista: la pide a `GET /bible/versions`.
- **Añadir una versión**: dejar el JSON + una línea en `ALLOWED_VERSIONS`/`VERSION_META` (`bibleController.ts`) y en el `VERSION_META` del móvil (`app/(tabs)/bible.tsx` y `src/components/chat/BibleModal.tsx`). **Los nombres de libro del JSON deben ser los de la RVA (español) o los de KJV/WEB (inglés)**, o la vista paralela no podrá emparejar los libros.
- **Retirar una versión** (patrón ya montado, `RETIRED_VERSIONS` en ambos `bibleService`): no basta con quitarla del backend. Hay que (1) migrar la preferencia guardada del usuario (`safeVersion`), (2) **borrar la copia descargada** en su dispositivo/navegador (`purgeRetiredBibles` / `purgeRetiredVersions`) o la seguiría leyendo offline, y (3) dejar que el backend responda con la versión por defecto —nunca 400— a los clientes viejos que la sigan pidiendo (APKs sin OTA).
- Las rutas `/api/bible` de `holy_app` (Mongo) **se eliminaron** junto con sus colecciones `bibles`/`bibleverses`: contenían la RVR1960 y estaban expuestas sin auth.

## Biblia web (`holy_app`) — orden de libros y compartir posts

- **Orden tradicional (canónico) — SIEMPRE reordenar en cliente.** El backend devuelve los libros con `distinct("book")` / `Object.keys(...)`, que salen en orden **alfabético**, NO canónico. La pestaña "Tradicional" mostraba esa lista alfabética. Fuente única de verdad: `frontend/src/lib/bibleOrder.js` → `orderBooks(books, mode)` (`"traditional" | "alpha"`), con el orden de los 66 libros en ES (RVR1960/RVA: `S. Mateo`, `S.Juan`, etc.) e inglés (KJV/WEB: `Song of Songs`, `Revelation`); normaliza tildes/espacios/puntos y tiene alias (gospels sin "S."), filtra la clave `"lang"` de los payloads offline. Aplicado en `BibleDetail.jsx` (página Biblia — además la navegación Anterior/Siguiente usa una lista `canonicalBooks`, antes saltaba al siguiente libro *alfabético*), `chat/ChatBibleModal.jsx` (chat) y `VerseSelectorModal.jsx` (posts, comentarios y responder comentarios — los tres comparten este componente). Las pestañas Tradicional/A–Z + tamaño de letra se persisten en `localStorage` (`bible_book_order`, `bible_font_size`), compartidas entre todas las superficies.
- **Compartir posts con QR**: el botón "Compartir" de `Posts.jsx` abre `ShareModal.jsx` (mismo componente que la página de materiales) con `url` = `/post/:id` (ruta SPA humana, va en el QR) y `socialUrl` = `/api/share/post/:id` (endpoint OG para previews en WhatsApp/FB). Para mantener el contador "N veces compartido", `ShareModal` acepta un callback opcional `onShared` que dispara al copiar/compartir nativo/botón de red (`beforeOnClick`); `Posts.jsx` pasa `onShared={recordWebShare}`.

---

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

There are no test suites in this project.

---

### Screenshot-to-Code Protocol (UI/UX Cloning)
When I provide a screenshot or mockup image, your absolute priority is to replicate it with pixel-perfect precision inside the frontend (chat-app-frontend/). Follow this exact 4-step reverse-engineering process:

**Visual Breakdown Analysis:**
Layout & Spacing: Identify the flexbox alignment (row/col), padding, margins, and safe area requirements (Android Edge-to-Edge).

**Typography:** Analyze font weights (bold, medium, regular), sizes, and text alignments.

**Component Hierarchy:** Detect headers, avatar placements, input fields, badges, and list items.

**Strict Stack Alignment:**
**Styling:** Use exclusively NativeWind v4 utility classes. Never use inline styles or StyleSheet.create.

**Theming:** Do not hardcode raw colors (e.g., #3B82F6 or bg-blue-500). You MUST use the active theme via the 
useTheme() hook from src/context/ThemeContext.tsx and map values dynamically (e.g., style with custom Tailwind configuration mapping to colors.xxx or apply background/text dynamically).

**Icons:** Use @expo/vector-icons (Lucide, Ionicons, MaterialIcons) checking which icon closest matches the visual reference.

**Performance & Components Mapping:**
If the screenshot shows a scrollable list, implement it using @shopify/flash-list with a realistic estimatedItemSize.
If it displays images or avatars, use expo-image with proper sizing and standard blurhash setups.

**Code Generation Output:**
Provide the fully written React Native component using functional syntax: export function ComponentName() {}.
Do not use generic placeholders or empty // TODO comments. Write the mockup state inline if backend data isn't fully ready yet so the visual result matches the screenshot immediately on render.

## Deploy workflow

### Backend → VPS

```bash
# 1. Compilar local
cd chat-app-backend && npm run build

# 2. Subir al VPS (SIEMPRE incluir src/lib/ — los JSONs de la Biblia no los copia tsc)
scp -r dist/ package.json package-lock.json root@145.223.27.84:/var/www/chat-backend/
scp -r src/lib root@145.223.27.84:/var/www/chat-backend/dist/

# 3. En el VPS: instalar deps nuevas si las hay y reiniciar
ssh root@145.223.27.84 "cd /var/www/chat-backend && npm install --production && pm2 restart chat-backend"
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
ssh root@145.223.27.84 "pm2 restart holy-backend"
```

**Frontend web** (requiere build: `npm run build` en `holy_app/frontend` → `dist/`). Subir el dist completo (incluye `sw.js`/`registerSW.js` del PWA) — **estas son las líneas exactas que usa el usuario**:
```bash
cd holy_app/frontend
scp -r dist/* root@145.223.27.84:/var/www/holy-app/frontend/dist/
ssh root@145.223.27.84 "chmod -R a+rX /var/www/holy-app/frontend/dist"
```
PWA con Service Worker: tras subir puede requerir recarga forzada (Ctrl+Shift+R) para ver el cambio.

**Gotcha PWA — deploys que "no se ven"**: el navegador puede quedarse con un `sw.js` viejo cacheado y servir la app vieja indefinidamente; "borrar datos de navegación" de Chrome NO desregistra el Service Worker (solo "Clear site data" en DevTools o desinstalar la PWA). Fix permanente ya aplicado en nginx (`deploy/nginx-holyholyholy.conf`): `location = /sw.js` y `location = /registerSW.js` con `Cache-Control: no-cache` → cada visita revalida el SW. Para diagnosticar: confirmar primero que el SERVIDOR ya sirve el bundle nuevo (`curl` a index.html → ver el hash `index-*.js` → `curl` al bundle → grep de una clase única del cambio); si el servidor ya lo tiene, es caché del cliente, no el deploy.

**APK de la app móvil (página /descargar)**: se sirve desde `/var/www/holy-app/downloads/HolyChat.apk` (carpeta ESTABLE, **fuera de `dist/`** para que los deploys limpios no lo borren) vía `location /downloads/` en nginx. Para publicar una versión nueva: sacar la URL del APK de `eas build:list` (Application Archive URL) y `scp` a esa ruta. **No vive dentro de `dist/`.**

---

## Web móvil (`holy_app`) — patrones

La mayoría de usuarios entran a `holyholyholy.es` desde el móvil. Patrones aplicados (2026-06-28):
- **Scroll horizontal**: NO usar `min-w-screen` (= 100vw, incluye el scrollbar → desbordamiento); el root del Layout usa `w-full overflow-x-clip`. Tooltips de hover (`HoverUserList`) ocultos en móvil (`hidden md:group-hover:block`) porque ocupan espacio aunque estén invisibles.
- **`overflow-x-clip`, NO `overflow-x-hidden`, en el root del Layout** (gotcha sutil, corregido 2026-07-10): `overflow-x: hidden` fuerza `overflow-y` a `auto` (regla CSS) → el div `min-h-screen` se vuelve un contenedor de scroll con altura = contenido, que **nunca scrollea internamente** (scrollea el viewport). Eso **rompe `position: sticky` de TODOS sus descendientes** — incluido el navbar `sticky top-0` (se iba con el scroll) y cualquier cabecera `sticky top-16` (seminario, Biblia). `overflow-x: clip` recorta igual el desbordamiento horizontal pero NO crea contenedor de scroll ni toca `overflow-y`, así que el sticky vuelve a funcionar. Verificado en vivo con DevTools.
- **Videos de YouTube**: `LiteYouTube.jsx` (facade) muestra solo la miniatura (`i.ytimg.com/vi/<id>/hqdefault.jpg`) + botón play y monta el iframe solo al tocar. Usado en `Posts.jsx` y `PostDetailModal.jsx` — evita cargar N reproductores a la vez en el feed.
- **Editor de post estilo Facebook**: en móvil el feed muestra una fila (avatar + "¿Qué estás pensando?") que abre `PostCreation` en un modal a pantalla completa (`Home.jsx`, `lg:hidden`). El editor inline solo en escritorio (`hidden lg:block`). `PostCreation` acepta `onPosted` para cerrar el modal al publicar. Su emoji picker va en `fixed` centrado (`z-[91]`) para que no lo recorte el `overflow` del modal. NO usar FAB en la esquina inferior derecha: choca con `MaterialPopup` (banner de materiales, `fixed bottom-4 right-4 z-[90]`).
- **Targets táctiles**: botones de acción del post (`PostAction` + "Me gusta") con `min-w-0` (para que encojan y quepan los 5) y `min-h-[44px]`; el menú de 3 puntos a 44×44.

---

## Backend architecture

**Entry point**: `src/app.ts` — crea Express + HTTP server + Socket.io; registra todas las rutas; llama `connectDB()` → `startCronJobs()` → `server.listen()`.

**Route → Controller pattern**:
- Rutas en `src/routes/*.routes.ts`
- Lógica en `src/controllers/*.ts`
- `authMiddleware` (`src/middleware/authMiddleware.ts`) verifica `Authorization: Bearer <token>` y adjunta `req.userId` / `req.userEmail`

**Prefijos de rutas** (ver `src/app.ts`):
- `/auth` — register, login, Google sign-in, verificación email, refresh token
- `/conversations` — conversaciones 1:1 y grupales, mensajes, pins, archivos
- `/users` — perfil, contactos, bloqueos, settings, actividades personales
- `/groups/:groupId/activities` — CRUD de actividades grupales
- `/groups/:groupId/prayer-requests` — peticiones de oración
- `/calls` — token LiveKit para llamadas grupales
- `/bible` — datos estáticos (KJV, RVA, RVR1960, WEB)
- `/offerings` — PayPal órdenes y suscripciones, webhook
- `/upload` — subida de media a Cloudinary

**Endpoints de usuarios en `/conversations`**:
- `GET /conversations/users/search?q=` — búsqueda mínima 2 caracteres, límite 20
- `GET /conversations/users/suggested` — usuarios sin conversación previa con el usuario actual, límite 15
- `GET /conversations/users/all?q=` — todos los usuarios con búsqueda opcional (sin mínimo), límite 40

**Endpoints en `/users`** (además de perfil/settings):
- `GET /users/me/prayer-requests` — peticiones de oración activas donde el usuario está en `prayingUsers`; popula `authorId` (name) y `groupId` (groupName). Devuelve `MyPrayingRequest[]`.

**Real-time (Socket.io)** (`src/socket/socketHandler.ts`):
- Auth middleware lee `socket.handshake.auth.token` (mismo JWT que REST)
- Al conectar: rooms `user:<userId>` (personal) + una room por conversación
- Mapas en memoria: `onlineUsers: Map<userId, Set<socketId>>` y `activeCalls: Map<callId, ActiveCall>`
- Eventos: `message:send/read/edit/delete/react`, `typing:start/stop`, WebRTC signaling (`call:initiate/answer/ice-candidate/end/reject`), LiveKit (`call:group:start`)
- Para enviar eventos desde controladores REST: `io.to(`user:${userId}`)` via `ioSingleton` (`src/socket/ioSingleton.ts`)
- El frontend usa `transports: ['websocket']` únicamente — sin polling de fallback. Si el WebSocket falla (e.g., nginx sin headers de upgrade), socket.io no conecta en absoluto y todos los eventos de tiempo real fallan silenciosamente.
- **Chats nuevos en tiempo real**: un socket solo se une a las rooms de sus conversaciones **al conectar**, así que una conversación creada DESPUÉS (primer mensaje de alguien nuevo) no llegaría hasta refrescar. En `message:send`, el backend hace `io.in(personalRooms).socketsJoin(conversationId)` (mete a los demás participantes en la room) y, si es el primer mensaje de un 1:1 (`!conversation.lastMessage` y `!isGroup`), emite `conversation:new` (conversación poblada) a `user:<pid>` ANTES del `message:new`. El frontend escucha `conversation:new` en `useChatsStore.bindSocketEvents` (espejo de `group:new`) → `upsertConversation` + `conversation:join`. `addMessage` solo actualiza conversaciones existentes, por eso se necesita el `conversation:new`.
- **Perf de la lista de mensajes**: `MessageBubble` está envuelto en `React.memo`; los mensajes se actualizan inmutablemente en el store (`.map` con `{ ...m }`), así que memo es seguro. Los handlers que recibe la burbuja en `chat/[id].tsx` (`handleLongPress`, `handleCallBack`, `handleAvatarPress`, etc.) deben ir en `useCallback` o memo se anula.

**Auth** (`src/services/jwtService.ts`):
- Access token: 24h — `JWT_SECRET`, payload `{ userId, email }`
- Refresh token: 7d — `JWT_REFRESH_SECRET`
- Socket: mismo `JWT_SECRET` via `verifyToken()`

**Códigos de un solo uso — DOS capas, y la que importa es la de la cuenta** (`src/services/authCodes.ts`, desde 2026-08-21). Un código de 6 dígitos son 1.000.000 de combinaciones; hasta esa fecha no había NINGÚN límite de intentos, así que dentro de la ventana de 10 minutos se podían probar todas y quedarse con la cuenta ajena vía `/auth/reset-password`.
- **Capa 1 — por cuenta**: `verificationAttempts`/`resetAttempts` en `User`. A los `MAX_CODE_ATTEMPTS` (5) fallos el código queda invalidado y hay que pedir otro (**429**, no 400). Es la que corta el ataque de verdad: **no depende de la IP**, así que rotar de IP no la esquiva. Emitir un código nuevo reinicia el contador.
- **Capa 2 — por IP**: `middleware/rateLimit.ts` (ver el gotcha de `X-Forwarded-For`). Es solo capa de volumen y puede desactivarse sola si nginx está mal configurado.
- Los códigos se guardan **hasheados con bcrypt** (coste 10, no el 12 de las contraseñas: viven 10 min y admiten 5 pruebas). `isHashed()` detecta el formato, así que los códigos emitidos ANTES del cambio siguen valiendo en claro hasta caducar — sin eso, todo el que estuviera a mitad de un registro se habría quedado tirado en el despliegue.
- `randomCode()` usa `crypto.randomInt`, no `Math.random()` (el generador de V8 no es criptográfico).
- **El límite por IP va por IP y NUNCA por correo**: con el correo de clave, cualquiera podría dejar fuera a un usuario concreto pidiendo su cuenta en bucle.
- Las rutas que MANDAN CORREO (`/register`, `/forgot-password`, `/resend-code`) tienen el límite más estricto (8/hora): además del abuso, protegen el SMTP — Hostinger corta la IP del VPS entera con `450 4.7.1 too many AUTH commands` (ver el apartado de correos).
- `/auth/refresh` y `/auth/google-signin` **no llevan límite** a propósito: ahí la credencial ya es el token.
- Cubierto por `scripts/authCodes.test.mjs` y `scripts/rateLimit.test.mjs`.

**Cron jobs** (`src/services/cronService.ts`):
- Cada minuto: push notifications de actividades (exacta y 15 min de anticipo), timezone-aware via `date-fns-tz`
- Cada hora: email de resumen semanal los domingos a las 8am hora local del usuario

**Modelos MongoDB** (Mongoose + interfaces TypeScript en cada archivo):
- `User` — auth, blocked users, Expo push token, notification/privacy settings, offering status
- `Conversation` — participants, `isGroup`, admins/permissions, mute/pin/archive/favorite por usuario
- `Message` — `type: text|image|audio|video|document|call|contact|poll`, `status: sent|delivered|read`, `readBy[]`, `deletedFor[]`, `isDeletedForEveryone`, `replyTo` (snapshot embebido), `reactions[]`
- `GroupActivity` — ligada a un grupo (Conversation), tipos: `ayuno|vigilia|cilicio|escala_oracion|bible_reading|evangelism`
- `ActivityCommitment` — usuario se compromete a una GroupActivity con horario semanal + timezone
- `PersonalCommitment` — igual que ActivityCommitment pero sin grupo
- `PrayerRequest` — ligada a un grupo; campos: `content`, `isAnonymous`, `imageUrl?`, `cloudinaryPublicId?`, `deadline?` (Date), `prayingUsers[]`, `isAnswered`, `answeredNote?`
- `Offering` — ciclo de vida PayPal (`pending→paid/failed/cancelled`)

**PayPal** (`src/services/paypalService.ts`, `src/controllers/offeringController.ts`):
- Sandbox vs live: variable `PAYPAL_MODE`
- Único: `POST /offerings/order` → `approvalUrl` → usuario paga → `GET /offerings/capture`
- Suscripción: `POST /offerings/subscription` con `tier` (sub_5/sub_10/sub_20/sub_50/sub_100/sub_200 — son SEIS) → `GET /offerings/sub-return`
- Webhook: `POST /offerings/webhook` — verifica firma y maneja `PAYMENT.CAPTURE.COMPLETED`, `BILLING.SUBSCRIPTION.ACTIVATED/CANCELLED`
- **Browser in-app**: `ofrendas.tsx` usa `WebBrowser.openAuthSessionAsync(url, 'chatapp://')`. Las páginas HTML de éxito/cancelación del backend redirigen a `chatapp://` con `window.location.href` tras 2 segundos, lo que cierra el browser automáticamente. El scheme `chatapp://` está definido en `app.json`.
- `htmlPage()` en `offeringController.ts` acepta `autoClose: boolean` — pasar `true` en páginas de éxito/cancelación para activar el redirect.

---

## Frontend architecture

**Expo 54 + Expo Router** (file-based routing). Siempre consultar [docs v54](https://docs.expo.dev/versions/v54.0.0/) antes de escribir código Expo-específico.

**OTA Updates configurado**: `expo-updates` instalado, `runtimeVersion.policy: appVersion`, canal `preview` y `production` en `eas.json`. Los cambios de JS se despliegan con `eas update` sin rebuild.

**Layout de rutas** (`app/`):
- `(auth)/` — login, register, verify, forgot/reset password
- `(tabs)/` — tabs: chats, actividades, bible, ofrendas, settings
- `chat/[id].tsx` — pantalla de conversación
- `group-activities/[id].tsx`, `group-activities/commit/[activityId].tsx`
- `group-prayer/[id].tsx` — peticiones de oración de grupo (foto opcional, fecha límite, anónimo)
- `call.tsx` (WebRTC 1:1), `group-call.tsx` (LiveKit grupal)
- `contact/[id].tsx`, `group-profile/[id].tsx`, `group-media/[id].tsx`
- `info/reglamentos.tsx`, `info/faq.tsx`, `info/quienes-somos.tsx`, `info/contacto.tsx` — páginas estáticas informativas

**Navegación cross-tab con parámetros**: Para abrir una sección específica dentro de otro tab, usar `router.navigate` con params y leerlos con `useLocalSearchParams`. Ejemplo: desde `chats.tsx` → settings abriendo sección archivados:
```tsx
// emisor (chats.tsx)
router.navigate({ pathname: '/(tabs)/settings', params: { section: 'archivados' } } as any);

// receptor (settings.tsx) — usa ref para no re-ejecutar si el usuario vuelve al tab sin cambiar el param
const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
const handledSectionParam = useRef<string | null>(null);
useEffect(() => {
  if (sectionParam && sectionParam !== handledSectionParam.current) {
    handledSectionParam.current = sectionParam;
    openSection_(sectionParam as Section);
  }
}, [sectionParam]);
```

**Estado**: Zustand stores en `src/store/`. API calls via axios en `src/services/authService.ts` (instancia base apuntando a `EXPO_PUBLIC_API_URL`).

**Persistencia offline**: `useChatsStore` y `useActivitiesStore` usan Zustand `persist` middleware con AsyncStorage. `partialize` excluye Sets y funciones (no serializables). La app muestra datos cacheados sin conexión al arrancar.

**Theming**: `src/context/ThemeContext.tsx` — `ThemeProvider` + `useTheme()` hook. Paleta light (azul `#3B82F6`) y dark (indigo `#6366F1`). Importar `useTheme()` en cualquier screen nueva y usar `colors.xxx` para todos los colores.
- **Burbujas de mensaje idénticas a la web (`holy_app`)** desde 2026-07-04. Light: propia verde WhatsApp `#d9fdd3`, ajena blanca `#FFFFFF`, texto `#111b21`, meta `#667781`. Dark: propia azul `#3b82f6` (blue-500), ajena morada `#a855f7` (purple-500), texto blanco, meta `rgba(255,255,255,0.70)`. Definido en los tokens `bubbleMine/bubbleTheirs*` de ThemeContext.
- **Ojo — la burbuja propia solo es oscura en dark (azul); en light es verde clara.** Cualquier color hardcodeado que asuma "propia = fondo oscuro → texto claro" rompe en light. Patrón usado en `MessageBubble`/`LinkPreview`/`VoicePlayer`: `const isDark = colors.bgPrimary === '#0A0A0A'; const mineDark = isMine && isDark;` y ramificar por `mineDark`, no por `isMine`.
- **Colores de nombre de remitente idénticos a la web** (`nameColor(name, isDark)` en `MessageBubble.tsx`): mismas paletas `LIGHT_NAME_COLORS`/`DARK_NAME_COLORS`, mismo hash (`h = (h*31 + code) >>> 0`) y misma clave (el **nombre**, no el `_id`) que `holy_app/.../messages/Message.jsx`. Al tocar el color, editar ambos lados.

**Styling**: NativeWind v4 (Tailwind para React Native). `global.css` es el entry de Tailwind; `tailwind.config.js` configura los content paths.

**Llamadas**:
- 1:1: WebRTC puro via Socket.io (`src/services/callService.ts`, `src/store/useCallStore.ts`)
- Grupales: LiveKit (`@livekit/react-native`) — backend genera token en `/calls/token`

**Gestos de deslizamiento** (patrón `Animated` + `PanResponder`, sin `react-native-gesture-handler`):
- **Lista de chats** (`chats.tsx`) — `SwipeableRow`: deslizar izquierda revela botones "Más" y "Archivar". `SWIPE_ACTION_WIDTH = 148`, `SWIPE_SNAP_THRESHOLD = 40`. Vive al final del archivo fuera de `ChatsScreen`.
- **Actividades personales** (`actividades.tsx`) — `SwipeablePersonalCard`: deslizar izquierda revela botones "Editar" (accent) y "Eliminar" (rojo `#EF4444`). `PERSONAL_SWIPE_WIDTH = 140`, `PERSONAL_CARD_WIDTH = Dimensions.get('window').width - 32`. Vive al final del archivo fuera de `ActividadesScreen`. La tarjeta mantiene los 3 puntos (`onOptions`) además del swipe.
- **Burbuja de mensaje** (`chat/[id].tsx`) — `SwipeableMessage`: deslizar derecha ≥ 64px activa reply automáticamente (`setReplyingTo(msg)`). Muestra icono `↩` semitransparente que se opacifica progresivamente. No aplica a mensajes eliminados (`isDeletedForEveryone`). El componente se define fuera de `ChatScreen`.

**Layout del SwipeableRow (patrón correcto para Android)**:
NO usar `position: 'absolute'` para los botones — en Android `overflow: 'hidden'` no clipea hijos absolute confiablemente. El patrón correcto es layout horizontal en el `Animated.View`:
```tsx
<View style={{ overflow: 'hidden', width: SCREEN_WIDTH }}>
  <Animated.View style={{ flexDirection: 'row', transform: [{ translateX }] }} {...panResponder.panHandlers}>
    <View style={{ width: SCREEN_WIDTH }}>{children}</View>   {/* contenido */}
    <View style={{ width: SWIPE_ACTION_WIDTH }}>...botones</View>  {/* fuera del área visible */}
  </Animated.View>
</View>
```
Cuando `translateX = 0` los botones están fuera del área clipeada; cuando `translateX = -SWIPE_ACTION_WIDTH` los botones son visibles.

**Cerrar el swipe al tocar fuera — patrón de coordinación**:
Cada `SwipeableRow`/`SwipeablePersonalCard` recibe prop `onOpen?: (closeFn: () => void) => void`. Cuando se abre, llama `onOpen(close)` para registrarse. El padre coordina:
```tsx
// En el padre:
const activeSwipeClose = useRef<(() => void) | null>(null);

// En cada item:
onOpen={(closeFn) => {
  if (activeSwipeClose.current && activeSwipeClose.current !== closeFn) {
    activeSwipeClose.current();  // cierra el swipe diferente que estaba abierto
  }
  activeSwipeClose.current = closeFn;
}}

// En FlatList/ScrollView:
onScrollBeginDrag={() => { activeSwipeClose.current?.(); activeSwipeClose.current = null; }}
```
**Anti-bounce crítico**: comparar `activeSwipeClose.current !== closeFn` antes de llamarla. Si no se hace esta comparación, al abrir el mismo swipe por segunda vez `activeSwipeClose.current` ya apunta a su propia función `close` (capturada en el primer render por el `useRef` del PanResponder) y se cierra inmediatamente, produciendo efecto rebote.

**Overlay para cerrar al tocar el área de contenido**:
Dentro del componente, usar `useState(false)` para `overlay`. Cuando se abre el swipe: `setOverlay(true)`. Overlay transparente sobre el contenido (no sobre los botones):
```tsx
{overlay && (
  <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10 }} onPress={close} />
)}
```
Cuando se cierra (close): `setOverlay(false)`.

**Patrón común**: `onStartShouldSetPanResponder: () => false` + `onMoveShouldSetPanResponder` activa solo si horizontal > vertical y > 10px. `isOpen` como `useRef` (no state) para que los callbacks del PanResponder siempre lean el valor actual sin stale closure.

**Pantalla de chats — secciones**:
- **"Quizás los conozcas"**: scroll horizontal en `ListHeaderComponent` con usuarios de `GET /conversations/users/suggested`. Botón `+` abre modal de todos los usuarios.
- **Modal "Todos los usuarios"**: carga todos los usuarios al abrir (query vacío), filtra en tiempo real. Tapping crea/abre conversación.
- **Archivados**: el botón navega a `/(tabs)/settings?section=archivados` en lugar de expandir inline. Los archivados se gestionan en `settings.tsx`.

**Pantalla de actividades — secciones**:
- **"Mis actividades"**: compromisos grupales (`ActivityCommitment`) + actividades personales (`PersonalCommitment`). Los personales tienen swipe para editar/eliminar.
- **"Orando por"**: peticiones de oración activas (`isAnswered: false`) donde el usuario aparece en `prayingUsers`. Cargadas con `GET /users/me/prayer-requests` → `getMyPrayingRequests()`. Muestra autor, nombre del grupo, contenido truncado, fecha de inicio y fecha límite. El botón **"Estoy orando"** (verde) llama a `togglePray` y elimina la tarjeta de la lista al confirmar. Tocar la tarjeta navega a `group-prayer/[groupId]`.
- **"Mis grupos"**: grupos únicos derivados de los compromisos activos, con acceso rápido a peticiones de oración y actividades del grupo.

---

## Compartir (enlaces, QR y Open Graph)

Compartir con enlace + QR (añadido 2026-06-23). Tres superficies: materiales, la web, y usuarios/grupos del chat.

**Endpoints públicos del chat-backend** (`/public`, sin auth — `publicController.ts` + `public.routes.ts`):
- `GET /public/users/:id`, `GET /public/groups/:id` — perfil mínimo para la página de invitación.
- `GET /public/qr?data=<url>&size=300` — PNG del QR (lib `qrcode`). Lo usa la app móvil (no tiene librería de QR nativa).

**Web (`holy_app`)** — usa `qrcode.react` + `react-share`:
- `ShareModal.jsx` (reutilizable: QR + redes + copiar/descargar). Prop opcional `socialUrl`: URL distinta para los botones de redes/sistema (la que genera Open Graph) cuando difiere de la mostrada/QR.
- Página de invitación `InvitePage.jsx` en `/u/:id` y `/g/:id`: perfil + "abrir en web" (`/chat?startUser=` / `?openGroup=`, manejado en `ChatPage.jsx`) + "abrir en app" (`chatapp://u/:id`).
- `LinkPreview.jsx`: para enlaces a `/materiales/:slug` arma la vista previa con los datos reales del material (no microlink, que solo vería el index.html genérico). Caché versionada (`linkpreview:v2:`).

**Móvil (`chat-app-frontend`)**: `ShareSheet.tsx` (QR del backend + Share nativo; exporta `WEB_URL` = API_URL sin `api.`). Botón compartir en `contact/[id]` y `group-profile/[id]`. Deep links `app/u/[id].tsx` y `app/g/[id].tsx` (`chatapp://u/:id`, `chatapp://g/:id`) abren/crean la conversación. Sin paquetes nativos → se despliega con `eas update`.

**Open Graph para previews en WhatsApp/Facebook** (los scrapers no ejecutan JS; la SPA solo entrega el index.html genérico → logo + "Holy App"):
- Backend web (`holy_app/backend/routes/shareRoutes.js`): sirve OG a bots (UA tipo `facebookexternalhit|whatsapp|...`) y redirige humanos a la SPA.
  - `/api/share/post/:id` — si el post enlaza un material y no tiene imagen propia, usa la portada/título del material como OG.
  - `/api/share/material/:slug` — OG con la portada del material.
- **nginx** (`/etc/nginx/sites-available/holyholyholy`; copia versionada en `holy_app/deploy/nginx-holyholyholy.conf`): un `map $http_user_agent $holy_is_bot` (contexto http) + `location ~ ^/materiales/(?<mslug>[^/]+)/?$` que enruta SOLO bots a `/api/share/material/<slug>` (humanos → SPA). Patrón seguro `error_page 418 = @og_material` (evita el combo problemático `if + proxy_pass`). Deploy nginx: backup → `scp` el archivo → `nginx -t && systemctl reload nginx`.
- WhatsApp **cachea** las previews por URL y no tiene "scrape again" público (Facebook sí: developers.facebook.com/tools/debug). Para forzar refresco al probar: añadir `?v=2` al final de la URL.

**Un post SIN foto propia no puede caer en "el logo + la URL dos veces"** (arreglado 2026-08-17; era el caso de los VIDEOS, lo que más se comparte). `title`/`description` salían de `content`, que en un post de YouTube es solo la URL. `/api/share/post/:id` resuelve ahora, por este orden: material enlazado → pasaje bíblico → **video de YouTube** → cualquier otro enlace. Reglas al tocarlo:
- **El texto del autor va SIEMPRE sin URLs** (`caption = textOnly.replace(/https?:\/\/\S+/gi,'')`). Sin eso, el enlace acaba de título Y de descripción.
- **El título del video se pide por oEmbed** (`https://www.youtube.com/oembed?url=…`, sin API key, cacheado 6 h en memoria). Con `live.youtubeVideoId` manda el directo y el título lleva "🔴 EN VIVO".
- **La miniatura decide si la tarjeta es grande o pequeña**: por debajo de 600px de ancho Facebook pinta la tarjeta chica. `hqdefault` son 480x360 → hay que probar `maxresdefault` (1280x720) y `sddefault` (640x480) con HEAD antes, **en paralelo** (el scraper no espera). Y declarar el tamaño REAL en `og:image:width/height`: `ogHtml` los omite si no se saben (portada ajena) para que FB no recorte por donde no toca.
- Con video se manda `og:type: video.other` + `og:video*` apuntando al `/embed/` de YouTube (es lo que hace youtube.com y por lo que su tarjeta se ve así).
- **El resto de enlaces (TikTok, Instagram, noticias) se resuelven con `GET /public/link-preview` del chat-backend** — no duplicar aquí el raspado ni el oEmbed de TikTok.
- **El 302 a humanos va ANTES de armar el OG**: si no, quien pincha el enlace espera a oEmbed y a los HEAD para nada.
- `ogHtml` **escapa `image`/`shareUrl`/`humanUrl`**: esa portada viene de un sitio ajeno y unas comillas dentro romperían la etiqueta.
- Comprobarlo sin desplegar: montar `shareRoutes` en un express suelto contra la base real y pedirlo con `user-agent: facebookexternalhit`.

## Nombre del video en los enlaces (YouTube / TikTok)

La metadata la sirve `GET /public/link-preview` del chat-backend (`publicController.ts`) y la consumen los tres sitios: posts de la web, chat web y chat móvil.

- **TikTok NO se puede raspar**: a un bot le devuelve una pantalla de verificación sin Open Graph. Se resuelve con su **oEmbed** (`https://www.tiktok.com/oembed?url=`), que da el pie del video como `title`, el autor y la miniatura; los enlaces cortos (`vm.`/`vt.tiktok.com`) se resuelven siguiendo la redirección y se reintenta con la URL larga. Mismo patrón que YouTube.
- Las **miniaturas de TikTok van firmadas y caducan** (`x-expires`) — la caché de previas dura 30 días, así que `LinkPreview` esconde la imagen con `onError` en vez de dejar el icono de rota.
- **`LiteYouTube` muestra el nombre del video** bajo la miniatura cuando se le pasa `url` (sin `url` no pinta pie: es lo que necesita `DownloadApp`, que ya pone su propio título). La metadata y su caché (`localStorage`, clave `linkpreview:<v>:`) viven en **`frontend/src/lib/linkMeta.js`** (`useLinkMeta`), compartidas con `LinkPreview` para no pedir dos veces lo mismo.
- Los enlaces de YouTube que no dan `videoId` (listas, canales, `/shorts/` antes de soportarlo) **no pueden devolver `null`** o el enlace desaparece del post sin dejar rastro: caen a `LinkPreview`.
- **⚠️ El contenido de un post es HTML de Quill, y Quill escribe los espacios como `&nbsp;`** (2026-08-26). Con un patrón que solo excluya espacios y `<>"'`, la URL **se traga todo el texto siguiente** (`…/@canal&nbsp;ya&nbsp;llego&nbsp;a…`): el enlace queda roto, sin previa, y medio post desaparece dentro del `<a>`. El patrón corta explícitamente en las entidades de espacio y decodifica `&amp;` (las query strings viajan escapadas). **Espejado**: `frontend/src/utils/extraLinks.js` (web) y `chat-app-frontend/src/lib/linkMeta.ts` (móvil); cubierto por `frontend/scripts/extraLinks.test.mjs`.
- **Un canal de YouTube (`/@handle`) NO da previa con el corte de 256 KB**: no tiene `videoId`, así que cae al raspado genérico, y la página de un canal mete cientos de KB de JS **dentro del `<head>`** — medido contra el canal real, los `og:` están pasada la posición **740.000**. `buildPreview` lee hasta 2 MB solo en `youtube.com` (el resto sigue en 256 KB: es un endpoint público). Al tocar previas, **subir la `VERSION` de la caché en los dos clientes** (`lib/linkMeta.js` web, `src/lib/linkMeta.ts` móvil) o los "sin preview" ya guardados tapan el arreglo.
- **La tarjeta grande copia la de Facebook**: imagen y, bajo ella, franja con el **dominio en mayúsculas** (`YOUTUBE.COM` — no el `siteName`, que en un canal no distingue nada) y el título en negrita. Espejada en `components/LinkPreview.jsx` (web) y `PostLinkPreview.tsx` (móvil).
- **En el móvil (2026-08-25)** los posts pintan la misma tarjeta: `src/lib/linkMeta.ts` (hook + `extractLinks`, caché en AsyncStorage 30 d / 30 min los fallos) y `src/components/comunidad/PostLinkPreview.tsx` (imagen, título, descripción, sitio y "Ver detalles"; YouTube como facade que al tocar monta `YouTubeEmbed`), usada en `PostCard` y en el editor `comunidad/create.tsx` —ahí con retardo de 700 ms, o cada tecla de una URL a medio escribir sería una petición—. **El móvil NO necesita el caso especial de materiales que sí tiene la web**: `/public/link-preview` ya devuelve título, descripción y portada de un `/materiales/:slug` (verificado contra producción).

## Tipos de mensaje nuevos (leer antes de añadir uno)

Al estrenar `type: 'contact'` (2026-07-09) el mensaje se guardaba bien pero **no se veía en ningún cliente**. Tres trampas, todas vuelven a morder con el próximo tipo:

1. **Desplegar el backend ANTES que los clientes.** Con el enum viejo de `Message.type`, `Message.create` lanza `ValidationError`, el `try/catch` de `message:send` se lo traga y el envío se descarta en silencio. La app entretanto dice "enviado": la confirmación es optimista, no espera al servidor (no hay `ack`).
2. **Móvil — burbuja invisible**: `MessageBubble` renderiza por rama (`isImage`/`isAudio`/…). Un tipo sin rama produce una burbuja de altura cero, indistinguible de "el mensaje no llegó". Hay una rama de respaldo `isUnknownType` → "Actualiza la aplicación"; mantenerla.
3. **Web — el mensaje ni se monta**: `Messages.jsx` solo renderiza `<Message>` si hay `files` o `message` (texto). Los mensajes de llamada se salvan por casualidad (su `content` es `"audio"`/`"video"`). El guardia acepta ahora cualquier `type !== "text"`; **no vaciar `message` en `adaptMessage`** para un tipo nuevo (es lo que hizo desaparecer los contactos).

Sitios a actualizar al añadir un tipo: `Message.ts` (enum + campos), `message:send`, `previewOf` (`notificationController.ts`), preview push en `socketHandler.ts`, `lastMsgPreview` (`chats.tsx`), `lastMessagePreview` (`Conversation.jsx` web), `ReplyPreview` en ambos clientes.

## Subir archivos en el chat (`/upload`)

Un solo endpoint para los dos clientes: `POST /upload` (multer en memoria → Cloudinary). El **servidor decide el tipo de mensaje** a partir del mimetype real (`getMessageType`): `image`, `audio`, `video` o `document`. Los clientes deben usar el `messageType` que devuelve, no el que ellos supusieron (por el selector de documentos se cuela un `.mp4`).

- **Topes por tipo** (`uploadController.ts`, espejados en `holy_app/frontend/src/utils/chatFiles.js` → `MAX_MB`): imagen 10 MB, documento 10 MB, audio 25 MB, video 64 MB. El tope global de multer es 64 MB. Al cambiarlos, cambiar **los dos** sitios.
- **Compresión de videos pesados (2026-08-25)**: `uploadController.ts` re-codifica con ffmpeg cualquier video > 10 MB ANTES de subirlo a Cloudinary (H.264 720p máx. — `scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2` —, CRF 30, preset `veryfast`, audio AAC 96k, `+faststart`) → ~96 % menos peso (28 MB → 1,1 MB medido). Requiere **ffmpeg instalado en el VPS** (`apt-get install -y ffmpeg`); si falta o falla, se sube el original intacto (nunca rompe la subida). El contenedor/`public_id` pasa a `.mp4`.
- **Optimización de imágenes pesadas (2026-08-25)**: `uploadController.ts` optimiza con `sharp` cualquier imagen > 2 MB ANTES de subirla a Cloudinary — JPEG → calidad 90 (mozjpeg), PNG → re-codificado sin pérdida; aplica la orientación EXIF, elimina metadatos (EXIF/GPS) y limita a 2560 px SOLO si es más grande. GIF/HEIC/WebP/otros se suben tal cual (para no romper animaciones). `sharp` es dependencia del backend (carga perezosa vía `require`); si falla, se sube el original intacto. El formato se conserva (no cambia la extensión).
- **Cloudinary trata el audio como `resource_type: 'video'`** — pero un `video` NO es un `audio`: hasta 2026-07-13 `getMessageType` los fundía y los videos llegaban al chat como nota de voz con la onda rota.
- **⚠️ El `<input type="file">` NUNCA puede vivir dentro de un menú que se cierra al hacer clic.** Fue EL bug por el que la web no subió nada nunca: los inputs estaban dentro de la hoja de adjuntos, cuyo `<ul>` tiene `onClick={onClose}`, así que el mismo clic que abría el diálogo de archivos desmontaba el input. El diálogo se abría igual, el usuario elegía la foto, y el `change` se disparaba sobre un nodo ya desconectado del DOM → React (que escucha en la raíz) nunca lo recibía y no pasaba absolutamente nada. Los cuatro inputs viven ahora en `attachments/Attachments.jsx`, **fuera** del `{showAttachments && …}`; la hoja (`MenuAttachment`) solo dice cuál abrir vía `onPick(kind)`.
- **Pie de foto (`Message.caption`)**: el texto que acompaña a un archivo va DENTRO de la misma burbuja, debajo de la imagen (como WhatsApp), no como un mensaje de texto aparte. En los mensajes de media el `content` es la URL, por eso el texto necesita campo propio. Lo escribe `message:send` (solo si el tipo es image/video/audio/document, recortado a 1000). En la web, `adaptMessage` mapea `caption` → `message` (el campo que ya pintaba el texto); con varios archivos el pie va en el PRIMERO. Las vistas previas muestran el pie si lo hay (`📷 <pie>`).
- **Visor de envío estilo WhatsApp**: `components/chat/MediaComposer.jsx` (sustituye a la carpeta `preview/`, borrada). Portal a `document.body` (dentro del chat lo recortaba el `overflow` de la lista) con `data-theme` repuesto. Previa grande del archivo activo, tira de miniaturas con "+" y X por archivo, campo "Añade un comentario…", botón de enviar con el nº de archivos, y la barra de progreso dentro.
- **⚠️ Android: el `File` del selector CADUCA — hay que copiarlo a memoria al elegirlo.** En Chrome de Android el `File` no es una copia, es una referencia al proveedor del sistema (Google Fotos, cámara). Si el usuario tarda unos segundos (p. ej. escribiendo el pie de foto), al enviar Chrome ya no puede leerla: la subida falla al leer el cuerpo (`net::ERR_UPLOAD_FILE_CHANGED`) y **axios lo reporta como error de red**, no como error del servidor → "Sin conexión" solo en Android, nunca en iPhone ni escritorio (allí el archivo se materializa solo). El mismo motivo dejaba la miniatura rota (el `blob:` apuntaba a la referencia muerta). `pickFiles()` es **async** y materializa cada archivo (`file.arrayBuffer()` → `new File([...])`) antes de crear la previa y de subirlo.
- **La web NO puede descartar archivos en silencio.** Cada botón de adjuntar tenía su lista blanca y su tope propios, y lo que no encajaba se ignoraba con un `return` mudo: elegir un `.mov`, un `.heic` o un PDF de 6 MB no producía ningún efecto y parecía que "la web no sube nada". Ahora todo pasa por `pickFiles()` (`utils/chatFiles.js`), que devuelve `errors` con el motivo por archivo y se muestran en un toast. El mimetype del navegador no es de fiar (llega vacío en `.heic`/`.mkv`), así que se cae a la extensión.
- **Barra de progreso** (`zustand/useUploads.js` + `components/chat/UploadProgress.jsx`): el store es global porque `useSendMessage` se instancia en varios componentes y cada instancia tendría su propio estado. Progreso real con `onUploadProgress` de axios, cancelación con `AbortController`, y el fallo se queda en rojo con el motivo que devolvió el backend (`error` del JSON) en vez del viejo "No se pudo subir un archivo".
- Las vistas previas usan **object URLs**, no data URLs en base64 (un video de 50 MB en base64 son ~67 MB de string). Liberarlas con `revokePreviews` al vaciar la selección.

**Compartir contacto**: `contact: { userId, name, avatar }` embebido; el backend re-lee nombre/avatar de la BD a partir del `contactUserId` del cliente (nunca confiar en el snapshot que manda el cliente). `content` = nombre, para que las vistas previas funcionen sin leer `contact`.

**"Silenciar notificaciones"** = `Conversation.mutedBy`. Lo respeta la sección de chats de `getNotifications`; las llamadas perdidas siguen apareciendo a propósito. El push nativo/web NO lo consulta todavía.

---

## Notas de voz — UN reproductor global, fuera de React (2026-08-13)

Cada burbuja tenía su `useAudioPlayer`, atado al ciclo de vida del componente: salir del chat —o que la FlashList reciclara la fila al desplazarse— liberaba el reproductor y **el audio se cortaba a media frase**. WhatsApp lo sigue reproduciendo hasta el final aunque te muevas por la app.

- El reproductor vive en **`chat-app-frontend/src/store/useVoiceStore.ts`**, creado con `createAudioPlayer` (no el hook) y guardado en una variable de módulo, **no dentro del estado de zustand**: es un objeto nativo (`SharedObject`), no un valor serializable. El store solo guarda `{uri, messageId, conversationId, title, playing, position, duration}`.
- `VoicePlayer` solo pinta. Sus selectores comparan `s.messageId === messageId` y devuelven primitivas, así que **las demás burbujas no se repintan** mientras una suena. Su `useAudioPlayer` local recibe `null` cuando esa nota es la activa (si no, el mismo audio se cargaría dos veces) y solo sirve para saber la duración antes de tocarla; las duraciones ya vistas se cachean por URL en el store.
- **`VoiceMiniPlayer`** (montado en `app/_layout.tsx`) es la barra flotante al salir del chat: sin ella el audio seguiría sonando sin forma de pararlo. Se esconde dentro de su propia conversación comparando `usePathname()` con `/chat/<conversationId>`.
- Se pausa sola al **empezar a grabar** (`useVoiceRecorder.start`) y al **sonar un tono de llamada** (`ringtoneService.playLoop`): en Android se pelearían por la sesión de audio.
- **No hay reproducción en segundo plano** (app minimizada) a propósito: `shouldPlayInBackground` necesita configuración nativa (`eas build`), y esto tenía que llegar por `eas update`.

## Encuestas — "Ver votos", hora del voto y avisos (2026-08-13)

La burbuja (`PollBubble`, espejada en `holy_app/.../messages/PollBubble.jsx`) y el detalle (`PollVotersModal`, también espejado) copian la composición de WhatsApp: pregunta, instrucción ("Selecciona una opción o más."), círculos de 26, caras de los votantes + recuento, barra a lo ancho, y pie "Ver votos".

- **La barra se mide contra la opción MÁS votada**, no contra el total: la ganadora llena la barra y las opciones se comparan de un vistazo. Con el total, en una encuesta de 3 opciones ninguna llegaba nunca al final.
- **La hora del voto es un campo nuevo: `poll.options[].votedAt: [{user, at}]`** (`Message.ts`). Va en un arreglo APARTE de `votes` porque `votes` se manipula con operadores atómicos por valor escalar (`$addToSet`/`$pull`); con objetos dentro, `$addToSet` dejaría de deduplicar y cada doble toque contaría dos veces. Se mueve **en el mismo update** que el voto. Las encuestas anteriores no lo tienen: se pintan igual, sin hora.
- **El detalle se pinta con el mensaje VIVO** (se guarda el `_id`, no la encuesta), así que los votos que llegan por `poll:update` se ven sin cerrarlo. `updatePoll` del store reemplaza el mensaje de forma inmutable — sin eso, `React.memo` de `MessageBubble` lo dejaría congelado.
- **"Ver todos" a partir de 5 votantes por opción**: en un grupo grande la ganadora se comía la pantalla y las demás opciones quedaban fuera de vista.
- **Avisos**: `poll:vote` manda push (Expo + web) al AUTOR cuando alguien vota — solo al añadir voto, nunca a uno mismo, respetando `mutedBy` y solo si no tiene socket abierto (si está dentro ya ve moverse las barras); `tag: poll-<messageId>` para que varios votos actualicen el mismo aviso. La campana lista una sección **"Votos en tus encuestas"** (`kind: 'poll_vote'`), calculada de `votedAt` como "está orando por ti" — no hay colección de avisos.
- **⚠️ Orden de despliegue INVERTIDO respecto a los tipos de mensaje nuevos: primero los CLIENTES, luego el backend.** Un `kind` de notificación desconocido tumbaba la pantalla de la campana (`grouped[it.kind].push(...)` sobre `undefined`). Ya lleva `?.`, pero un APK que aún no bajó el OTA sigue con el bundle viejo. Regla: **campo nuevo en un mensaje → backend primero; tipo nuevo que el backend EMPIEZA a mandar a los clientes → clientes primero.**

## Lista de chats — opciones (móvil y web)

Las 8 acciones sobre un chat (marcar no leído, fijar, favorito, silenciar, archivar, vaciar, eliminar, bloquear) están en los dos clientes: móvil en la hoja de acciones al mantener pulsado (`app/(tabs)/chats.tsx`), web en el menú de 3 puntos de `sidebar/Conversation.jsx` (mismo componente para las pestañas Todos/No leídos/Favoritos/Grupos/Archivados).

- **"Marcar como no leído" NO toca `Message.readBy`.** Quitarse de `readBy` marcaría el chat como pendiente, pero le borraría al REMITENTE el doble check azul. Se usa una bandera aparte, `Conversation.unreadBy`, y el globo se fuerza a 1 (`unreadCount: max(real, 1)`). Se limpia al abrir el chat (`getMessages`, solo primera página) y con `markAllRead`.
- **"Vaciar chat"** = `$addToSet` del usuario en `Message.deletedFor` de todos los mensajes (el mecanismo de "eliminar mensaje para mí" que ya existía). **"Eliminar chat"** = vaciar + `$addToSet` en `Conversation.hiddenBy` (se cae de mis listas). Endpoints `DELETE /conversations/:id/messages` y `DELETE /conversations/:id`.
- **Un mensaje nuevo resucita el chat eliminado**: `message:send` hace `$pull` de `hiddenBy` y emite `conversation:new` a quien lo tenía oculto (su cliente ya no conocía la conversación; sin esto el mensaje llegaría a la nada). Borrar el chat no bloquea a nadie — para eso está bloquear.
- **En grupos NO se ofrece "Eliminar chat"** (el backend responde 400): seguirías recibiendo mensajes y reaparecería al instante. Igual que WhatsApp: primero salir del grupo.
- Al vaciar hay que cuidar tres efectos colaterales, ya resueltos en `getConversations`: los mensajes vaciados **no cuentan como pendientes** (`deletedFor` excluido del agregado de no leídos) y **no se muestran como vista previa** (`lastMessage` se omite si lo borré).

**Gotcha `createPortal` + daisyUI (web)**: el `data-theme` vive en un `<div>` de `App.jsx`, no en `<html>`. Todo lo que se pinte con `createPortal(..., document.body)` queda fuera y sale con el tema por defecto (oscuro) aunque el usuario esté en claro. Hay que envolver el contenido en `<div data-theme={theme}>` (`useThemeStore`). Ya pasó en `PostDetailModal`, `ChatNavRail` y el menú de `Conversation.jsx`. Ese menú va en portal a propósito: la lista de chats es `overflow-auto` y recortaba el dropdown de daisyUI.

## Formato de texto del chat (*negrita*, _cursiva_, ~tachado~)

Parser espejo en `chat-app-frontend/src/utils/chatFormat.ts` (app) y `holy_app/frontend/src/utils/extraLinkChat.js` (web) — al tocar las reglas, editar los dos. Soporta `*negrita*` y `**negrita**`, `_cursiva_`, `~tachado~`, anidados; el interior no puede empezar/terminar en espacio ni contener saltos de línea (igual que WhatsApp).

**El recorte de "Ver más" (250 caracteres) se aplica DESPUÉS de formatear, nunca antes.** Recortar el texto crudo partía en dos un `*negrita*` largo: el delimitador de cierre caía detrás del corte, se perdía la pareja y el mensaje se veía sin formato hasta expandirlo. Ahora se formatea el texto completo y se gasta un presupuesto de caracteres **visibles** al emitir los trozos (`takeText`), así las etiquetas siempre acaban cerradas. Las URLs y las menciones no se parten: entran enteras o no entran.

## Popups de inicio — configurables desde el dashboard

El popup de la esquina inferior (web y app) **ya no está hardcodeado**: lo gobierna un documento único `PopupConfig` (`chat-app-backend/src/models/PopupConfig.ts`) que edita el admin general en **`/users` → pestaña "Popups"** (`holy_app/frontend/src/pages/userlist/PopupsAdmin.jsx`).

- **Backend**: `GET /public/popup-config` (SIN auth — la página pública `/descargar` también la lee para los videos), `PUT /popup/config` + `GET /popup/stats` + `POST /popup/stats/reset` (solo `isGlobalAdmin`), `POST /popup/event` (auth; `$inc` atómico de vistas/clics/cierres).
- **Categorías (`kind`)**: `material`, `prayer`, `activity`, `app` (descarga/actualización, con QR), `custom` (anuncio libre). El **orden del arreglo `kinds` es el orden de rotación**; cada una tiene `enabled`, `audience` (`all|web|app`) y ventana `startsAt`/`endsAt`.
- **Política duplicada en los dos clientes — al tocarla, editar los dos**: `chat-app-frontend/src/services/dailyPopupService.ts` y `holy_app/frontend/src/lib/popupPolicy.js` (rotación por día + veces mostradas hoy, `timesPerDay`, `minGapMinutes`, `durationSeconds` de autocierre, `quietHours` en hora local). Estado local: clave `dailyPopupState` (AsyncStorage / localStorage) con `{date,count,lastAt,kinds}` — sustituye a la vieja `dailyPopupDate`.
- **`kind: 'app'`**: en la web sale siempre que esté activo (QR + botón de APK); en la app **solo si `version` de `app.json` < `appUpdate.latestVersion`** (`isOlderVersion`, comparación numérica). Para avisar de una actualización basta con subir ese número en el dashboard — no hace falta desplegar nada.
- **Videos de `/descargar`**: `helpVideos` de la misma config (playlist; el 1º es el destacado). Se renderizan con el facade `LiteYouTube`. El admin pega la URL de YouTube y el backend extrae el ID.
- **Orden de despliegue**: primero el backend. Si `/public/popup-config` no existe, `fetchPopupConfig` devuelve `null` y **no se muestra ningún popup** en ninguno de los dos clientes (falla en seguro, pero silencioso).

## Feed de posts (`holy_app`) — Descubrir / Amigos

Hasta 2026-07-14 el feed de alguien con sesión se limitaba a `[él + sus amigos + los admins + a quien sigue]`: para ver a una persona había que ser YA su amigo, y no había forma de descubrir a nadie (el invitado sin sesión, en cambio, veía todo).

- **`GET /posts?scope=discover|friends`** (`postController.getFeedPosts`). `discover` (por defecto) trae a toda la comunidad; `friends` es el feed antiguo. La pestaña se recuerda en `localStorage` (`feed_scope`).
- **Variedad de autores** (`orderFeedIds`): cada post EXTRA del mismo autor compite como si fuera 24 h más antiguo (`$setWindowFields` + `$documentNumber` → `feedScore`). Sin esto, quien publica mucho se queda la portada (una sola persona firma 79 de los 303 posts). Es determinista → la paginación por `skip/limit` sigue siendo estable. Hay respaldo cronológico si Mongo < 5.0. Las 24 h están medidas: en los 40 primeros posts pasan de 17 a 22 autores distintos, y 22 son TODOS los que han publicado en el último mes (subir el castigo no mejora nada).
- **`authorRelation`** viaja con cada post (`getRelationsToAuthors`, una sola consulta por página): `self | connected | pending (+requestId) | received (+requestId) | not_connected`. Lo pinta `FriendButton` junto al nombre. **No consultar el estado post a post** — sería una petición por tarjeta en un scroll infinito.
- **La clave de caché es `["posts", scope]`**, así que todo lo que actualiza el feed usa `setQueriesData({ queryKey: ["posts"] })` (prefijo), NO `setQueryData(["posts"])`, que ya no encaja con nada y sería un no-op silencioso: comentarios, reacciones, shares y el socket `newPost` dejarían de verse en vivo.
- Realidad de los datos (2026-07-14): 509 usuarios registrados, **53 han publicado alguna vez** y solo 22 en el último mes. Enseñar "40 personas" en la portada no es cuestión de ordenar mejor — ese contenido no existe. Por eso la tira `SuggestedPeopleStrip` (perfiles de `/users/suggestions`, ya cacheados por `usePost`) se intercala tras el 3er post: es lo que trae caras nuevas de los otros ~456 usuarios que nunca publicaron.

## Tarjeta bíblica de un post — un pasaje, no un versículo

`post.linked` con `type: 'bible'` guarda **`verses: [{book, chapter, verse, text}]`** (hasta 20). `title` es la referencia del pasaje ya formateada ("Juan 3:16-18", "Juan 3:16, 18", "Juan 3:16; Salmos 23:1") y `text` el pasaje en texto plano: los dos siguen ahí porque **los posts publicados antes solo tienen eso** (y son lo que leen las vistas previas). Al pintar, `BibleLinkedCard` cae a `text` si no hay `verses`.

- **La referencia la calcula el SERVIDOR**, nunca el cliente: `backend/utils/biblePassage.js` (`normalizeVerses` + `passageReference` + `passageText`), **espejado** en `frontend/src/lib/biblePassage.js` — al tocar las reglas, editar los dos. `normalizeVerses` ordena los versículos dentro de cada capítulo: se eligen tocándolos y en cualquier orden que se toquen "16, 17" se lee igual. El editor DEBE pasar por el mismo `normalizeVerses` o la previa lista los versículos en un orden y el post publicado en otro.
- **Desplegar el backend ANTES que la web** (misma trampa que los tipos de mensaje nuevos): con el `createPost` viejo, `linked.verses` se ignora, `linked.book` es `undefined` → no se arma la tarjeta y un post que solo lleve el pasaje se rechaza con 400 "post vacío".
- **La tarjeta es un solo componente**: `components/bible/BibleLinkedCard.jsx` — feed (`Posts.jsx`), detalle (`PostDetailModal.jsx`) y la previa del editor (`PostCreation.jsx`). Antes el diseño estaba copiado en los dos primeros y la previa era un tercero distinto: lo que veías al escribir no era lo que se publicaba.
- El toggle "Tarjeta" de `BibleVerseModal` nace **apagado** (insertar texto es lo que espera quien abre la Biblia mientras escribe). Solo nace encendido desde "Añadir otro versículo", que ya presupone la tarjeta.

## Elegir VARIOS versículos — resaltado en bloque y nota de pasaje (2026-08-26)

Hasta esta fecha ninguno de los dos clientes dejaba marcar un pasaje: la web solo
tenía `selectedVerse` (uno), y el móvil tenía `selectedVerses` (un Map) pero **sin
forma de llegar a él** — la hoja de acciones era un `Modal` a pantalla completa,
así que tocar un segundo versículo era imposible y cualquier toque fuera vaciaba
la selección. Resaltar tres versículos era abrir el menú de cada uno y repetir el
color a mano.

- **La hoja/barra de acciones NO puede tapar el texto ni interceptar los toques.**
  Móvil: `VerseActionsSheet` tiene modo **`inline`** (posición absoluta abajo, sin
  fondo) que se usa **solo en la lectura**; en las listas (Buscar, Favoritos,
  Temas) sigue siendo `Modal`, que allí no estorba. Web: `PassageActionsBar`
  (`fixed bottom-0`, `z-[92]` — por encima del banner de materiales, que es
  `z-[90]`). Las dos avisan "Toca más versículos para añadirlos al pasaje": sin
  esa línea nadie descubre que se pueden encadenar.
- **La lista necesita hueco abajo** (`paddingBottom` en el móvil, `pb-40` en la
  web) o los últimos versículos quedan debajo de la barra y no hay forma de
  tocarlos.
- **Una NOTA DE PASAJE se guarda repetida en cada versículo que abarca**, con un
  campo nuevo `group` común (`BibleUserData.annotations[].group`, string vacío =
  nota suelta). Repetirla es lo que hace que salga al tocar *cualquiera* de sus
  versículos y que el resaltado siga siendo de cada uno; `group` es lo que
  permite editarla y borrarla como una sola cosa. Fuente: `savePassageAnnotation`
  / `deleteAnnotationGroup` / `getAnnotationsByGroup`, **espejadas** en
  `chat-app-frontend/src/store/useBibleStore.ts` y
  `holy_app/frontend/src/components/bibleService.js`.
- **Se escribe de UNA vez, no llamando N veces a `saveAnnotation`**: cada llamada
  relee el estado anterior (AsyncStorage/localStorage) y varias seguidas se
  pisarían entre ellas.
- **Al editar desde un solo versículo hay que recuperar el pasaje entero**
  (`getAnnotationsByGroup`), o al guardar la nota se queda reducida a ese
  versículo. Lo guardado es la referencia, no el texto: el texto se busca en el
  capítulo abierto (`getVerseText` en el hook de la web).
- **En la lista "Mis notas" una nota de pasaje sale UNA vez** (se agrupa por
  `group` y manda su primer versículo), y en la lectura del móvil la vista previa
  se pinta solo en el primer versículo del grupo (`noteAnchors`) — si no, el
  mismo texto aparecía repetido bajo cada versículo. El contador de la pestaña
  cuenta notas, no versículos anotados.
- **Orden de despliegue: BACKEND PRIMERO** (campo nuevo en un documento
  existente). Mongoose descarta en silencio lo que no está en el esquema: con el
  backend viejo, `group` se pierde al sincronizar y la nota de pasaje se degrada
  a notas sueltas idénticas.
- Cubierto por `holy_app/frontend/scripts/passageSelection.test.mjs`.

## Acciones de un versículo — `useVerseActions`

Todo lo que se puede hacer con un versículo (favorito, copiar, enviar a chat, publicar, enlace, resaltar, etiquetas, imagen, referencias cruzadas, memorizar, orar) + sus modales vive en `frontend/src/components/bible/useVerseActions.jsx`, no en `BibleDetail`. Quien muestre versículos monta el hook, pinta `modals` y llama a `openVerse({book, chapter, verse, text, ctx})`. Lo usan la página de Biblia y la lectura en vivo (`LiveReadingModal`, botón ⋯ por versículo; ahí el anfitrión conserva tocar-para-avanzar).

- Los favoritos/resaltados/notas **son estado del hook**: tenerlos duplicados fuera hacía que marcar un favorito desde la hoja no repintara la lista de al lado.
- `onGoToReference` es opcional, pero **el hook siempre resuelve un destino** (si no se lo pasan, navega a `/bible?ref=…`): `CrossRefsModal` lo invoca sin comprobar que exista, y una referencia cruzada SIEMPRE lleva a otro pasaje.
- Los modales van **dentro** del overlay que los usa (hijos ⇒ apilan encima sin pelearse con el z-index).

## Seminario — una clase puede repartir varios materiales

`seminar.classes[].materials: []` (hasta 10). El `material` suelto de antes sigue existiendo y se rellena con el primero de la lista, porque las clases viejas solo tienen ese campo. **No leer ninguno de los dos a mano**: `classMaterials(cls)` de `backend/utils/seminarFiles.js`, **espejado** en `frontend/src/lib/seminarFiles.js`. Al editar, el formulario manda SIEMPRE la lista completa (aunque quede vacía): es lo que permite quitar uno.

## Póster de versículos — composición (gancho, anclaje, velo, adornos)

Reescrito el 2026-08-01 para acercarlo a las imágenes que se comparten de verdad (estilo escritoesta.org). Lo que cambia el aspecto no es la paleta: es la **composición**.

- **Frase destacada ("gancho")**: las N primeras palabras del versículo se pintan como un **bloque aparte**, enorme y en caligráfica, y el resto va pequeño debajo. `hookWords` guarda SOLO el número de palabras (`splitHook`, espejado en los dos `verseRichText`): así no hay dos textos que sincronizar y **los índices de los tokens siguen siendo los del texto completo**, por lo que los estilos por palabra valen igual a ambos lados del corte. Con gancho, el cuerpo encoge (×0,74) o competirían.
- **Anclaje** `top|center|bottom` (`blockTop`): el bloque se apoya en un borde respetando `safeTop`/`safeBottom` (la marca del pie). `shiftY` (fondo de pantalla) **solo cuenta centrado**. Ninguna imagen de referencia lleva el texto centrado vertical.
- **El velo de la foto ya no cubre la foto entera.** `scrimFor(lum, anchor, textMode)` devuelve paradas normalizadas que consumen el canvas (`addColorStop`), la previa (`scrimCss` → CSS) y la app (`LinearGradient`): solo oscurece la franja del anclaje. **Y puede ser BLANCO**: sobre una foto clara el texto va oscuro (`photoText: auto|light|dark`, `photoPalette`, `photoInk` — con texto oscuro hay que invertir contorno y sombra o se emborrona). `measurePhoto(img, anchor)` mide la banda del **anclaje**, así que hay que volver a medir al moverlo.
- **Adornos** (`ORNAMENTS`): 8 separadores + "ninguno". En la web cada uno es **UN path SVG en una caja normalizada de 100×vh**, generado con helpers (`hoja`, `corazon`, `cruz`, `rombo`, `punto`, `barra`) — el canvas lo pinta con `Path2D` + escala y la previa con `<svg viewBox>`, así que no hay geometría duplicada. **En la app no hay `react-native-svg`** (sería módulo nativo y esto dejaría de llegar por `eas update`): allí los mismos adornos se componen con Views y un `♥`. Mismo diseño, otra técnica.
- **Pincelada tras la cita** (`refBadge`) y **marca de agua arriba** (`brandTop`). Sobre foto la pincelada va del color CONTRARIO al texto: ahí el acento ES el color del texto y saldría invisible.
- **Tipografías nuevas**: `caligrafica` = **Great Vibes** (la del gancho; Caveat es letra de cuaderno y no da ese aire) y `titular` = **Montserrat** para el cuerpo en mayúsculas espaciadas (`upper`). Montserrat **no** se empaqueta en la app (su .ttf solo existe como variable, 745 KB, y el peso variable no es fiable en Android): allí ese id cae en la sans del sistema. Es la única divergencia tipográfica.
- **Letras destacadas (8 añadidas el 2026-08-01)**: `romana` (Cinzel), `refinada` (Cormorant Garamond), `editorial` (Abril Fatface), `cartel` (Anton), `espigada` (Amatic SC), `fluida` (Dancing Script), `pincel` (Alex Brush), `romantica` (Parisienne). Todas OFL y **self-hosted en los dos sitios** (`public/fonts/*.woff2` + `assets/fonts/*.ttf`, con su `OFL-*.txt`), y van **al final de `FONTS`** porque `DEFAULT_FONT` es `FONTS[0]`. Al añadir una más:
  1. **El `sizeScale` se MIDE, no se estima**: cada familia ocupa distinto al mismo px. Regla: `sizeScale ≈ 0,49 / (altura de x en em)` (se lee de `sxHeight`/`unitsPerEm` de la tabla OS/2) y luego se comprueba pintando todas a la vez al mismo tamaño óptico. Si sube mucho, baja el `lineScale` (`≈ 1/(sizeScale·0,9)`) o las líneas se desparraman.
  2. **En la app se empaqueta una instancia ESTÁTICA del subconjunto latino**, nunca la variable (Android no la interpola bien — por eso `titular`/Montserrat sigue cayendo en la sans del sistema). Se saca con `https://fonts.googleapis.com/css?family=X:600` mandando un User-Agent viejo (devuelve `.ttf`), y el woff2 de la web se obtiene de ESE mismo ttf con `wawoff2.compress` para que las dos imágenes salgan idénticas.
  3. **El `@font-face` de esas estáticas declara `font-weight: 400` a secas, no un rango**: con un rango, la negrita por palabra no se notaría en la web mientras que en la app sí se sintetiza.
- **Las plantillas (`TEMPLATES`) son composiciones enteras**, no tema+letra: si se toca una, tocar la de la app también. Las cinco que estrenan las letras destacadas son `solemne` (Cinzel + cruz), `manifiesto` (Anton de gancho, cuerpo en mayúsculas, abajo a la izquierda), `filigrana` (Parisienne + Cormorant + laurel), `susurro` (Dancing Script entero — solo para versículos cortos) y `portada` (Abril Fatface arriba). **Una plantilla tiene que ser determinista**: `applyComposition` de la web solo cambia lo que la plantilla trae (lo necesitan los estilos guardados, donde un campo ausente debe dejarse como esté), así que el botón fuerza además `setRefBadge(!!tpl.refBadge)` — sin eso, la pincelada de la cita se heredaba de la plantilla anterior. La app ya lo hacía en `applyTemplate`.
- **Al añadir un campo al diseño hay que tocar CINCO sitios**: `posterLayout.js`, `versePoster.js`, el `Poster` de `VerseImageModal.jsx`, y en la app `versePosterLayout.ts` + `VerseImageSheet.tsx`. Y si además va en los estilos guardados, **la lista blanca de `saveVerseConfig` y el esquema `versePresets`** (`userModel.js`) — es whitelist: lo que no esté ahí se guarda vacío y el estilo deja de reproducir la imagen.
- **Cómo comprobar que la previa no miente**: `Poster` se exporta a propósito. Montarlo en una página suelta con las mismas props que `drawVersePoster` y mirar los dos resultados lado a lado es lo único que caza el fallo clásico de este archivo.

## Modales web con fondo que cierra — `onClick={onClose}` a secas pierde el trabajo

Un modal con `onClick={onClose}` en el fondo y `stopPropagation` en el cuadro **parece** correcto y no lo es: si el usuario **selecciona texto** dentro (arrastrando) y suelta el ratón fuera del cuadro, el navegador reparte ese `click` al **ancestro común** de donde se pulsó y donde se soltó — o sea el fondo —, así que el `stopPropagation` de dentro nunca llega a verlo y el modal se cierra. Pasaba al ir a seleccionar una parte del versículo para borrarla: se cerraba entero justo antes de pulsar Supr.

El arreglo es exigir que el gesto **empiece y acabe** en el fondo. **Desde 2026-08-05 no se copia a mano: está en `components/ModalBackdrop.jsx`** (probado en `frontend/scripts/modalBackdrop.test.mjs`, que ejercita los handlers reales — el gesto no se puede reproducir con un render estático). Usar ese componente y ya:
```jsx
<ModalBackdrop onClose={onClose}>
  <div className="bg-base-100 rounded-2xl …">…</div>
</ModalBackdrop>
```
**Cualquier modal con un `<textarea>`/`<input>` dentro necesita esto**, y volvió a morder: los cuatro modales del panel de contabilidad y socios nacieron con el `onClick` a secas y el usuario perdió un formulario de gasto a medio rellenar. La regla es **asimétrica** a propósito: empezar FUERA y soltar dentro sí cierra (la intención era cerrar y no se pierde nada); lo que se impide es empezar DENTRO y soltar fuera. `VerseImageModal.jsx` conserva su copia inline.

## Póster de versículos (compartir como imagen) — dos motores, un diseño

La imagen del versículo se genera **dos veces con tecnologías distintas** y hay que tocar las dos:
- **Web**: Canvas 2D (`holy_app/frontend/src/lib/versePoster.js`) + una vista previa en DOM (el componente `Poster` de `VerseImageModal.jsx`). Son DOS dibujantes: si una medida se cambia en uno solo, **la previa miente** y el usuario descarga algo distinto de lo que vio.
- **App**: una vista real capturada con `react-native-view-shot` (`chat-app-frontend/src/components/bible/VerseImageSheet.tsx`).

Las medidas y las listas (formatos, tipografías, plantillas) viven en **`posterLayout.js`** (web) y su espejo **`versePosterLayout.ts`** (app). Nada de números a mano en los dibujantes.

- **Todo se calcula con una escala del lado corto**, no en píxeles fijos. Estaba calibrado para un lienzo de 1080 y en el formato de proyector (1920) la referencia salía diminuta.
- **El póster que se CAPTURA nunca lleva `transform`.** En la app, la previa encogida es una copia; el que se captura va a tamaño completo fuera de pantalla (`left: -10000`) con `collapsable={false}`. Con el transform en la vista capturada, la imagen compartida sale encogida. Como capturar una vista no visible depende del dispositivo, hay respaldo: si falla, se captura la previa.
- **Fuentes**: mismas tres (OFL) en los dos, pero la web usa **woff2** (el service worker precachea woff2 y NO ttf) y React Native necesita **ttf** (no lee woff2). Se convierten con `wawoff2` (`compress`/`decompress`). En la app se cargan con `Font.loadAsync` al abrir la hoja — por eso llegan por `eas update` sin recompilar.
- **Antes de dibujar hay que esperar a la fuente CONCRETA** (`document.fonts.load(...)`), no solo a `document.fonts.ready`: con `font-display: swap` la fuente puede seguir en vuelo, el canvas pinta una vez y no reintenta → la imagen sale con la de reserva mientras la previa (HTML) sí se actualiza.
- **Cada familia ocupa distinto al mismo tamaño en px**: Caveat tiene la altura de x mucho menor y se veía enclenque. Se compensa con `sizeScale`/`lineScale` por fuente, no tocando la curva de tamaños (que es común).
- **El versículo se dibuja con `textAlign: "left"` y la x a mano.** Es lo que permite alinear el bloque y pintar una palabra de otro color a la vez. Ojo: hay que **restaurar el `textAlign`** para la referencia y la marca, que se dibujan después. El pie va siempre centrado.
- **El color del resaltado NO es el acento del tema.** El acento sirve para la línea y la referencia (elementos sueltos); dentro del párrafo, varios temas lo tienen en `#ffffff` —el mismo que el texto— o casi. Se mide el contraste WCAG (`highlightColor`) y se cae a un respaldo si no llega a 1.35. Sobre foto pasa siempre, porque ahí el acento es blanco.
- **El velo de las fotos se mide** (`veilFor`): luminancia de la **banda central** —el promedio de la foto entera engaña— en un lienzo de 32 px. Fijo, una foto oscura quedaba en barro y un cielo se comía el texto. En la app no está: RN no puede leer los píxeles sin otra dependencia.
- **Los estilos guardados y la firma** están en `User.versePresets` / `User.verseBrand` vía `GET/PUT /users/verse-config` del **backend de la web**. Las rutas van ANTES de la dinámica `/:username` o se las come. La app **no los tiene**: usa el chat-backend y harían falta endpoints equivalentes (los campos ya están en la base compartida).

## Correos de la web (`sendEmail.js`) — UN transporte con pool, no uno por correo

`utils/sendEmail.js` creaba un `nodemailer.createTransport` **dentro** de la función, o sea una conexión y un **`AUTH` por cada correo**. Cualquier ráfaga —el aviso de material nuevo va a TODOS los usuarios en lotes (`materialController`), el cron de socios recorre a todos los socios— dispara cientos de autenticaciones y Hostinger corta la IP del VPS entera con **`450 4.7.1 Error: too many AUTH commands`**. A partir de ahí fallan también los correos legítimos (recuperar contraseña, recordatorios), y el log de PM2 se llena de trazas idénticas de nodemailer.

- **Ese 450 NO significa "el destinatario no existe"**: pasa en la fase de `AUTH PLAIN`, antes de que el servidor sepa a quién va el mensaje. Un destinatario inexistente da `550 5.1.1` en la fase de destinatario.
- Ahora hay **un solo transporte compartido con `pool: true`, `maxConnections: 1`, `maxMessages: 100` y tope de 3 mensajes/segundo**: un AUTH por conexión aunque los que llaman disparen a la vez sin esperarse (el cron de socios llama a `sendEmail` sin `await`). Se crea **perezosamente** — nunca al importar, misma trampa de ESM que webPush.
- El `tls.rejectUnauthorized: false` que había marcado como "OBLIGATORIO" **no hacía falta**: verificado contra `smtp.hostinger.com:465`, el certificado valida. Se quitó.
- Se quitó también un `console.log("EMAIL_PASS:", …)` que escribía **la contraseña del correo en claro** en `/root/.pm2/logs`.
- `sendEmail` devuelve ahora `true`/`false` y registra el fallo en **una línea** (código + respuesta + destinatario) en vez de la traza entera.
- **Siguiente límite a vigilar**: con el pool ya no se agotan los AUTH, pero sigue existiendo el tope de envíos por hora del proveedor. Si aparece un `550` con "limit", el aviso de material nuevo a ~550 usuarios es el sospechoso.

## Web Push de la web — el `.env` llega TARDE (trampa de ESM, 2026-08-01)

El push web estuvo caído para toda la comunidad —`GET /api/notifications/push/public-key` devolvía **503 "Push web no configurado"** y nadie podía activar las notificaciones— **con las claves VAPID bien puestas en el `.env` del VPS**. No era el `.env` ni PM2: era el código.

- **La causa**: `utils/webPush.js` leía `process.env.VAPID_*` en la **raíz del módulo**, y `server.js` cargaba el entorno con una **sentencia** (`dotenv.config()`) en el cuerpo. En ESM **todos los `import` se evalúan antes que cualquier sentencia del módulo**, así que las rutas → el controlador → `webPush.js` corrían ANTES de que el `.env` existiera: leía `undefined` y se quedaba deshabilitado para siempre. `pm2 restart --update-env` **no lo arregla** (refresca el entorno del shell, no el archivo).
- **Por qué funcionó meses y luego no**: las claves estaban además en el entorno del proceso PM2 (de cuando se arrancó exportándolas). Al recrearse el proceso quedaron solo en el `.env` y el fallo latente salió a la luz. Nadie tocó nada.
- **El arreglo, por partida doble**: `webPush.js` resuelve su configuración de forma **perezosa** (la primera vez que se usa, cacheada), y `server.js` empieza por **`import "dotenv/config"`** — un import, no una llamada, para que el archivo se cargue dentro de la fase de imports (los imports sí se evalúan en orden).
- **Regla**: **ningún módulo de este backend debe leer `process.env` al importarse.** `webPush.js` era el único que lo hacía, y por eso era lo único roto; el resto lo lee dentro de funciones. Comprobación rápida: `grep -rn "^const [A-Z_]* = process\.env" utils/ config/ services/`.
- **Ojo al diagnosticar**: la fecha de `webPushSubscriptions[].createdAt` **se refresca cada vez que el usuario abre la app** (`resyncSubscription` reenvía la suscripción y el backend la reescribe), así que ver suscripciones "de hoy" NO significa que el push funcionara hoy.
- **Nunca generar claves VAPID nuevas para "arreglarlo"**: invalida todas las suscripciones existentes, el envío falla con **403** y la poda automática solo borra 404/410 — o sea que quedan zombis y esos usuarios dejan de recibir avisos sin enterarse. Primero buscar las originales (`.env` del VPS, `~/.pm2/dump.pm2`). Para confirmar que la clave en uso es la de siempre: "Enviar prueba" desde el perfil y ver si llega a una suscripción **antigua**.

## Correo sin verificar — no bloquea nada (2026-07-18)

Antes las dos apps hacían cosas opuestas con el mismo usuario: la web lo dejaba entrar sin más y la app respondía **403** en el login. Quien se registraba por la web e ignoraba el correo quedaba fuera de la app **para siempre y sin explicación**. Se unificó por lo blando: **verificar ya no es requisito en ninguna de las dos.**

- **App**: se quitó el bloqueo de `login` (`chat-app-backend/src/controllers/authController.ts`). Ojo: ese bloque además **reenviaba el código en CADA intento de login** — un correo por intento.
- `login`, `verifyEmail` y `googleSignIn` devuelven ahora `emailVerified` dentro de `user`; se guarda en `AuthUser` del store.
- **El aviso está duplicado y hay que editar los dos**: `holy_app/frontend/src/components/EmailNotVerifiedNotice.jsx` (en el perfil) y `chat-app-frontend/src/components/EmailNotVerifiedBanner.tsx` (en Ajustes).
- **El aviso no puede amenazar con consecuencias que no existen.** El texto anterior decía "necesitas verificarlo para entrar en la app móvil" y dejó de ser cierto en cuanto se quitó el 403. Ahora solo explica para qué sirve (recuperar la cuenta) y ofrece reenviar.
- **El banner de la app solo se muestra si `emailVerified === false`**, nunca con `undefined`: las sesiones guardadas por APKs anteriores no traen el campo y `loadToken` restaura el usuario de SecureStore **sin volver a pedir `/auth/me`** — o sea que el campo solo llega al hacer login de nuevo.
- En la web, el middleware `verifiedOnly` existe pero **no está aplicado a ninguna ruta**; no confundir su existencia con que haya restricciones.
- Se borró `EmailVerificationCard.jsx` (ocupaba lo alto del feed, estaba en inglés, y su botón "Deny" usaba `useState(true)` → **reaparecía en cada recarga**). Se le mostraba a 3 usuarios de 520.

## Google One Tap (`holy_app`) — el recuadro que detecta tu cuenta

`components/auth/GoogleOneTap.jsx`, montado en `Layout.jsx`. No pinta nada: dispara el prompt de Google (`useGoogleOneTapLogin`) y al aceptar llama al mismo `loginWithGoogle` que el botón, que **ya crea la cuenta si no existe** — de ahí la "inscripción automática".

- **`use_fedcm_for_prompt: true` es obligatorio.** Chrome ya solo permite One Tap por FedCM (murió con las cookies de terceros); sin esa opción el prompt no aparece y no hay error visible.
- **`auto_select: false` a propósito**: con auto_select, quien ya entró alguna vez queda dentro sin tocar nada. Se quiere un clic deliberado.
- **Tres guardas para no molestar a quien ya tiene sesión**, y hacen falta las tres: `user` de redux (no basta `isLoggedIn`, puede quedar en true con user null), la caché `currentUser` de localStorage (es lo que usa el socket antes de que redux se hidrate; el logout la borra) y un retardo de 2,5 s (hasta que `getLoginStatus` conteste, un usuario con sesión se ve como anónimo y el prompt asomaría y desaparecería).
- **`cancel_on_tap_outside: false`**: en móvil se descarta sin querer y Google castiga los descartes con un enfriamiento de horas.
- **Cómo probarlo**: navegador con sesión de Google abierta, en incógnito y sin haber entrado a la web. Si no hay cuenta de Google en el navegador, la consola dice `Not signed in with the identity provider` + `[GSI_LOGGER]: FedCM get() rejects` — eso significa que el camino llega bien a Google, no que esté roto.
- `components/auth/OAuth.jsx` es un botón "Continuar con Google" **sin onClick, no importado en ningún sitio** — código muerto, no confundirlo con el login real (`GoogleLogin` en `LoginForm`/`SignUpForm`).

## Tipo de material (estudio vs libro) y promociones

Un material tiene un `kind` (`materialModel.js`): `material` (estudio, por defecto — los docs viejos no lo tienen y valen eso) o `libro`. **No es una etiqueta más: decide con qué ofrenda mensual se lo lleva gratis un socio** — $20 un estudio, **$50 un libro**. El libro sigue en el catálogo y cualquiera puede comprarlo; lo que cambia es a quién le sale "Gratis para ti".

- **Fuente única de las reglas**: `backend/utils/materialAccess.js`, **espejado** en `frontend/src/lib/materialAccess.js` (`socioMinFor`, `hasSocioFreeAccess`, `isPromoActive`) — al tocarlas, editar los dos. Nada de comparar `socioAmount >= 20` a mano.
- **Quien decide es el servidor**: `resolveFreeAccess()` (`materialController.js`) lo calcula igual para `/purchase` (que manda) y para `GET /materials/slug/:slug`, que ahora lleva `optionalAuth` y devuelve `freeForMe` + `freeViaSeminar`. `MaterialPage` usa ese campo, no su propio cálculo (el desbloqueo por seminario depende de las inscripciones y el cliente no puede saberlo).
- **Libro en un seminario = gratis para el alumno socio de $20**, porque el material del seminario va incluido en la membresía. Solo cuenta si la clase enlaza el material **desde el selector** ("Elegir del catálogo" en `ClassMaterialsField`), que guarda `materialId` en `seminar.classes[].materials[]`. **Un enlace `/materiales/...` pegado a mano NO sirve**: sin `materialId` es una URL más. Lo comprueba `utils/materialSeminar.js` (`isMaterialInEnrolledSeminar`) + `hasSeminarAccess`, o sea que exige estar inscrito.
- **`materialId` tiene que sobrevivir al armado del payload** en `SeminarAddClass` y `SeminarEditClass` (y a `normalizeMaterials`, en los dos espejos de `seminarFiles.js`). Perderlo al re-guardar la clase convierte el material en un enlace suelto y el alumno vuelve a ver el precio.
- **Promoción** (`materialPromoModel.js`, doc único `key: "global"`): baja temporalmente el mínimo para TODO el catálogo ("este mes todo por $20, libros incluidos"). Se edita en el panel de materiales (`MaterialPromoCard`), `GET /materials/promo` (pública, **solo devuelve las vigentes**: si llega algo, está activa) + `GET/PUT /materials/admin/promo`. **Solo puede BAJAR el mínimo, nunca subirlo** (`Math.min` con el del tipo), o una promo mal puesta dejaría sin estudios a quien ya los tenía. El backend la cachea 30 s y la invalida al guardar.
- Sitios con el texto de los niveles: `HazteSocio.jsx` (tabla de 3 niveles + aviso de promo), `MaterialsCatalog.jsx` (insignia "Libro", CTA de subida) y `MaterialPage.jsx`.

## Entrega de materiales — biblioteca y enlaces que caducan

- **Los archivos NO se sirven desde Cloudinary.** Se subían como `upload` (público), así que su `secure_url` valía para siempre y para cualquiera: reenviar ese enlace regalaba el material. Ahora el cliente recibe una URL del backend firmada y caducada (`utils/materialDownload.js`) y `GET /materials/:id/download/:index?t=` **hace streaming** del archivo (nunca un 302 a Cloudinary, que devolvería justo la URL que se esconde). Esa ruta NO lleva `protect`: el permiso va en el token, para que el enlace del correo funcione sin sesión. Caducidad: 6 h en la web, 30 d en el correo. **Único sitio que revela URLs: `deliverableFiles()`** — al cambiar la entrega, se cambia ahí.
- **`GET /materials/me/purchases` + `/materiales/mios`** (`MyMaterials.jsx`): lo que el usuario ya obtuvo. Busca por `user` **y por email** porque el checkout admite invitado. No filtra por `published`: si el material se despublicó después, sigue siendo suyo.
- **Descarga en un clic**: `MaterialCheckout` acepta `autoStart`; con sesión y acceso gratis dispara la descarga al abrirse en vez de pedir un correo que ya se sabe.
- **Re-descargar NO es una venta**: `purchaseMaterial` busca una compra previa (mismo material + mismo usuario/email) y, si la hay y el importe es 0, hace `$inc timesDownloaded` en esa fila en vez de crear otra. Así `Material.salesCount` = personas distintas y `downloadCount` = entregas totales; sin esto, el reporte de ingresos se llenaba de filas de $0 y el catálogo contaba diez veces a la misma persona. Un pago SÍ crea fila nueva aunque ya lo tuviera.
- **`publicFields(m, { full })`**: los LISTADOS no llevan la descripción HTML (solo `descriptionText`, extracto plano de 400) ni los metadatos de archivo; la página del material sí (`full: true`). Al buscar en un listado, usar `searchText(m)` de `materialsApi.js`, no `plainText(m.description)`.

## Constancia de seminario

`GET /seminars/:activityId/certificate` la emite el SERVIDOR: comprueba que el alumno completó TODAS las clases y acuña un código una sola vez, guardado en `seminar.studentProgress[].certificate` (escritura **atómica** con `arrayFilters`, como todo lo que toca `studentProgress`). Devolver siempre el mismo código evita que dos descargas salgan con números distintos.

El documento se **dibuja en el cliente con Canvas 2D** (`frontend/src/lib/certificate.js`), como el póster de versículos y por el mismo motivo: html2canvas se cuelga en iOS. La barra de progreso + el botón viven en `components/seminario/SeminarProgress.jsx`, que sustituye a las cuatro copias que había (móvil y escritorio de `SeminarDetails` y `SeminarClassPage`).

## Perfil de usuario (`holy_app`) — privacidad y cuenta

`GET /users/:username` devolvía el documento ENTERO menos la contraseña, así que cualquiera con sesión veía de cualquier otro: correo, teléfono, **cuánto ofrenda al mes**, a quién tenía bloqueado, su **historial de avisos y sanciones**, sus suscripciones de push… Ahora pasa por `utils/publicProfile.js`, que es una lista **blanca** (al añadir un campo al modelo no sale hasta que se ponga ahí a propósito). El dueño y los admins siguen recibiendo el documento completo; a los demás se les manda además `hasBlockedMe` ya calculado, porque la lista de bloqueados es privada.

- La ruta es `optionalAuth`: un enlace de perfil compartido se abre **sin cuenta** (antes salía "Error cargando perfil" en rojo, porque `ProfilePage` gateaba también por `isAuthError` — el 401 de `/users/getUser` del invitado tumbaba la página entera). La búsqueda por correo dentro de `getPublicProfile` sí exige sesión, o sería un comprobador público de "¿está este correo registrado?".
- `updateProfile` respondía con `.select("password")` — proyección de **inclusión**: devolvía `{_id, password}`, es decir el hash. Es `-password`.
- **`updateProfile` usa `.save()`, no `findByIdAndUpdate`**: los hooks que espejan los campos compartidos con el móvil (`profilePicture` → `avatar`, `isVerified` → `emailVerified`) son `pre('save')` y **no hay `pre('findOneAndUpdate')`** en el modelo web. Con el update directo, cambiar la foto en la web dejaba la vieja en la app móvil.
- Los campos de texto se vacían con `""`: el filtro `if (req.body[field])` de antes descartaba las cadenas vacías, así que **borrar** la biografía o la ubicación no hacía nada.
- **Cambio de correo en dos pasos** (`requestEmailChange` / `confirmEmailChange`): pide la contraseña actual, guarda `pendingEmail` + token hasheado (1 h) y solo aplica el cambio cuando se abre el enlace enviado a la dirección NUEVA. **Bloqueado para cuentas de Google**: `loginWithGoogle` casa **por correo**, así que cambiarlo les dejaría fuera y su siguiente "Continuar con Google" crearía una cuenta duplicada.
- Cambiar contraseña está disponible también para **admins** (antes se les ocultaba sin motivo); eliminar la cuenta sigue vetado para ellos. A los usuarios de Google se les ofrece "Crear contraseña", que reutiliza el flujo de `forgotPassword` (tienen una contraseña aleatoria que nunca han visto).
- Los botones de amistad usan `FriendButton` + `GET /connections/status/:id` (que ya devuelve `{status, requestId}`). Antes se pedía ese estado y **no se usaba**: se decidía con `connections.some(c => c === authUser._id)`, comparando ObjectIds con `===`, y "Eliminar amigo" tenía `onClick={() => {}}`.

**Pestaña "Mis Actividades"** (`UserPostSection` → `MyActivitiesDashboard`). Muestra dos cosas de sistemas distintos, no confundirlas:
- Arriba, `MyActivitiesSummary.jsx`: resumen de las actividades espirituales del **chat-backend** (`/users/my-commitments` + `/users/me/activities` vía `chatApi`), que es lo que se edita en la página de actividades. Solo tipo/nombre/grupo/horario y un enlace a `/activities`; el detalle no se duplica. Lleva `refetchOnMount: "always"` — con el `staleTime` global de 1 h, unirse a una actividad no se vería aquí hasta recargar.
- Abajo, los **seminarios** (`Activity` de la web, `/activities/mine`). Dos trampas ya corregidas: el filtro era `{ createdBy: userId }`, así que a un alumno inscrito le salía SIEMPRE vacío (crear seminarios es de admins) — ahora es `$or` con `participants.user`; y la proyección no incluía `type` ni `seminar.enabled`, que son justo los campos por los que el cliente filtra para quedarse con los seminarios, así que la lista salía vacía **también para el admin**. Del seminario se proyecta SOLO `seminar.enabled` (nunca `studentProgress`).

## Materiales no listados — enlace privado con clave

Un material tiene TRES estados, combinando dos campos de `materialModel.js` (no hay enum `visibility`; los docs viejos solo tienen `published`):

| Estado | `published` / `unlisted` | Qué hace |
|---|---|---|
| Público | `true` / `false` | Catálogo + email + push + post en el feed |
| No listado | `true` / `true` | Fuera de catálogo, popup, difusión y feed. Solo por enlace `?k=<accessKey>` |
| Borrador | `false` / — | Oculto para todos |

- **Borrador NO genera enlace.** Era la duda que originó esto: los endpoints públicos filtran `published: true`, así que el enlace de un borrador da 404 hasta para su autor. Para repartir algo en privado hay que usar "no listado", no borrador.
- **`accessKey` es `select: false`** — hay que pedirla con `.select("+accessKey")` en los 4 sitios que la necesitan (`getMaterialBySlug`, `purchaseMaterial`, `adminListMaterials`, `adminGetMaterial`, `updateMaterial`, `regenerateMaterialKey`). Se compara con `crypto.timingSafeEqual`.
- **Sin clave se responde 404, no 403**: un 403 confirmaría que el slug existe.
- **La clave se BORRA al dejar de ser no listado**, así que volver a no listado reparte un enlace nuevo en vez de resucitar el viejo. Regenerarla a mano: `POST /materials/:id/regenerate-key`.
- **Hay que reenviar la clave DOS veces**: al cargar la página (`?k=` → `fetchMaterialBySlug(slug, key)`) y al descargar (`accessKey` en el body de `purchaseMaterial`). Olvidar la segunda deja una página que se ve pero de la que no se puede descargar.
- **Un no listado no tiene vista previa de WhatsApp/FB** a propósito: `/api/share/material/:slug` serviría portada y título en una URL sin clave. `MaterialPage`/`MaterialsDashboard` pasan `socialUrl` vacío en ese caso y `ShareModal` cae a `url` (`socialUrl || url`).
- **Cambiar el título cambia el slug y rompe el enlace ya repartido** (`uniqueSlug` en `updateMaterial`). Pasaba ya con los públicos, pero aquí duele porque ese enlace es el único acceso.
- De paso se tapó una fuga vieja: las rutas OG de `shareRoutes.js` consultaban `Material.findOne({ slug })` **sin filtrar `published`** → los bots (y cualquiera pegando `/api/share/material/<slug>`) veían título, descripción y portada de los borradores.

## Ingresos — una entrada de dinero, una fila (cuota de socio ≠ ingreso)

Había **dos libros de contabilidad para el mismo dinero**: `Offering` (chat-backend) y `User.socioPayments` (web), y el panel de Ingresos sumaba los dos. Un socio que paga por PayPal y al que además se le registraba la cuota para moverle la fecha aparecía **dos veces** (pasó con la ofrenda de $40 del 4/8/2026). No era un caso raro: le ocurre a **todo socio nuevo que llega por una ofrenda de PayPal**.

**La regla**: el dinero es SIEMPRE una ofrenda (o una venta de material). `socioPayments` es el **recibo** que mueve `socioNextPaymentDate`, no un ingreso; su `offeringId` apunta a la ofrenda que lo respalda y una cuota se limita a **etiquetar** esa ofrenda como "Socio".

- **Fuente única**: `holy_app/frontend/src/lib/incomeLedger.js` (`buildLedger`, `candidateOfferings`, `findDuplicate`, `linkedOfferingIds`), probado en `frontend/scripts/incomeLedger.test.mjs` (`node scripts/incomeLedger.test.mjs`, 15 casos). El esquema, en `backend/scripts/socioPayments.test.mjs`. **Al tocar las reglas, correr los dos** — son los únicos tests del repo.
- **Nada se empareja solo.** Un socio también hace ofrendas aparte de su cuota: vincular es siempre una decisión explícita del admin. `findDuplicate` (mismo importe ±0, ±12 días) solo AVISA y propone; el modal de "Registrar cuota" propone candidatas (suyas, 60 días, libres) para ELEGIR una.
- **Una ofrenda respalda como mucho UNA cuota** — lo comprueba el backend (409) en `registerSocioPayment` y `linkSocioPayment`.
- **Las ofrendas `type: 'subscription'` cuentan como cuota de socio automáticamente**: ese cobro siempre ES la cuota. Antes caían en "Ofrendas" y la tarjeta "Socios (mensual)" solo contaba a los manuales.
- **"Recibí el pago por fuera" crea la ofrenda manual** (`/offerings/admin/manual` vía `chatApi`) y luego la cuota que la referencia. Si la segunda llamada falla hay que decirlo: la ofrenda ya quedó anotada y volver a registrar duplicaría.
- **Una ofrenda manual vinculada a una cuota NO se puede borrar desde Ingresos** (`deletable: false`): la cuota sobreviviría y el respaldo de "ofrenda fuera del tope de 500" la volvería a pintar sumando lo mismo.
- **`registerSocioPayment` ya no fuerza `socioManual: true`** salvo que ya lo fuera o el dinero entrara por fuera: marcarlo convertía a un socio con suscripción de PayPal en manual y empezaba a recibir recordatorios de un cobro automático.
- Los datos anteriores a 2026-08-05 no tienen `offeringId`: siguen contando y el panel los marca "posible duplicado" con un botón que los vincula (`POST /users/socio/payment/link`, atómico con `arrayFilters` — ojo, hay que castear el `paymentId` a ObjectId a mano).

**Lo normal es ANULAR; borrar del todo es la excepción** (2026-08-12). El diálogo de la papelera ofrece las dos salidas: *anular* (por defecto, deja la fila tachada con su motivo) y, detrás de un segundo paso, *eliminar definitivamente* (`DELETE /offerings/admin/:id/hard`, `DELETE /expenses/:id`, `DELETE /materials/admin/sales/:id/hard` — los `DELETE` sin `/hard` siguen anulando por compatibilidad). El borrado es para lo que NUNCA fue dinero: una prueba, o una fila duplicada al registrar dos veces el mismo pago. Se lleva también el comprobante de Cloudinary del gasto y descuenta `salesCount` si la venta aún contaba. **Una ofrenda que respalda una cuota de socio no se puede borrar** (409): la cuota seguiría apuntando a ella y el panel la repintaría desde el socio — primero hay que deshacer la cuota en Socios. El diálogo (`RemoveDialog`, exportado de `IngresosAdmin.jsx` y probado en `adminPages.test.mjs`) tiene estado propio, por eso vive fuera del componente: `customUI` de `confirmAlert` no puede tenerlo.

**Nada se borra por accidente: se ANULA.** `Offering`, `MaterialPurchase` y `Expense` tienen `voided`/`voidReason`/`voidedAt`/`voidedBy`. La fila se sigue viendo tachada con su motivo y deja de sumar; un ingreso que desaparece sin rastro es lo que hace imposible explicar un descuadre meses después. Los `DELETE` de siempre (`/offerings/admin/:id`, `/materials/admin/sales/:id`) **ya no borran: anulan** — se mantienen solo por los clientes ya desplegados; lo nuevo usa `POST …/:id/void` (con `{ undo: true }` para deshacer).

**Reembolsos de PayPal.** El webhook maneja `PAYMENT.CAPTURE.REFUNDED` y `.REVERSED` (`handleCaptureRefunded`). Se guarda `refundedAmount` en vez de tocar `amount`, así un reembolso **parcial** también cuadra (neto = `amount - refundedAmount`) y no se pierde de cuánto fue la ofrenda. Para casarlo hace falta el **id de la captura** (`paypalCaptureId`), que ahora se guarda en los tres sitios que capturan; las ofrendas anteriores solo tienen el de la orden y caen a ese. Si no encaja con ninguna, se registra en el log con `console.error` — nunca en silencio: es dinero que salió.

**Dos unidades para el dinero, a propósito**: `Offering` y `Expense` en **centavos** (enteros — sumar dólares en coma flotante acumula error); `MaterialPurchase` en **dólares**, por historia. La conversión vive solo en `backend/utils/money.js` (`toCents`/`fromCents`), espejado en `frontend/src/lib/money.js`. Toda la API habla en dólares.

## Método de pago y comisión de una ofrenda (2026-08-13)

- **Los métodos son clave + etiqueta**, en `holy_app/frontend/src/lib/offeringMethods.js` (`METHODS`, `methodLabel`): la clave en minúsculas es lo que se guarda en `Offering.method` (campo libre, sin enum) y la etiqueta con mayúscula es lo único que se enseña (`Efectivo`, `PayPal`, `Western Union`, `Yape`…). Un método viejo o desconocido se pinta con la inicial en mayúscula en vez de perderse. Lo usan el modal de ofrenda, "Registrar cuota" de Socios y el `origin` del libro (`Manual · Efectivo` — ojo, hay un test que lo comprueba).
- Los **métodos de GASTO son otra lista** (`expenseMeta.js`), porque el backend web sí los valida contra un enum (`EXPENSE_METHODS`) y lo que no reconoce lo convierte en `"otro"` **en silencio**. `expenses.test.mjs` compara las dos copias.
- **La comisión de una ofrenda se puede escribir a mano** (campo "Comisión ($)" del modal, también al editar): `feeAmount` ya no depende de haber usado "Buscar en PayPal". Viaja en **CENTAVOS** (nació con ese buscador; el resto de la API va en dólares) y el backend rechaza una comisión mayor que el monto. En el `PUT` solo se toca si el cliente manda el campo, para que un cliente viejo no borre la guardada.
- **"Buscar en PayPal" busca ±3 días y se puede ampliar a ±15.** Si no aparece nada, el aviso lo explica: un cobro recién hecho tarda horas en salir en el informe de transacciones de PayPal, y ahí está el campo manual.

## Gastos y balance (`holy_app`)

La pestaña Ingresos pasó a llamarse **Contabilidad** el 2026-08-05: además de lo que entra, registra lo que sale.

- **`Expense`** (`backend/models/media/expenseModel.js`, rutas `/api/expenses`, todo `adminOnly`): categoría, método, **cuenta** (`paypal|banco|efectivo|otro` — sin esto el "saldo" es ficción: lo que hay en PayPal no es lo que hay en el sobre), beneficiario y **comprobante** (foto o PDF en Cloudinary). Los enums están espejados en `frontend/src/lib/expenseMeta.js`: lo que el backend no reconoce lo convierte en `"otro"` **en silencio**, así que al añadir una categoría hay que tocar los dos.
- **Los recurrentes NO se autoregistran.** `recurrence` + `nextDueDate` hacen que el panel avise cuando toca; el admin confirma con el importe REAL (`POST /expenses/:id/confirm-recurring`), que actualiza también el del padre para la próxima vez. Un proveedor que sube de precio quedaría anotado mal para siempre y nadie lo notaría.
- **El período puede ser un MES CONCRETO** (`<input type="month">`), no solo "el mes en curso": es lo que permite cerrar julio estando en agosto. Los rangos son **semiabiertos** `[desde, hasta)` (`frontend/src/lib/periods.js`) y la comparativa con el período anterior se desplaza por unidad de calendario, no restando días.
- **Exportar a CSV**: separador `;`, decimal `,` y BOM UTF-8 (lo que abre bien un Excel en español sin asistente). **Los gastos van en negativo**, así que sumar la columna da el balance.
- La gráfica (`components/admin/LedgerChart.jsx`) son barras agrupadas de 12 meses con **un solo eje** (misma unidad). La pareja de colores `#0d9488`/`#ea580c` está **validada** (contraste, banda de luminosidad y separación para daltonismo) contra el fondo claro y el oscuro: verde/rojo, que es lo intuitivo en contabilidad, es justo el par que no distingue un daltónico. Al cambiarla, volver a validarla.
- **Las descargas gratis se ocultan por defecto** (`hasMoney`). Entran como ventas de $0 y son la inmensa mayoría de las filas —medido en producción el 2026-08-05: **140 de 164 en julio**—, así que ahogaban las 24 que sí llevan dinero. Siguen en el libro (hay un interruptor) y el recuento de descargas vive en el catálogo: no se pierde nada. El contador del encabezado cuenta solo las que mueven dinero.
- **Moneda de la factura**: `currency` + `originalAmount` en `Expense`. `amount` es SIEMPRE dólares —lo que salió del banco, lo único que suma—; si el proveedor factura en otra moneda se guarda aparte lo que decía la factura. **No se convierte nada**: el tipo de cambio lo aplicó el banco el día del cargo y cualquier tasa que pusiéramos sería inventada. Salió al registrar el VPS de Hostinger, que factura en euros.
- **Ojo al género de las claves**: la CUENTA es `"otro"` y la MONEDA es `"otra"`. Si una de las dos copias se desalinea, el backend no reconoce el valor y cae al de por defecto **sin decir nada**.
- El CSV usa **etiquetas legibles**, no las claves internas (`Cuota de socio`, no `socio`; `Servicios (Cloudinary…)`, no `servicios`).

## Guardas de ruta — `user: null` no significa "invitado"

`RequireAdmin` redirigía en cuanto `user` era null, y al abrir una URL directa (recargar `/users`, pegar el enlace) ese es el estado normal mientras la sesión viaja. Resultado: **el admin era expulsado a la portada al entrar por URL**, y solo funcionaba navegando por dentro de la app, cuando el perfil ya estaba en memoria. Verificado en producción el 2026-08-05.

El arreglo es la bandera **`authChecked`** en `authSlice`: se pone en true cuando la comprobación TERMINA (getLoginStatus dice que no hay sesión, o getUser resuelve/falla). El guarda espera mientras `!authChecked || (isLoggedIn && !user)`. Cualquier guarda nueva debe hacer lo mismo: `isLoading` no vale, lo comparten muchos thunks.

## Socios — comprometido no es cobrado

`stats.monthlyTotal` sumaba el `socioAmount` de TODOS los socios, incluidos los que llevaban meses sin pagar, y se enseñaba como si fuera ingreso. Ahora hay dos números: **`committed`** (lo que se comprometieron a dar) y **`collected`** (lo que ha entrado este mes), más `collectionRate`. `monthlyTotal` sigue existiendo con el valor de `committed` porque lo leen clientes ya desplegados.

- Métricas en `backend/utils/socioStats.js` (`buildSocioRows`, `monthsLate`), fuera del controlador para poder probarlas sin arrastrar Google OAuth, Cloudinary y el correo. Probadas en `backend/scripts/socios.test.mjs`.
- **Dar de baja ya no borra el rastro**: `socioEndedAt` + `socioPayments` intactos. `GET /users/socios/admin?former=1` los devuelve con `isFormer`. Sin esto la rotación (cuántos entran y salen) era invisible y un ex-socio desaparecía como si nunca hubiera dado nada.
- **Un pago puede cubrir varios meses** (2026-08-12): `socioPayments[].months` (1 por defecto — los recibos viejos no lo traen). `registerSocioPayment` acepta `months` (1–24) y avanza la próxima fecha de golpe con `addMonths(base, n)`, **no** llamando N veces a `addOneMonth`: el día se recorta al último del mes en cada salto y un pago anual desde el 31 de enero acabaría el 28. `socioAmount` sigue siendo la cuota MENSUAL; `socioPayments[].amount` es lo que entró de verdad ($480). En Contabilidad no cambia nada: sigue siendo una ofrenda = una fila.
- **`collectionRate` mide socios AL DÍA (`upToDate`), no "¿pagó este mes?"**: con la medida vieja, quien paga el año por adelantado contaba como moroso los 11 meses de en medio. `collected`/`paidCount` siguen siendo caja (lo que entró este mes) y por eso el mes del pago anual sale con un pico. A los socios de PayPal (sin `socioNextPaymentDate`) se les sigue mirando el cobro del mes.
- `monthsLate` distingue 3 días de 3 meses de retraso; el badge dice "Debe 2 meses".
- `POST /users/socio/remind-all` avisa a todos los vencidos **en serie**: `sendEmail` usa un pool limitado a 3 mensajes/segundo y disparar N a la vez solo llena su cola.

## Tests — los únicos del repo (`npm test` en cada paquete)

No hay runner ni CI: son ficheros de `node:test` que se ejecutan a mano. **Al tocar cuentas, socios o la gráfica, correrlos.**

| Paquete | Qué cubre |
|---|---|
| `holy_app/frontend` | rangos y comparativas, libro de cuentas (duplicados, anulaciones, reembolsos parciales, monedas, CSV), render real de la gráfica, de las dos páginas de admin y del guarda `RequireAdmin`, extracción de enlaces (`extraLinks`) y render de los carruseles/visores de reels (`reelsUi`) |
| `holy_app/backend` | esquema de cuotas de socio, métricas comprometido/cobrado/retraso, esquema de gastos y conversión de dinero |
| `chat-app-backend` | reembolsos de PayPal, comisiones, códigos de un solo uso (caducidad/bloqueo/hasheo), límites de auth contra un servidor HTTP real, contrato de variables de entorno, y el logger (importa de `dist/`, así que compila primero) |

`frontend/scripts/jsx-loader.mjs` es lo que permite importar `.jsx` desde Node sin Vite: compila JSX con esbuild, resuelve los imports sin extensión y sustituye `import.meta.env`. **Un `vite build` compila igual una página que revienta al pintarse** — por eso las pruebas de render montan los componentes con `react-dom/server`. En SSR no corren los efectos, así que lo que se prueba es el estado inicial (sin datos).

## Suscripción de socio — el "código" NO es nuestro, y ojo con `window.open`

En `/hazte-socio` el nivel elegido llama a `/offerings/subscription` (chat-backend) y **se abre PayPal**: a partir de ahí todo pasa en paypal.com. Si alguien reporta "me manda un código y no me lo acepta", ese código es de PayPal (OTP de su cuenta o verificación de tarjeta), no de la web — nuestra única pantalla de código (`/loginWithCode`) no está enlazada desde ningún sitio y además está rota: `lToken` no se escribe nunca. Antes de buscar en nuestro código, comprobar que el enlace lleva a `www.paypal.com` y no a `sandbox.paypal.com` (`PAYPAL_MODE`).

**`window.open(url, "_blank", "noopener,...")` devuelve SIEMPRE `null`, aunque la pestaña se abra.** El respaldo `if (!win) window.location.href = url` de `openCheckout` (`OfferingPayPal.jsx`) se disparaba entonces siempre y dejaba **dos sesiones de PayPal abiertas para la misma suscripción**: pedir el código en una y escribirlo en la otra lo hace fallar. Para poder detectar el bloqueo de ventanas hay que abrir sin `noopener` y anular `win.opener` después.

## Botones de PayPal — el contenedor SIEMPRE con `isolate`

Los PayPal Buttons del SDK meten hijos con `z-index: 100` y `300`, y su propio contenedor (`.paypal-buttons`) es `position: relative` con `z-index: auto` — o sea que **NO crea contexto de apilamiento**. Esos 100/300 acaban compitiendo en la raíz de la página y le pasan por encima al navbar (`sticky z-30`) y al sidebar del móvil (`z-50`).

El arreglo es `isolate` (`isolation: isolate`) en el div donde se renderizan (`OfferingPayPal`, `PaypalButton`): encierra esos z-index en su propia caja sin tocar el layout. **No subir el z-index del navbar**: PayPal puede cambiar esos números cuando quiera y volveríamos a la carrera. Donde los botones ya viven dentro de un modal (`MaterialCheckout`, `fixed z-[100]`) no hace falta: el modal ya es un contexto de apilamiento.

## Recortar texto de Quill ("Ver más") — `overflow` va inline

`line-clamp-3` sobre un `.ql-editor` (descripción de un material, p. ej.) recorta a 3 líneas pero **deja barra de scroll dentro**: `quill.snow.css` trae `overflow-y: auto` y, al ser CSS **sin capa**, le gana a las utilidades de Tailwind v4 (que viven en `@layer utilities`) por mucho que se ordenen los imports. El `overflow: hidden` tiene que ir en `style` inline. Sin degradado de desvanecido: tendría que fundirse al color real del fondo (base-**200** en la página de materiales, otro en el tema oscuro) y cualquier fallo se ve como una mancha.

## Posts (`holy_app`) — el editor vacío no es una cadena vacía

El contenido de un post es HTML de Quill: un editor vacío devuelve `<p><br></p>`, así que `content.trim()` **nunca** detecta un post en blanco (así se colaban posts vacíos). Usar `hasVisibleText()` — espejo en `frontend/src/lib/postContent.js` y `backend/utils/postContent.js` — que quita etiquetas y `&nbsp;`. Validar en cliente (deshabilitar el botón) **y** en servidor (`createPost`/`updatePost` → 400). Quitar etiquetas es seguro mientras el editor no admita `<img>`/`<iframe>` (ver formatos de `PostEditor.jsx`).

---

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

---

## Conventions & gotchas

- `ActivityCommitment.startMinute` y `endMinute` solo pueden ser `0` o `30` — horarios en slots de 30 min.
- `ActivityType` `prayer` y `fasting` son aliases **deprecados** — usar `escala_oracion` / `ayuno`.
- Montos en `Offering` se guardan en **centavos** (entero), no dólares.
- `ioSingleton` (`setIO` / `getIO`) permite que controladores REST emitan eventos Socket.io sin importar `io` de `app.ts`.
- Cuando `privacySettings.showOnlineStatus` es false, el servidor sigue rastreando al usuario internamente pero no emite `user:online`/`user:offline` a otros clientes.
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
- `expo-av` está deprecado en SDK 54 (warning en logs) — funciona pero migrar eventualmente a `expo-audio` / `expo-video`.
- **New Architecture (`newArchEnabled: true`)**: con nueva arch, los paquetes deben usar TurboModules — `@react-native-async-storage/async-storage` v3.x y `react-native-get-random-values` v2.x. Las versiones anteriores (v2.x y v1.x respectivamente) usan el bridge viejo y `NativeModules` les llega `null`. No seguir ciegamente las recomendaciones de `expo-doctor` si el proyecto usa nueva arch.
- **New Architecture — state flush síncrono en handlers**: Con `newArchEnabled: true`, llamar a un state setter (`setFoo(null)`) dentro de un handler puede hacer flush síncrono antes de que el resto del handler lea ese state. Siempre capturar el valor en una variable local ANTES de llamar al setter. Ejemplo en `chat/[id].tsx → handleReact`:
  ```typescript
  const handleReact = (emoji: string) => {
    const msg = actionMessage; // capturar ANTES del setter
    setActionMessage(null);
    if (!msg || !socket) return; // msg sigue válido
    socket.emit('message:react', { messageId: msg._id, ... });
  };
  ```
- `expo-font` es peer dependency obligatoria de `@expo/vector-icons` en builds nativos (en Expo Go viene preinstalada). Sin ella, la app crashea al arrancar.
- **Colores de iconos/texto — nunca hardcodear `'#fff'`**: Cualquier color de texto o icono hardcodeado como `#fff` o `rgba(255,255,255,…)` es invisible en light mode si el fondo es blanco/claro. Siempre usar `colors.textPrimary`, `colors.textSecondary`, `colors.accent`, etc. del hook `useTheme()`.
- **Reaction pills (`MessageBubble.tsx`)**: los pills de reacción se renderizan FUERA de la burbuja (sobre `bgPrimary`), no dentro. En light mode, `isMine` + no-reacted usaba `countColor: 'rgba(255,255,255,0.8)'` → invisible sobre fondo blanco. El fix: para light mode usar `colors.bgSecondary`/`colors.textSecondary` independientemente de si es burbuja propia o ajena.
- **Modal con `KeyboardAvoidingView`**: el `KeyboardAvoidingView` debe ser el wrapper MÁS EXTERNO del modal (con `style={{ flex: 1 }}`), no estar dentro del backdrop `Pressable`. Si está dentro, `maxHeight: '92%'` no tiene referencia de altura correcta y el modal queda cortado. Usar `behavior="height"` en Android (`behavior="padding"` en iOS). Patrón correcto:
  ```tsx
  <Modal transparent>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={onClose}>   {/* backdrop */}
        <Pressable onPress={() => {}}>   {/* stop propagation */}
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            ...contenido del modal...
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>
  ```

---

## Plan de distribución de la app (decidido 2026-06-01, arranca 2026-06-02)

Estrategia de 3 pasos para compartir HolyChat **fuera de la Play Store** (empezar por el paso 1):

1. **EAS Internal Distribution** — generar el APK/build con `eas build --platform android --profile preview`; EAS devuelve un **link + QR** para compartir por WhatsApp y grupos. Rápido y gratis. *(Empezar aquí, desde mañana 2026-06-02.)*
2. **Botón de descarga en la web** — en paralelo, alojar el APK en el VPS existente (`holyholyholy.es`) y poner un botón "Descargar app" para una distribución más "oficial". Mismo APK; gestión de versiones manual.
3. **Tiendas alternativas (más adelante)** — considerar **Samsung Galaxy Store** (público mayormente Samsung) o **Amazon Appstore** para crecer y dar más confianza. Opcional, no urgente.

Nota: la Play Store queda como opción futura (cuota única $25, requiere AAB, política de privacidad, y revisar el tema PayPal/ofrendas vs Google Play Billing — las donaciones de organizaciones sin ánimo de lucro pueden estar exentas).

## Lectura en voz alta de la Biblia (móvil) — ya activa

`expo-speech` es un **módulo nativo**: no se activa con `eas update`. Estuvo escrito y sin funcionar desde el 2026-07-11 hasta el APK del **2026-07-13** (build `e8353a0e`, perfil `preview`, runtime 1.0.3, versionCode 4), que lo incluyó. Desde ahí el botón de escuchar sale solo (`src/hooks/useSpeech.ts` + barra de reproducción en `app/(tabs)/bible.tsx`).

**No quitar el `require('expo-speech')` dentro de `try/catch` ni la bandera `available`**: quien siga con un APK anterior a ese build no tiene el módulo, y sin la guarda la pantalla de la Biblia crashearía en vez de esconder el botón. Misma regla para cualquier módulo nativo nuevo que llegue por OTA.

La versión web usa la Web Speech API del navegador, sin dependencias.

## Pending work

- **Migrar expo-av** — `expo-av` muestra warning de deprecación en SDK 54. Migrar a `expo-audio` y `expo-video` en algún momento (no urgente).
