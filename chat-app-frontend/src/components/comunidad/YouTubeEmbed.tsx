import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

// Reproductor de YouTube dentro de la app.
//
// ⚠️ NO cargar `https://www.youtube.com/embed/<id>` con `source={{ uri }}`: el
// WebView es entonces el marco superior y el embed llega SIN referer, así que
// YouTube lo rechaza con «Error 153» (el mismo que da un embed en un sitio no
// autorizado). Hay que servir un HTML propio con el iframe dentro y declarar
// `baseUrl: 'https://www.youtube.com'` — así el documento tiene ese origen y el
// embed se considera legítimo. Es lo que hace `react-native-youtube-iframe`.
//
// Los errores 150/152/153 son todos «este embed no está autorizado en este
// contexto» y dependen del par (origen del documento, host del reproductor),
// así que se prueban VARIOS contextos en cascada antes de rendirse: primero el
// dominio propio —donde el embed ya funciona en la web—, luego el host sin
// cookies, y por último youtube.com. Si ninguno vale (el dueño del video
// prohibió incrustarlo de verdad) se propaga `onError` y los llamadores caen a
// la miniatura + abrir en la app de YouTube.
//
// El `userAgent` se fija a Chrome de Android: el del WebView lleva «; wv» y
// YouTube trata esos embeds de forma distinta.

// Contextos a probar, en orden.
const CONTEXTS = [
  { baseUrl: 'https://holyholyholy.es', host: 'https://www.youtube.com' },
  { baseUrl: 'https://holyholyholy.es', host: 'https://www.youtube-nocookie.com' },
  { baseUrl: 'https://www.youtube.com', host: 'https://www.youtube.com' },
];

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

type Props = {
  videoId: string;
  playing: boolean;
  muted?: boolean;
  onEnd?: () => void;
  onError?: (code: number) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  style?: StyleProp<ViewStyle>;
};

const buildHtml = (videoId: string, muted: boolean, host: string, origin: string) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin:0; padding:0; height:100%; background:#000; overflow:hidden; }
  #player, iframe { width:100%; height:100%; border:0; display:block; }
</style>
</head>
<body>
<div id="player"></div>
<script>
  var send = function (o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };
  var player = null, timer = null;

  function tick() {
    if (!player || !player.getCurrentTime) return;
    send({ type: 'time', t: player.getCurrentTime() || 0, d: player.getDuration() || 0 });
  }

  function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
      videoId: ${JSON.stringify(videoId)},
      host: ${JSON.stringify(host)},
      playerVars: {
        autoplay: 1, controls: 0, playsinline: 1, rel: 0,
        modestbranding: 1, fs: 0, iv_load_policy: 3, disablekb: 1,
        // Estos videos traen el texto YA QUEMADO en la imagen, asi que los
        // subtitulos encima duplican lo mismo y tapan medio video vertical.
        cc_load_policy: 0,
        origin: ${JSON.stringify(origin)}
      },
      events: {
        onReady: function (e) {
          // Fuera los subtitulos. OJO: cc_load_policy 0 NO los apaga (solo el
          // 1 los FUERZA; sin el manda la preferencia de quien mira). Los dos
          // nombres de modulo porque YouTube usa uno u otro segun el video.
          try { e.target.unloadModule('captions'); e.target.unloadModule('cc'); } catch (err) {}
          ${muted ? 'e.target.mute();' : ''}
          e.target.playVideo();
          send({ type: 'ready' });
          clearInterval(timer);
          timer = setInterval(tick, 250);
        },
        onStateChange: function (e) { if (e.data === 0) send({ type: 'end' }); },
        onError: function (e) { send({ type: 'error', code: e.data }); }
      }
    });
  }

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.body.appendChild(tag);
</script>
</body>
</html>`;

export function YouTubeEmbed({ videoId, playing, muted = true, onEnd, onError, onProgress, style }: Props) {
  const ref = useRef<WebView>(null);
  const [attempt, setAttempt] = useState(0);
  const ctx = CONTEXTS[Math.min(attempt, CONTEXTS.length - 1)];
  // El HTML solo depende del video y del contexto: recrearlo recargaría el
  // WebView. Play/pausa y sonido se mandan después con `injectJavaScript`.
  const html = useMemo(
    () => buildHtml(videoId, muted, ctx.host, ctx.baseUrl),
    [videoId, ctx.host, ctx.baseUrl] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Un embed rechazado por contexto (150/152/153) se reintenta con el siguiente
  // de la lista; lo demás se propaga tal cual.
  const handleError = (code: number) => {
    if ([150, 152, 153, 101].includes(code) && attempt < CONTEXTS.length - 1) setAttempt((a) => a + 1);
    else onError?.(code);
  };

  useEffect(() => {
    ref.current?.injectJavaScript(
      `if (player && player.${playing ? 'playVideo' : 'pauseVideo'}) player.${playing ? 'playVideo' : 'pauseVideo'}(); true;`
    );
  }, [playing]);

  useEffect(() => {
    ref.current?.injectJavaScript(
      `if (player && player.${muted ? 'mute' : 'unMute'}) player.${muted ? 'mute' : 'unMute'}(); true;`
    );
  }, [muted]);

  return (
    // `pointerEvents="none"`: los toques son de la capa de acciones que va
    // encima (me gusta, avanzar historia…). Sin esto el WebView se los queda y
    // un toque abriría la app de YouTube.
    <View style={[{ flex: 1, backgroundColor: '#000' }, style]} pointerEvents="none">
      <WebView
        ref={ref}
        key={attempt}
        userAgent={CHROME_UA}
        source={{ html, baseUrl: ctx.baseUrl }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        scrollEnabled={false}
        bounces={false}
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: '#000' }}
        onMessage={(e) => {
          let msg: any;
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'end') onEnd?.();
          else if (msg.type === 'error') handleError(Number(msg.code));
          else if (msg.type === 'time') onProgress?.(msg.t, msg.d);
        }}
        onError={() => onError?.(-1)}
        onHttpError={() => onError?.(-2)}
        onRenderProcessGone={() => onError?.(-3)}
      />
    </View>
  );
}
