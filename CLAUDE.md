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
- `Message` — `type: text|image|audio|document|call`, `status: sent|delivered|read`, `readBy[]`, `deletedFor[]`, `isDeletedForEveryone`, `replyTo` (snapshot embebido), `reactions[]`
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

**Theming**: `src/context/ThemeContext.tsx` — `ThemeProvider` + `useTheme()` hook. Paleta light (azul `#3B82F6`) y dark (indigo `#6366F1`). Todo el verde WhatsApp fue eliminado. Importar `useTheme()` en cualquier screen nueva y usar `colors.xxx` para todos los colores.
- Bubble mine dark: `#4338CA` (indigo-700). Bubble theirs dark: `#1E2236`.
- En cualquier componente que renderice texto sobre `bubbleMine` en dark, usar colores claros (e.g., `rgba(255,255,255,0.70)`) — el fondo indigo oscuro hace invisible cualquier texto oscuro.

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
```

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

- **Migrar expo-av** — `expo-av` muestra warning de deprecación en SDK 54. Migrar a `expo-audio` y `expo-video` en algún momento (no urgente).
