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

**Real-time (Socket.io)** (`src/socket/socketHandler.ts`):
- Auth middleware lee `socket.handshake.auth.token` (mismo JWT que REST)
- Al conectar: rooms `user:<userId>` (personal) + una room por conversación
- Mapas en memoria: `onlineUsers: Map<userId, Set<socketId>>` y `activeCalls: Map<callId, ActiveCall>`
- Eventos: `message:send/read/edit/delete/react`, `typing:start/stop`, WebRTC signaling (`call:initiate/answer/ice-candidate/end/reject`), LiveKit (`call:group:start`)
- Para enviar eventos desde controladores REST: `io.to(`user:${userId}`)` via `ioSingleton` (`src/socket/ioSingleton.ts`)

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
- `PrayerRequest` — ligada a un grupo
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
- `call.tsx` (WebRTC 1:1), `group-call.tsx` (LiveKit grupal)
- `contact/[id].tsx`, `group-profile/[id].tsx`, `group-media/[id].tsx`

**Estado**: Zustand stores en `src/store/`. API calls via axios en `src/services/authService.ts` (instancia base apuntando a `EXPO_PUBLIC_API_URL`).

**Theming**: `src/context/ThemeContext.tsx` — `ThemeProvider` + `useTheme()` hook. Paleta light (azul `#3B82F6`) y dark (indigo `#6366F1`). Todo el verde WhatsApp fue eliminado. Importar `useTheme()` en cualquier screen nueva y usar `colors.xxx` para todos los colores.

**Styling**: NativeWind v4 (Tailwind para React Native). `global.css` es el entry de Tailwind; `tailwind.config.js` configura los content paths.

**Llamadas**:
- 1:1: WebRTC puro via Socket.io (`src/services/callService.ts`, `src/store/useCallStore.ts`)
- Grupales: LiveKit (`@livekit/react-native`) — backend genera token en `/calls/token`

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
- El archivo `.env` del frontend **no llega a EAS**. Cualquier `EXPO_PUBLIC_*` nueva debe añadirse también en `eas.json` bajo `env` en cada perfil.
- `src/lib/` contiene los JSONs de la Biblia — TypeScript no los copia al compilar. Siempre subir junto con `dist/` al VPS.
- `expo-av` está deprecado en SDK 54 (warning en logs) — funciona pero migrar eventualmente a `expo-audio` / `expo-video`.
- **New Architecture (`newArchEnabled: true`)**: con nueva arch, los paquetes deben usar TurboModules — `@react-native-async-storage/async-storage` v3.x y `react-native-get-random-values` v2.x. Las versiones anteriores (v2.x y v1.x respectivamente) usan el bridge viejo y `NativeModules` les llega `null`. No seguir ciegamente las recomendaciones de `expo-doctor` si el proyecto usa nueva arch.
- `expo-font` es peer dependency obligatoria de `@expo/vector-icons` en builds nativos (en Expo Go viene preinstalada). Sin ella, la app crashea al arrancar.

---

## Pending work

- **PayPal sandbox → live** — cambiar `PAYPAL_MODE=live` en el VPS y usar credenciales live cuando esté listo para producción real.
- **Migrar expo-av** — `expo-av` muestra warning de deprecación en SDK 54. Migrar a `expo-audio` y `expo-video` en algún momento (no urgente).
