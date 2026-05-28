# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**HolyChat** — WhatsApp-like mobile chat app (React Native/Expo) with a Christian/religious community layer: group activities (fasting, vigils, prayer), activity commitments with timezone-aware push reminders, prayer requests, in-app Bible reader, and PayPal offerings/subscriptions.

Monorepo structure:
- `chat-app-backend/` — Node.js + Express + Socket.io + MongoDB API (TypeScript)
- `chat-app-frontend/` — React Native Expo 54 app (TypeScript, git submodule)

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
- **Lista de chats** (`chats.tsx`) — `SwipeableRow`: deslizar izquierda revela botones "Más" y "Archivar". `ACTION_WIDTH = 144`, `SNAP_THRESHOLD = 40`. El componente vive al final del archivo fuera de `ChatsScreen`.
- **Burbuja de mensaje** (`chat/[id].tsx`) — `SwipeableMessage`: deslizar derecha ≥ 64px activa reply automáticamente (`setReplyingTo(msg)`). Muestra icono `↩` semitransparente que se opacifica progresivamente. No aplica a mensajes eliminados (`isDeletedForEveryone`). El componente se define fuera de `ChatScreen`.
- Patrón común: `onMoveShouldSetPanResponder` solo activa si movimiento horizontal > vertical y > umbral mínimo (8–10px). Usar `useRef(false)` para el flag `triggered`/`isOpen` — los callbacks del PanResponder leen el ref correctamente sin problemas de stale closure porque el ref es el mismo objeto durante todo el ciclo de vida.

**Pantalla de chats — secciones**:
- **"Quizás los conozcas"**: scroll horizontal en `ListHeaderComponent` con usuarios de `GET /conversations/users/suggested`. Botón `+` abre modal de todos los usuarios.
- **Modal "Todos los usuarios"**: carga todos los usuarios al abrir (query vacío), filtra en tiempo real. Tapping crea/abre conversación.
- **Archivados**: el botón navega a `/(tabs)/settings?section=archivados` en lugar de expandir inline. Los archivados se gestionan en `settings.tsx`.

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
PAYPAL_MODE=sandbox
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

---

## Pending work

- **PayPal sandbox → live** — cambiar `PAYPAL_MODE=live` en el VPS y usar credenciales live cuando esté listo para producción real.
- **Migrar expo-av** — `expo-av` muestra warning de deprecación en SDK 54. Migrar a `expo-audio` y `expo-video` en algún momento (no urgente).
