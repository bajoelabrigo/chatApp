# chat-app-backend — CLAUDE.md

API de la app móvil (Node + Express + Socket.io + MongoDB, TypeScript). PM2
`chat-backend`, puerto 3000, `https://api.holyholyholy.es`.

**Lo transversal está en el `CLAUDE.md` de la raíz** (base de datos compartida con la
web, latencia de Atlas, despliegue al VPS, variables de entorno, nginx, orden de
despliegue, índice de reglas espejadas). Aquí solo va lo propio de este backend.

---

## Biblia — versiones y copyright (LEER ANTES DE AÑADIR NINGUNA)

**La RVR1960 se retiró el 2026-07-11 y NO se puede volver a añadir sin licencia por escrito.** Su texto es propiedad de Sociedades Bíblicas Unidas (marca registrada; derechos administrados por la American Bible Society). El límite de cita libre es de 500 versículos — compartir versículos sueltos entra; distribuir la Biblia completa, y más aún permitir descargarla para uso offline, no.

Las 34 versiones actuales son **todas de dominio público**: `RV1909` (por defecto), `RVA`, `SSE`, `RV1865` en español; `KJV`, `WEB`, `ASV`, `BBE`, `DARBY`, `YLT`, `ACV`, `ANDERSON`, `CPDV`, `DRC`, `GENEVA1599`, `HAWEIS`, `JPS`, `KJVPCE`, `NOYES`, `OEB`, `OEBUK`, `RNKJV`, `ROTHERHAM`, `RWEBSTER`, `TCNT`, `TYNDALE`, `UKJV`, `WEBSTER` en inglés; y **6 idiomas añadidos el 2026-08-21**: `MARTIN` (francés, David Martin 1744), `SVV` (holandés, Statenvertaling 1637), `ELBERFELDER` (alemán, 1905), `SYNODAL` (ruso, 1876 — trae deuterocanónicos ortodoxos), `ESPERANTO` (Londona Biblio) y `VAMVAS` (griego, 1850). Todas desde `scrollmapper/bible_databases`.

**Sistema de idiomas (2026-08-21)**: cada versión declara `lang` en `VERSION_META` y el orden canónico de los 66 libros se resuelve por idioma desde **tres espejos** — al añadir un idioma, tocar los tres: `chat-app-backend/src/lib/bibleNames.ts` (`BOOK_ORDERS` + `namesFor`), `chat-app-frontend/src/constants/bible.ts` (`CANONICAL_ORDERS` + `langFlag` en `LANG_FLAGS`) y `holy_app/frontend/src/lib/bibleOrder.js` (arrays canónicos registrados en `ORDER_INDEX`; la web normaliza tildes, así que los idiomas entran solos). Los nombres del JSON de cada versión DEBEN coincidir exactamente con los del array de su idioma (verificado 66/66 en el smoke test). La búsqueda del versículo del día y el filtro por testamento usan `namesFor(lang)`; en el móvil la lectura por voz usa el código `lang` directamente y el orden alfabético el `lang` como locale.

**Versiones "solo en línea" (`remote: true`, desde 2026-08-21)**: la `RVR60` (© Sociedades Bíblicas Unidas 1960) NO tiene JSON local ni descarga offline — se sirve verso a verso desde **api.biblia.com** (Faithlife/Logos, key `BIBLIA_API_KEY` en el `.env`, solo en el servidor). Backend: `REMOTE_VERSIONS` en `bibleController.ts` + `src/services/bibliaService.ts` (caché por capítulo, TTL 6 h, máx. 200 LRU — nunca el texto completo). `getBooks`/`getChapters` se sirven de los órdenes canónicos sin llamar a la API; `getVerses`/`searchVerses` la llaman (el pasaje se pide con el nombre de libro EN INGLÉS, mapeado por índice canónico, formato `eachVerse=[VerseNum].[VerseText]`); solo `/bible/download` se sigue negando (400): sería distribuir el texto completo. Móvil: el picker muestra "☁️ en línea", se oculta el botón de descarga y se muestra la atribución "Reina Valera 1960 © Sociedades Bíblicas Unidas". La web funciona transparente (usa los mismos endpoints). **Parseo del capítulo**: `raw.split(/(?=\b\d+\.)/)` — el `\b` es imprescindible (sin él, "10." se partía en "1" + "0.").

**Versículo del día, temas y referencias cruzadas: TODO se resuelve por `passageIn`** (2026-08-27). Los tres catálogos (`dailyVerses.ts`, `bibleTopics.ts`, xrefs) guardan las referencias por ÍNDICE canónico de libro, y `passageIn(version, libro, capítulo, desde, hasta)` de `bibleController.ts` es el ÚNICO puente al texto: JSON local o capítulo remoto (cacheado 6 h). **Y cae a la versión por defecto cuando la pedida no lo tiene** — es la regla que importa: hasta esta fecha los tres devolvían 404/`{}`/vacío para las remotas, así que **al elegir RVR60 desaparecían el versículo del día (en la Biblia Y en la portada de la web), los temas y las referencias cruzadas**, sin ningún error visible: los clientes esconden esas tarjetas con el 404. El respaldo también arregla las biblias PARCIALES (un pasaje que la JPS no trae se enseña en RV1909 en vez de no enseñarse). El recuento de referencias de un capítulo (`getChapterXrefCounts`) sale ahora de un índice del propio dataset (`loadXrefCounts`), no de recorrer los versículos del JSON, justo para no depender del texto local; en una versión local se sigue filtrando por los versículos que esa edición trae.

**Tema del día** (2026-08-27): `GET /bible/topics/daily?tz=&version=` — `topicOfDay(dateKey)` en `lib/bibleTopics.ts`, mismo mecanismo determinista que `getDailyRef` pero con desfase primo (`days*7+3`), o tema y versículo avanzarían acompasados y las parejas serían siempre las mismas. Devuelve el tema CON sus pasajes ya resueltos: la tarjeta enseña una muestra y comparte el pasaje sin una segunda petición. La ruta va **antes** de `/topics/:key` o "daily" se toma por la clave de un tema. Tarjetas espejadas: `holy_app/frontend/src/components/DailyTopicCard.jsx` y `chat-app-frontend/src/components/bible/DailyTopicCard.tsx` — "Leer" abre el tema (`/bible?topic=<key>` en la web, la pestaña Temas con `initialKey` en el móvil) y "Compartir" ofrece las cuatro superficies que ya existían: grupo, chat (los dos son la misma lista de conversaciones filtrada por `isGroup`), publicar en la comunidad (editor con `linkedBible` / `?bible=<json>` en el móvil) y redes (enlace + QR / `Share` del sistema). El tema entero viaja como UN mensaje `bible` con la referencia = título del tema: abarca varios libros y "Números 6:24 (+15)" no diría nada.

**Las tarjetas del día también en el feed móvil de la web** (2026-08-27): en `Home.jsx` viven en la columna derecha, que es `hidden lg:block` — o sea que en el teléfono, por donde entra casi todo el mundo, el versículo del día no se veía en ninguna parte. Hay una copia `lg:hidden` sobre el feed.

**Ojo con las versiones parciales** (las biblias históricas no traen todo): `ANDERSON`, `HAWEIS`, `TCNT` son **solo NT**; `TYNDALE` solo Génesis + parte del NT; `JPS` **solo AT** (39 libros); `NOYES` NT + Salmos/Job/profetas; `OEB`/`OEBUK` Salmos + NT; `CPDV`/`DRC` traen los **deuterocanónicos** (73 libros: Tobit, Judit, Sabiduría, Eclesiástico, Baruc, 1-2 Macabeos — salen al final de la lista canónica). La tarjeta del versículo del día se oculta sola (el móvil captura el 404) cuando el pasaje de ese día no existe en la versión elegida.

**Excluidas a propósito** (el propio repo las marca con copyright/GPL, no subirlas): `AKJV`, `JUBILEE2000`, `LITV`, `MKJV` ("Copyrighted"), `KJVA`, `RLT` (GPL por los Strong's), `BSB`, `LEB`, `NHEB*` y `SpaRVG` (Gómez). `SpaRV` del repo es la **misma RV1909** que ya tenemos (solo difiere en corchetes de notas) y `SpaPlatense` (Straubinger, 1962) quedó fuera por duda razonable de copyright (Argentina: 70 años post-mortem).

**Gotcha de calidad (2026-08-21)**: el DARBY de scrollmapper llega con el espacio anterior a "God" eliminado ("AndGod", "ofGod", ",God", "]God"… ~3.900 casos). Se arregló con `/([^ "'\[])(God)/g` → `$1 $2` — los `[God` y `'God` son legítimos y se excluyen. Otros fixes puntuales aplicados en el mismo lote: `RWEBSTER` (8 versos reconstruidos desde Webster + 1 ligadura "fFrom"), `DRC` ("SauI"→"Saul"), `GENEVA1599` ("toAsaph"→"to Asaph"), `TYNDALE` (5 espacios perdidos + "BenIamin"→"Benjamin"), `RNKJV` (1 etiqueta `face="..."` colada en Mt 12:50). Los "pegados" que QUEDAN son ortografía intencional de esas ediciones: `JPS` ("HaShem"/"G-d"), `RNKJV` ("EliYah", יהוה), `UKJV` ("EleloheIsrael", "MeribahKadesh"), `TYNDALE` ("xM" = 10.000 en romano).

**Gotcha de IDs (2026-08-21)**: los ids de versión deben ir en MAYÚSCULAS (`DARBY`, no `Darby`). `getVersionData`/`resolveVersionId` normalizan el parámetro con `.toUpperCase()`, así que un id con minúsculas jamás coincide con `ALLOWED_VERSIONS` y cae en silencio a la RV1909 (los libros salen en español y no hay error). Es lo que pasó al añadir DARBY la primera vez.

## Toda interacción con un reel avisa a alguien (2026-08-28)

| Interacción | A quién avisa |
|---|---|
| Me gusta | al autor |
| Comentario | al autor |
| **Respuesta a un comentario** | **a quien escribió ese comentario** |
| **Compartir** | **al autor** |
| Mensaje privado | al autor, por el chat de siempre (push incluido) |

- **Compartir era la única sin aviso.** `POST /reels/:id/share` guarda
  `shares: [{userId, at}]` (con la hora dentro desde el principio, a diferencia
  de `likes`, que la necesitó en un arreglo aparte) y avisa. El filtro
  `shares.userId: {$ne}` hace de `$addToSet`: **compartir tres veces registra UNA
  y manda UN aviso**. Se llama al abrir el diálogo de compartir aunque el usuario
  lo cancele — no hay forma de saberlo, y quedarse sin aviso es peor.
- **La campana muestra las respuestas a TUS comentarios aunque el reel no sea
  tuyo.** `q_myReels` solo mira los propios, así que hacía falta una consulta
  aparte (`q_reelsConMisComentarios`); sin ella la respuesta llegaba por push y
  no quedaba en la campana de quien la recibía.
- Tipo nuevo `reel_share` en la campana — recordar la regla de CLAUDE.md:
  **un `kind` que el backend EMPIEZA a mandar va a los CLIENTES primero**.

## Comentarios de reels e historias: emojis, versículos y respuestas (2026-08-28)

El chat tenía emojis y Biblia desde siempre y estas cajas no tenían ninguna de
las dos: comentar aquí era escribir texto pelado.

- **`ComposerExtras`** (web) y los dos botones de `ReelCommentsSheet` (móvil)
  insertan TEXTO plano, no una tarjeta: un comentario es una cadena, no un
  documento con adjuntos como un post.
- **El selector de versículos necesitaba subir de z-index**: `BibleVerseModal`
  era `z-[95]` fijo y estas cajas viven dentro del visor (z-100) y de su hoja de
  comentarios (z-96), así que se abría DETRÁS y parecía que el botón no hacía
  nada. Ahora acepta `zIndex` (95 por defecto).

**Responder a un comentario**, un solo nivel como Instagram (responder a una
respuesta sigue colgando del comentario de arriba; anidar más hace ilegible un
hilo en un teléfono).
- `Reel.comments` pasa a llevar **`_id`** — los demás arreglos del modelo no lo
  llevan a propósito, pero aquí es lo que permite apuntar a UN comentario con un
  update atómico (`arrayFilters` sobre `comments._id`). En `arrayFilters`
  Mongoose **no castea**: el id va convertido a ObjectId a mano.
- Los comentarios anteriores al cambio no tenían id y habrían sido los únicos sin
  botón de responder: **`scripts/reelCommentIds.mjs`** se lo pone (idempotente,
  ya ejecutado: 4 comentarios en 3 reels).
- `getComments` resuelve los nombres de quienes respondieron en **UN solo
  `$lookup`** para todo el hilo; uno por respuesta sería una consulta por cara.
- La respuesta avisa a quien escribió el comentario, no al autor del reel.
- **La hoja del móvil estaba copiada** en `reels.tsx` y `stories.tsx`; ahora es
  `components/comunidad/ReelCommentsSheet.tsx`, espejo del
  `ReelCommentsModal.jsx` de la web.

## Feed de reels: variedad de autores y proyección (2026-08-28)

Los dos puntos amarillos que quedaban de la revisión, resueltos en la MISMA
agregación (`reelFeedPage` + `shapeStages` en `reelController.ts`).

**Variedad de autores**, igual que el feed de publicaciones: cada reel EXTRA del
mismo autor compite como si fuera 24 h más antiguo (`$setWindowFields` +
`$documentNumber` → `feedScore`). Sin esto quien publica mucho se queda la
portada — medido en producción, **4 de los 5 reels del feed eran de la misma
persona y salían seguidos**. Comprobado con datos sintéticos contra el propio
Mongo (`$documents`): `Prolifico > Prolifico > Prolifico > Prolifico > Ana >
Beto` pasa a `Prolifico > Ana > Beto > Prolifico > Prolifico > Prolifico`.
**Hay respaldo cronológico** si el servidor no soporta `$setWindowFields` (Mongo
5.0): sin él el feed saldría VACÍO en vez de mal ordenado.

**Proyección.** `Reel.find().lean()` traía los arreglos completos de `likes`,
`views` y `comments` para acabar usando solo sus recuentos. `$size` y `$in` los
resuelven en la base: medido con los 5 reels de hoy, la respuesta bajó de 4.570 a
2.726 bytes (−40%) **y ya no crece con la popularidad** — un reel con 5.000
vistas eran ~250 KB de arreglo viajando de París a São Paulo por cada carga.
- Lo usan los TRES endpoints de lista (`getReelsFeed`, `getStories`,
  `getUserReels`) vía `shapeStages`, y `shapeAggregated` les da la misma forma
  exacta que devolvía `serialize` — los clientes no notan el cambio.
- `$unwind` del autor va con `preserveNullAndEmptyArrays`: si al autor lo
  borraron, el reel sigue saliendo en vez de desaparecer sin explicación.
- Cubierto por `scripts/reelFeed.test.mjs`, que además vigila que nadie vuelva a
  un `find().lean()` sin proyección en esos tres endpoints.

## Reels e historias — lo social (2026-08-28)

La función estaba entera por dentro y vacía por fuera: **5 reels y 0 historias
con 615 usuarios**. Publicar no producía ninguna consecuencia, y eso es lo que
se arregló aquí.

**Bloqueos.** `getHiddenUserIds` vivía DENTRO de `postController`, así que el feed
de publicaciones respetaba los bloqueos y el de reels no: bloqueabas a alguien,
desaparecía de tu muro y lo seguías viendo en los reels. Está en
`services/blocking.ts` para que cualquier feed nuevo lo tenga a mano.
- **Los bloqueos se piden EN PARALELO con los reels y se filtran en memoria**, no
  con un `$nin`. Meterlos en la consulta obliga a esperarlos primero, y eso es un
  viaje más a Atlas (~205 ms) en un endpoint que el carrusel pide **cada minuto
  por persona**: medido, `/reels/stories` pasó de 620 ms a 340 ms al cambiarlo.
  A cambio una página puede devolver menos de `limit` elementos; con un bloqueo
  en toda la base, no se nota.

**Moderación.** `deleteReel` filtraba por `{_id, authorId}`: solo podía borrar
quien había subido el video, o sea nadie. Ahora también un admin general, y hay
`POST /reels/:id/report` que reutiliza el modelo `Report` de grupos y usuarios
(`targetType: 'reel'`, upsert para que denunciar dos veces no infle el recuento).
**El botón de eliminar de un admin solo está en la WEB**: el `AuthUser` del móvil
no guarda el rol, y todos los paneles de admin ya viven ahí.

**Avisos de me gusta y comentario.** `Reel.likedAt` guarda la hora de cada me
gusta — arreglo APARTE de `likes` por lo mismo que las encuestas: `$addToSet`
sobre un escalar deduplica, con objetos dentro no. Se mueve en el MISMO update.
Los me gusta anteriores no tienen hora y por eso no salen en la campana.
- Push por Expo **y** Web Push (`services/reelNotifier.ts`), nunca a uno mismo,
  con `tag` estable por reel para que varios me gusta actualicen un solo aviso.
- La sección de la campana va **FUERA del `if (groupIds.length > 0)`**: un reel no
  tiene nada que ver con estar en un grupo.
- **La hidratación de nombres es COMÚN con la de las encuestas.** Cada sección
  pedía los suyos y `notificationsPerf.test.mjs` saltó al llegar al 6º `await`;
  juntarlas ahorra un viaje entero por carga de campana.
- **Ids únicos**: el `id` de un aviso es sintético y en producción había dos
  `pollvote:…:Son demonios` iguales — React avisa de que con claves repetidas
  las filas se duplican u omiten. `getNotifications` descarta repetidos.

**Compartir de verdad.** El enlace era `holyholyholy.es/reels` a secas: quien lo
abría veía el primero de la lista. Ahora `/api/share/reel/:id` (Open Graph, en
`holy_app`) con la miniatura del **primer fotograma** (`so_1`) o la portada de
YouTube, y 302 a las personas. Compartir manda ESA url, no la de la SPA: el
scraper no ejecuta JS y del `/reels?reel=` solo vería el index.html genérico.

**Anillo de "sin ver".** El backend mandaba `viewed` en cada historia desde el
principio y ningún cliente lo pintaba. Ahora sí, en los dos.

**Responder a una historia por chat.** Abre (o crea) el chat 1:1 con el autor y
manda el mensaje. Va como **texto con el enlace de la historia**, NO como un
`type` nuevo: el chat ya pinta previas de enlace, así que la miniatura sale sola
desde la ruta de Open Graph, y estrenar un tipo de mensaje obliga a desplegar los
tres sitios en un orden concreto para nada. La barra va con `z-index` por encima
de las zonas táctiles de avanzar, o el toque se lo come el "siguiente".

**Reels en el perfil.** `GET /reels/user/:userId` devuelve sus reels y sus
historias vivas por separado. En la rejilla se pinta la MINIATURA, nunca un
reproductor por celda: una cuadrícula de reproductores agota los
descodificadores del teléfono (misma razón por la que en el feed solo suena el
reel activo).

**`addView` devolvía 404 cuando ya lo habías visto** (el filtro lleva
`views.userId: {$ne: yo}`, así que el update no encontraba nada). Los clientes se
lo tragaban, pero era mentir en el evento más frecuente de todos.

**Arnés de pruebas** (`holy_app/frontend/scripts/jsx-loader.mjs`): ahora compila
`.jsx` de `context/` y `hooks/` (no solo `src/`) y sustituye `socket.io-client`
por un doble — en Node carga su build de CommonJS y revienta con un `require`
que no existe en ESM. Sin eso no se puede montar en SSR nada que use el chat.
`reelsUi` y `extraLinks` **existían pero no estaban en el `npm test`**.

## Borrar un documento tiene que borrar su archivo de Cloudinary (2026-08-28)

Dos agujeros distintos, y el segundo lo abrió el propio editor multidestino:

**1. Las historias caducaban y su video se quedaba.** El índice TTL de Mongo
borraba el documento en cuanto vencía, con el `cloudinaryPublicId` dentro, y
**nadie podía limpiar el video después porque ya no quedaba rastro de cuál era**.
Una historia es justo lo que más se publica y menos dura.
- El borrado real lo hace ahora un barrido en `cronService` (**cada 10 min**):
  borra el documento Y el archivo.
- El TTL pasa a ser red de seguridad con **3 días de margen**
  (`scripts/reelsTtlGrace.mjs`, un `collMod`). **Mongoose NUNCA cambia las
  opciones de un índice que ya existe**: ponerlo en el esquema no habría hecho
  nada, en silencio. Sin ese script el barrido no llega a tiempo y el agujero
  sigue abierto.
- Los clientes no notan nada: las lecturas ya filtran `expiresAt > ahora`, así
  que una historia vencida es invisible desde el segundo en que vence.

**2. Un mismo archivo puede tener VARIOS dueños.** Desde que el editor permite
marcar publicación + reel + historia a la vez, el video se sube UNA sola vez y
los tres documentos comparten `cloudinaryPublicId`. Borrar uno destruía el video
de los otros: el reel se ve, la historia no, y nadie entiende por qué.
- **Nada se destruye sin recuento de referencias**:
  `chat-app-backend/src/services/mediaCleanup.ts` (`deleteAssetIfUnused`)
  y su espejo `holy_app/backend/utils/cloudinaryDelete.js`
  (`destroyCloudinaryUrlsIfUnused`) — al tocar las reglas, editar las dos.
- **La clave de búsqueda es el `publicId`, NUNCA la URL entera.** El mismo
  archivo se guarda con URLs distintas según quién las escribiera: con prefijo de
  versión o sin él, con transformaciones por delante (`/f_mp4/`, `/so_1,w_640/`)
  y en los posts con el nombre original en el fragmento (`…mp4#name=video.mp4`).
  Comparar cadenas completas da un "no está referenciado" falso — y ese es el
  fallo caro, porque es un borrado de más. Los puntos del publicId se escapan en
  el regex o `chat-app/x.mp4` casaría también `xXmp4`.
- **Ante cualquier duda NO se borra**: si la comprobación falla, el archivo se
  queda. Uno que sobra cuesta céntimos; uno borrado de más rompe un reel vivo.
- `messages` **no** se consulta a propósito: los adjuntos del chat se suben por
  mensaje y jamás comparten archivo, y un regex ahí es un barrido completo contra
  el M0 de París (~205 ms por viaje) cada vez que caduca una historia.
- **Hay DOS `deletePost`**, uno por backend, y los dos limpiaban sin comprobar:
  `chat-app-backend/src/controllers/postController.ts` (el que usa la app) y
  `holy_app/backend/controllers/media/postController.js` (el de la web). La
  colección `posts` es la MISMA para los dos.
- Cubierto por `chat-app-backend/scripts/mediaCleanup.test.mjs`, que cazó de
  entrada que `publicIdFromUrl` no quitaba el fragmento `#name=` y devolvía un
  publicId con basura pegada.

## Qué gasta la cuenta de Cloudinary — medido, no supuesto (2026-08-28)

Con la API de administración (`cloudinary.api.usage()`), cuenta real `drojpkloa`:

| | valor | créditos | % del gasto |
|---|---|---|---|
| Plan | **Small PAYG**, 34,74 de 60 créditos (**57,9%**) | | |
| **Ancho de banda** | 34,4 GB | **29,51** | **85%** |
| Transformaciones | 3.443 | 3,44 | 10% |
| Almacenamiento | 1,92 GB | 1,79 | 5% |
| Videos (53 archivos) | **147 MB en total** | — | 7,7% del almacenamiento |

**Lo que se lleva la cuenta es el TRÁFICO, no el almacenamiento**, y los videos
son una parte diminuta de lo guardado. Consecuencias al optimizar aquí:

- **Comprimir antes de subir sigue siendo la palanca correcta para los videos**,
  pero por el tráfico de CADA reproducción, no por el disco: un video de 13 MB
  visto 100 veces son 1,3 GB de tráfico.
- **NO tocar `videoPlayUrl` para ahorrar el derivado `f_mp4`.** Es tentador (cada
  derivado duplica el archivo), pero duplicar los 147 MB de video entero cuesta
  ~0,14 créditos de 60. No compensa el riesgo de servir un `.mp4` con HEVC a un
  navegador que no lo descodifica.
- La palanca de verdad para el tráfico ya está puesta y es `cld()` en las
  imágenes (ver el apartado del principio).

**Cómo repetir la medida** (no hay panel que lo desglose así): un script suelto
en `chat-app-backend/` con `cloudinary.api.usage()` y `cloudinary.api.resources({resource_type:'video'})`. El `.env` del backend ya tiene las credenciales.

## Compresión de video en `/upload` — y cómo saber si ffmpeg sigue vivo

`compressVideo` (`uploadController.ts`) recodifica con ffmpeg todo video > 10 MB
antes de subirlo a Cloudinary. Si ffmpeg falta o falla, se sube el original: la
subida **nunca** se rompe por esto.

- **`-pix_fmt yuv420p` + `-profile:v high -level 4.0` no son adorno.** Un iPhone
  graba en HEVC de **10 bits**, y libx264 hereda ese formato produciendo un
  **High 10** que la mayoría de navegadores y teléfonos NO reproducen: el video
  quedaría en negro justo después de "comprimirlo bien".
- **CRF 26, no 30.** Cada +6 de CRF ≈ la mitad de peso; el 30 que había
  emborronaba las escenas con movimiento, que es justo lo que se graba en un
  reel. Con 26 el archivo sube ~60% respecto al 30 y sigue siendo una fracción
  del original. Audio a 128k.
- **`-map_metadata -1`**: fuera EXIF y geolocalización, igual que en las
  imágenes (`sharp`).
- **El fallo ya no es silencioso.** Antes `catch { return null }` se tragaba
  todo y no había forma de saber si ffmpeg seguía instalado en el VPS. Ahora
  escribe una línea por subida: `video comprimido 28.0 MB -> 1.1 MB (-96%)`, o
  `ffmpeg NO está instalado` (ENOENT) con el comando para arreglarlo.
  Comprobación directa: `ssh holyvps "ffmpeg -version | head -1"`.

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

## Popups de inicio — configurables desde el dashboard

El popup de la esquina inferior (web y app) **ya no está hardcodeado**: lo gobierna un documento único `PopupConfig` (`chat-app-backend/src/models/PopupConfig.ts`) que edita el admin general en **`/users` → pestaña "Popups"** (`holy_app/frontend/src/pages/userlist/PopupsAdmin.jsx`).

- **Backend**: `GET /public/popup-config` (SIN auth — la página pública `/descargar` también la lee para los videos), `PUT /popup/config` + `GET /popup/stats` + `POST /popup/stats/reset` (solo `isGlobalAdmin`), `POST /popup/event` (auth; `$inc` atómico de vistas/clics/cierres).
- **Categorías (`kind`)**: `material`, `prayer`, `activity`, `app` (descarga/actualización, con QR), `custom` (anuncio libre). El **orden del arreglo `kinds` es el orden de rotación**; cada una tiene `enabled`, `audience` (`all|web|app`) y ventana `startsAt`/`endsAt`.
- **Política duplicada en los dos clientes — al tocarla, editar los dos**: `chat-app-frontend/src/services/dailyPopupService.ts` y `holy_app/frontend/src/lib/popupPolicy.js` (rotación por día + veces mostradas hoy, `timesPerDay`, `minGapMinutes`, `durationSeconds` de autocierre, `quietHours` en hora local). Estado local: clave `dailyPopupState` (AsyncStorage / localStorage) con `{date,count,lastAt,kinds}` — sustituye a la vieja `dailyPopupDate`.
- **`kind: 'app'`**: en la web sale siempre que esté activo (QR + botón de APK); en la app **solo si `version` de `app.json` < `appUpdate.latestVersion`** (`isOlderVersion`, comparación numérica). Para avisar de una actualización basta con subir ese número en el dashboard — no hace falta desplegar nada.
- **Videos de `/descargar`**: `helpVideos` de la misma config (playlist; el 1º es el destacado). Se renderizan con el facade `LiteYouTube`. El admin pega la URL de YouTube y el backend extrae el ID.
- **Orden de despliegue**: primero el backend. Si `/public/popup-config` no existe, `fetchPopupConfig` devuelve `null` y **no se muestra ningún popup** en ninguno de los dos clientes (falla en seguro, pero silencioso).

---

## Convenciones del dominio

- `ActivityCommitment.startMinute` y `endMinute` solo pueden ser `0` o `30` — horarios en slots de 30 min.
- `ActivityType` `prayer` y `fasting` son aliases **deprecados** — usar `escala_oracion` / `ayuno`.
- Montos en `Offering` se guardan en **centavos** (entero), no dólares.
- `ioSingleton` (`setIO` / `getIO`) permite que controladores REST emitan eventos Socket.io sin importar `io` de `app.ts`.
- Cuando `privacySettings.showOnlineStatus` es false, el servidor sigue rastreando al usuario internamente pero no emite `user:online`/`user:offline` a otros clientes.
