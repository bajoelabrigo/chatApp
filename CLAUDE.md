# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**HolyChat** — WhatsApp-like mobile chat app (React Native/Expo) with a Christian/religious community layer: group activities (fasting, vigils, prayer), activity commitments with timezone-aware push reminders, prayer requests, in-app Bible reader, and PayPal offerings/subscriptions.

Monorepo structure:
- `chat-app-backend/` — Node.js + Express + Socket.io + MongoDB API (TypeScript)
- `chat-app-frontend/` — React Native Expo 54 app (TypeScript). Carpeta normal dentro de este repo (antes era submódulo; se integró el 2026-06-20 porque no tenía remoto propio). Los cambios de la app se commitean directo en `chatApp`; se despliega con `eas update`.
- `holy_app/` — **red social web** (Node/Express + React) que **comparte la misma base de datos** que la app móvil. Es su propio repo git (no parte de este). Ver "Base de datos unificada".

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

Las 7 versiones actuales son **todas de dominio público**: `RV1909` (por defecto), `RVA`, `SSE` (Sagradas Escrituras 1569) en español; `KJV`, `WEB`, `ASV`, `BBE` en inglés.

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
- Suscripción: `POST /offerings/subscription` con `tier` (sub_5/sub_10/sub_20) → `GET /offerings/sub-return`
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

## Tipos de mensaje nuevos (leer antes de añadir uno)

Al estrenar `type: 'contact'` (2026-07-09) el mensaje se guardaba bien pero **no se veía en ningún cliente**. Tres trampas, todas vuelven a morder con el próximo tipo:

1. **Desplegar el backend ANTES que los clientes.** Con el enum viejo de `Message.type`, `Message.create` lanza `ValidationError`, el `try/catch` de `message:send` se lo traga y el envío se descarta en silencio. La app entretanto dice "enviado": la confirmación es optimista, no espera al servidor (no hay `ack`).
2. **Móvil — burbuja invisible**: `MessageBubble` renderiza por rama (`isImage`/`isAudio`/…). Un tipo sin rama produce una burbuja de altura cero, indistinguible de "el mensaje no llegó". Hay una rama de respaldo `isUnknownType` → "Actualiza la aplicación"; mantenerla.
3. **Web — el mensaje ni se monta**: `Messages.jsx` solo renderiza `<Message>` si hay `files` o `message` (texto). Los mensajes de llamada se salvan por casualidad (su `content` es `"audio"`/`"video"`). El guardia acepta ahora cualquier `type !== "text"`; **no vaciar `message` en `adaptMessage`** para un tipo nuevo (es lo que hizo desaparecer los contactos).

Sitios a actualizar al añadir un tipo: `Message.ts` (enum + campos), `message:send`, `previewOf` (`notificationController.ts`), preview push en `socketHandler.ts`, `lastMsgPreview` (`chats.tsx`), `lastMessagePreview` (`Conversation.jsx` web), `ReplyPreview` en ambos clientes.

## Subir archivos en el chat (`/upload`)

Un solo endpoint para los dos clientes: `POST /upload` (multer en memoria → Cloudinary). El **servidor decide el tipo de mensaje** a partir del mimetype real (`getMessageType`): `image`, `audio`, `video` o `document`. Los clientes deben usar el `messageType` que devuelve, no el que ellos supusieron (por el selector de documentos se cuela un `.mp4`).

- **Topes por tipo** (`uploadController.ts`, espejados en `holy_app/frontend/src/utils/chatFiles.js` → `MAX_MB`): imagen 10 MB, documento 10 MB, audio 25 MB, video 64 MB. El tope global de multer es 64 MB. Al cambiarlos, cambiar **los dos** sitios.
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

## Posts (`holy_app`) — el editor vacío no es una cadena vacía

El contenido de un post es HTML de Quill: un editor vacío devuelve `<p><br></p>`, así que `content.trim()` **nunca** detecta un post en blanco (así se colaban posts vacíos). Usar `hasVisibleText()` — espejo en `frontend/src/lib/postContent.js` y `backend/utils/postContent.js` — que quita etiquetas y `&nbsp;`. Validar en cliente (deshabilitar el botón) **y** en servidor (`createPost`/`updatePost` → 400). Quitar etiquetas es seguro mientras el editor no admita `<img>`/`<iframe>` (ver formatos de `PostEditor.jsx`).

---

## Environment variables

### Backend (`chat-app-backend/.env`)
```
PORT=3000
MONGODB_URI=
JWT_SECRET=
JWT_REFRESH_SECRET=
GOOGLE_CLIENT_ID=
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
BACKEND_URL=https://api.holyholyholy.es
PEXELS_API_KEY=
```

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

## Pending work

- **Lectura en voz alta de la Biblia en el móvil — ESPERANDO EL PRÓXIMO `eas build`** (2026-07-11). El código ya está escrito y typechequea (`src/hooks/useSpeech.ts` + botón y barra de reproducción en `app/(tabs)/bible.tsx`), y `expo-speech` ya está en `package.json`. Pero `expo-speech` es un **módulo nativo**: no se activa con `eas update`, hace falta compilar un APK nuevo. Por eso `useSpeech` hace `require('expo-speech')` dentro de un `try/catch` y expone `available`: en los APKs actuales el módulo nativo no existe, `available` es false y el botón de escuchar simplemente no aparece (en vez de crashear). **Al hacer el siguiente build se activa solo, sin tocar código.** La versión web ya está en producción (usa la Web Speech API del navegador, sin dependencias).
- **Migrar expo-av** — `expo-av` muestra warning de deprecación en SDK 54. Migrar a `expo-audio` y `expo-video` en algún momento (no urgente).
