# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**HolyChat** — a WhatsApp-like mobile chat app (React Native/Expo) with a Christian/religious community layer: group activities (fasting, vigils, prayer), activity commitments with timezone-aware push reminders, prayer requests, in-app Bible reader, and PayPal offerings/subscriptions.

This is a monorepo with two parts:
- `chat-app-backend/` — Node.js + Express + Socket.io + MongoDB API (TypeScript)
- `chat-app-frontend/` — React Native Expo app (TypeScript, git submodule)

## Commands

### Backend (`chat-app-backend/`)
```bash
npm run dev      # ts-node-dev with hot reload
npm run build    # tsc → dist/
npm start        # node dist/app.js (production)
```

### Frontend (`chat-app-frontend/`)
```bash
npx expo start           # Metro bundler (scan QR with Expo Go)
npx expo start --android # Open in Android emulator
npx expo start --ios     # Open in iOS simulator
```

There are no test suites in this project.

## Backend architecture

**Entry point**: `src/app.ts` — creates the Express app, HTTP server, and Socket.io server; registers all routes; calls `connectDB()`, then `startCronJobs()`, then `server.listen()`.

**Route → Controller pattern** (standard MVC):
- All routes live in `src/routes/*.routes.ts`
- All business logic in `src/controllers/*.ts`
- `authMiddleware` (`src/middleware/authMiddleware.ts`) verifies the `Authorization: Bearer <token>` header and attaches `req.userId` / `req.userEmail`

**Key route prefixes** (see `src/app.ts`):
- `/auth` — register, login, Google sign-in, email verify, refresh token
- `/conversations` — 1:1 and group conversations, messages, pins, archives
- `/users` — profile, contacts, block/unblock, settings
- `/groups/:groupId/activities` — group activity CRUD
- `/groups/:groupId/prayer-requests` — prayer request CRUD
- `/calls` — LiveKit token generation for group calls
- `/bible` — static bible data (KJV, RVA, RVR1960, WEB)
- `/offerings` — PayPal one-time orders and subscriptions, webhook endpoint
- `/upload` — Cloudinary media upload

**Real-time (Socket.io)** (`src/socket/socketHandler.ts`):
- Auth middleware reads `socket.handshake.auth.token` (same JWT as REST)
- On connect, socket joins rooms: `user:<userId>` (personal) + one room per conversation
- In-memory `onlineUsers: Map<userId, Set<socketId>>` and `activeCalls: Map<callId, ActiveCall>`
- Events handled: `message:send`, `message:read`, `message:edit`, `message:delete`, `message:react`, `typing:start/stop`, WebRTC signaling (`call:initiate/answer/ice-candidate/end/reject`), LiveKit group call signaling (`call:group:start`)
- To reach a specific user from a REST controller, use `io.to(`user:${userId}`)` via the `ioSingleton` (`src/socket/ioSingleton.ts`)

**Authentication** (`src/services/jwtService.ts`):
- Access token: 24h, signed with `JWT_SECRET`, payload `{ userId, email }`
- Refresh token: 7d, signed with `JWT_REFRESH_SECRET`
- Socket auth: uses the same `JWT_SECRET` via `verifyToken()`

**Cron jobs** (`src/services/cronService.ts`):
- Every minute: checks `ActivityCommitment` docs with `isActive + notificationsEnabled`, sends Expo push at exact schedule time and 15 min in advance (timezone-aware via `date-fns-tz`)
- Every hour: on Sunday 8am local time, emails weekly activity summary to each user

**MongoDB models** (Mongoose, TypeScript interfaces in each file):
- `User` — auth fields, blocked users, Expo push token, notification/privacy settings, offering status
- `Conversation` — participants, `isGroup`, admin/permissions, mute/pin/archive/favorite per-user arrays
- `Message` — `type: text|image|audio|document|call`, `status: sent|delivered|read`, `readBy[]`, per-user `deletedFor[]`, `isDeletedForEveryone`, `replyTo` (embedded snapshot), `reactions[]`
- `GroupActivity` — tied to a group (Conversation), typed as `ayuno|vigilia|cilicio|escala_oracion|bible_reading|evangelism`
- `ActivityCommitment` — user commits to a GroupActivity with a weekly schedule + timezone
- `PersonalCommitment` — same schedule structure but independent of a group
- `PrayerRequest` — tied to a group
- `Offering` — PayPal order/subscription lifecycle (`pending→paid/failed/cancelled`)

**PayPal flow** (`src/services/paypalService.ts`, `src/controllers/offeringController.ts`):
- Sandbox vs live controlled by `PAYPAL_MODE` env var
- One-time: `POST /offerings/order` → creates order + pending `Offering` doc → returns `approvalUrl` → user pays → PayPal redirects to `GET /offerings/capture` → captures order
- Subscriptions: `POST /offerings/subscribe` with `tier` (sub_5/sub_10/sub_20) → creates PayPal subscription → `GET /offerings/sub-return` on approval
- Webhooks at `POST /offerings/webhook` verify signature and handle `PAYMENT.CAPTURE.COMPLETED`, `BILLING.SUBSCRIPTION.ACTIVATED/CANCELLED`

## Frontend architecture

Built with **Expo 54 + Expo Router** (file-based routing). Always check [Expo v54 docs](https://docs.expo.dev/versions/v54.0.0/) before writing any Expo-specific code.

**Route layout** (`app/`):
- `(auth)/` — unauthenticated screens: login, register, email verify, forgot/reset password
- `(tabs)/` — bottom tab navigator: chats, actividades, bible, ofrendas, settings
- `chat/[id].tsx` — conversation screen
- `group-activities/[id].tsx`, `group-activities/commit/[activityId].tsx` — group activities
- `call.tsx`, `group-call.tsx` — WebRTC 1:1 and LiveKit group calls

**State management**: Zustand stores (in `store/` or similar). API calls use `axios` pointed at `EXPO_PUBLIC_API_URL`.

**Styling**: NativeWind v4 (Tailwind for React Native). The `global.css` file is the Tailwind entry; `tailwind.config.js` configures content paths.

**Calls**:
- 1:1: pure WebRTC signaling via Socket.io, no external service
- Group: LiveKit (`@livekit/react-native`) — backend generates a LiveKit token at `/calls/token`

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
PAYPAL_MODE=sandbox          # or live
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_PLAN_SUB_5_ID=
PAYPAL_PLAN_SUB_10_ID=
PAYPAL_PLAN_SUB_20_ID=
BACKEND_URL=                 # public URL for PayPal redirect callbacks
```

### Frontend (`chat-app-frontend/.env`)
```
EXPO_PUBLIC_API_URL=http://<your-ip>:3000
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

## Important conventions

- `ActivityCommitment.startMinute` and `endMinute` are constrained to `[0, 30]` — schedules are in 30-minute slots only.
- `ActivityType` values `prayer` and `fasting` are **deprecated** aliases kept for backward compatibility with existing DB data; use `escala_oracion` / `ayuno` instead.
- Message amounts in `Offering` are stored in **cents** (integer), not dollars.
- The `ioSingleton` pattern (`setIO` / `getIO`) lets REST controllers push Socket.io events without importing `io` directly from `app.ts`.
- When `privacySettings.showOnlineStatus` is false, the server still tracks the user as online internally but does not broadcast `user:online` / `user:offline` events to other clients.
