import { useMemo, useRef, useState } from 'react';
import { View, Text, PanResponder, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { AdjustRange } from '../../lib/versePosterLayout';

// Un ajuste fino del póster (tamaño, altura de línea, difuminado…).
//
// POR QUÉ NO `@react-native-community/slider`: es un módulo NATIVO, y añadirlo
// obligaría a un `eas build` y a que todo el mundo reinstalara el APK para ver
// esta pantalla. Con `PanResponder` —el mismo patrón que ya usan los gestos de
// la lista de chats y de las actividades— esto llega por `eas update`.
//
// El valor SE ENSEÑA además de la posición del pulgar: estos mandos son
// multiplicadores, y sin el número no hay forma de saber si se está en el punto
// neutro. Espejo de `Ajuste` en `VerseImageModal.jsx` de la web.

interface Props {
  label: string;
  range: AdjustRange;
  value: number;
  onChange: (v: number) => void;
  /** Cómo se lee el valor. Por defecto, porcentaje. */
  fmt?: (v: number) => string;
  disabled?: boolean;
}

const THUMB = 20;

export default function PosterSlider({
  label,
  range,
  value,
  onChange,
  fmt = (v) => `${Math.round(v * 100)}%`,
  disabled,
}: Props) {
  const { colors } = useTheme();
  const [ancho, setAncho] = useState(0);
  // El ancho y el `onChange` se leen desde dentro del PanResponder, que se crea
  // UNA vez: con las variables de estado directamente se quedaría con las del
  // primer render (stale closure) y el slider movería siempre al mismo sitio.
  const anchoRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  const pct = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));

  const aplicar = (x: number) => {
    const w = anchoRef.current - THUMB;
    if (w <= 0 || disabledRef.current) return;
    const p = Math.max(0, Math.min(1, (x - THUMB / 2) / w));
    const bruto = range.min + p * (range.max - range.min);
    // Se cuadra al paso declarado y se redondea a 4 decimales: sin esto salen
    // valores como 1.0500000000000003 y el número de al lado parpadea.
    const pasos = Math.round(bruto / range.step) * range.step;
    onChangeRef.current(Number(Math.min(range.max, Math.max(range.min, pasos)).toFixed(4)));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Se responde ya al TOCAR (no solo al arrastrar) para poder saltar a un
        // punto de la barra de un toque, como cualquier slider.
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        // Impide que el ScrollView del panel se lleve el gesto a media barra.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => aplicar(e.nativeEvent.locationX),
        onPanResponderMove: (e, g) => {
          // `locationX` durante el arrastre es relativo al elemento tocado, que
          // puede ser el pulgar; `moveX` es de la pantalla, así que se resta la
          // posición de la barra medida en el layout.
          aplicar(g.moveX - xRef.current);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const xRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho(w);
    anchoRef.current = w;
  };

  return (
    <View style={{ opacity: disabled ? 0.4 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{fmt(value)}</Text>
      </View>
      <View
        onLayout={onLayout}
        // La posición en pantalla se mide aparte del ancho: `onLayout` da el
        // tamaño, no la X absoluta, y el arrastre la necesita.
        ref={(node) => {
          if (node && 'measureInWindow' in node) {
            (node as any).measureInWindow((x: number) => {
              xRef.current = x;
            });
          }
        }}
        {...pan.panHandlers}
        // Alto generoso: la barra son 4 px pero el área que responde al dedo
        // tiene que ser cómoda (44 es el mínimo táctil recomendado).
        style={{ height: 34, justifyContent: 'center' }}
      >
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.bgTertiary }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              width: `${pct * 100}%`,
              backgroundColor: colors.accent,
            }}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: Math.max(0, pct * Math.max(0, ancho - THUMB)),
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.bgPrimary,
          }}
        />
      </View>
    </View>
  );
}
