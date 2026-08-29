@AGENTS.md

# chat-app-frontend — CLAUDE.md

App móvil HolyChat (React Native + Expo 54 + Expo Router + NativeWind v4).
Se despliega con `eas update` (OTA); solo un módulo nativo nuevo obliga a `eas build`.

**Lo transversal está en el `CLAUDE.md` de la raíz** (despliegue, variables de entorno
y `eas.json`, `cld()`/`videoPlayUrl`, orden de despliegue frente al backend, índice de
reglas espejadas con la web). Aquí solo va lo propio de la app.

---

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

## Creador de imágenes de versículos (móvil) — 2026-08-29

`components/bible/VerseImageSheet.tsx`. Rediseñado a la vez que el de la web
(**el detalle completo está en `holy_app/CLAUDE.md`**, sección "El creador de
imágenes: seis paneles"). Lo propio de la app:

- **Dos pasos** (elegir fondo → editor) y **barra inferior de seis paneles**
  (Estilo, Fuente, Texto, Palabras, Formato, Fondo). Antes todo iba en un scroll
  único bajo la previa.
- **"Guardar" abre una hoja** con *Publicar en la comunidad* (nuevo: era la única
  salida que el móvil no tenía) y *Compartir o guardar*. **No hay guardado
  directo al carrete**: necesitaría `expo-media-library`, que es nativo; la hoja
  del sistema ya ofrece "Guardar imagen" junto al resto de apps.
- **El difuminado usa `blurRadius`, que es del CORE de React Native.** No hace
  falta `expo-blur` (nativo) y por eso esto llega por `eas update`. El valor va
  en píxeles del lienzo de 1080 → se escala con `s()`, o se notaría el triple en
  la previa que en la imagen capturada.
- **El brillo es una capa translúcida** (`brightnessOverlay`), no un filtro: en
  RN no hay `filter: brightness()` sin otra dependencia nativa.
- **Los sliders son propios**: `components/bible/PosterSlider.tsx` con
  `PanResponder` (mismo patrón que los gestos de la lista de chats).
  `@react-native-community/slider` es nativo y habría obligado a un `eas build`.
  Dentro del PanResponder el ancho y el `onChange` se leen por `ref`: con las
  variables de estado se quedaría con las del primer render y el slider movería
  siempre al mismo sitio.
- **Los rangos de los seis ajustes están ESPEJADOS** en `src/lib/versePosterLayout.ts`
  y `holy_app/frontend/src/lib/posterLayout.js`. Hay un test en la web
  (`scripts/versePoster.test.mjs`) que **lee este .ts como texto** y falla si un
  rango se desalinea: son dos motores dibujando el mismo diseño.

## Notas de voz — UN reproductor global, fuera de React (2026-08-13)

Cada burbuja tenía su `useAudioPlayer`, atado al ciclo de vida del componente: salir del chat —o que la FlashList reciclara la fila al desplazarse— liberaba el reproductor y **el audio se cortaba a media frase**. WhatsApp lo sigue reproduciendo hasta el final aunque te muevas por la app.

- El reproductor vive en **`chat-app-frontend/src/store/useVoiceStore.ts`**, creado con `createAudioPlayer` (no el hook) y guardado en una variable de módulo, **no dentro del estado de zustand**: es un objeto nativo (`SharedObject`), no un valor serializable. El store solo guarda `{uri, messageId, conversationId, title, playing, position, duration}`.
- `VoicePlayer` solo pinta. Sus selectores comparan `s.messageId === messageId` y devuelven primitivas, así que **las demás burbujas no se repintan** mientras una suena. Su `useAudioPlayer` local recibe `null` cuando esa nota es la activa (si no, el mismo audio se cargaría dos veces) y solo sirve para saber la duración antes de tocarla; las duraciones ya vistas se cachean por URL en el store.
- **`VoiceMiniPlayer`** (montado en `app/_layout.tsx`) es la barra flotante al salir del chat: sin ella el audio seguiría sonando sin forma de pararlo. Se esconde dentro de su propia conversación comparando `usePathname()` con `/chat/<conversationId>`.
- Se pausa sola al **empezar a grabar** (`useVoiceRecorder.start`) y al **sonar un tono de llamada** (`ringtoneService.playLoop`): en Android se pelearían por la sesión de audio.
- **No hay reproducción en segundo plano** (app minimizada) a propósito: `shouldPlayInBackground` necesita configuración nativa (`eas build`), y esto tenía que llegar por `eas update`.

## Lectura en voz alta de la Biblia (móvil) — ya activa

`expo-speech` es un **módulo nativo**: no se activa con `eas update`. Estuvo escrito y sin funcionar desde el 2026-07-11 hasta el APK del **2026-07-13** (build `e8353a0e`, perfil `preview`, runtime 1.0.3, versionCode 4), que lo incluyó. Desde ahí el botón de escuchar sale solo (`src/hooks/useSpeech.ts` + barra de reproducción en `app/(tabs)/bible.tsx`).

**No quitar el `require('expo-speech')` dentro de `try/catch` ni la bandera `available`**: quien siga con un APK anterior a ese build no tiene el módulo, y sin la guarda la pantalla de la Biblia crashearía en vez de esconder el botón. Misma regla para cualquier módulo nativo nuevo que llegue por OTA.

La versión web usa la Web Speech API del navegador, sin dependencias.

---

## Screenshot-to-Code Protocol (UI/UX Cloning)
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

---

## Gotchas de React Native / Expo

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
