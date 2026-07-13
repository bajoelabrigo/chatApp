import React, { useRef, useEffect } from 'react';
import { View, Text, Image, Animated, Easing, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Piezas visuales de la lista de mensajes: el separador de día, el indicador de
// "escribiendo…" y el gesto de deslizar para responder.
//
// Vivían dentro de `app/chat/[id].tsx` (2.200 líneas). No tocan la lógica del
// chat —no envían, no leen el store—: solo pintan y avisan. Sacarlas deja la
// pantalla dedicada a orquestar, que es lo suyo.

/** Separador "Hoy" / "Ayer" / "14 de julio" entre los mensajes de días distintos. */
export function DateSeparator({ label, colors }: { label: string; colors: any }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <View
        style={{
          backgroundColor: colors.bgTertiary,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 5,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      </View>
    </View>
  );
}

/** Los tres puntos saltando mientras el otro escribe. */
export function TypingIndicator({
  colors,
  avatar,
  name,
}: {
  colors: any;
  avatar?: string;
  name?: string;
}) {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    // Cada punto arranca con un retraso distinto: eso es lo que da la sensación de
    // "ola" en vez de tres puntos parpadeando a la vez.
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.delay((2 - i) * 160 + 100),
        ])
      )
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-end' }}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={{ width: 30, height: 30, borderRadius: 8, marginRight: 6 }} />
      ) : (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: colors.avatarBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 6,
          }}
        >
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>
            {name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}

      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 18,
          borderTopLeftRadius: 4,
          backgroundColor: colors.bubbleTheirs,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
          elevation: 1,
          borderWidth: 1,
          borderColor: colors.borderLight,
        }}
      >
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.bubbleTheirsText,
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
              transform: [
                { translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
              ],
            }}
          />
        ))}
      </View>
    </View>
  );
}

// Cuánto hay que arrastrar para que se active la respuesta.
const REPLY_THRESHOLD = 64;

/**
 * Deslizar una burbuja hacia la derecha para responderla.
 *
 * `PanResponder` + `Animated`, sin react-native-gesture-handler (el proyecto no
 * lo usa). Solo se apropia del gesto si el movimiento es claramente HORIZONTAL
 * (`dx > dy`): si no, robaría el scroll vertical de la lista de mensajes.
 */
export function SwipeableMessage({
  children,
  onSwipeRight,
}: {
  children: React.ReactNode;
  onSwipeRight: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  // `useRef` y no state: los callbacks del PanResponder se crean una sola vez y
  // con state leerían siempre el valor del primer render (stale closure).
  const triggered = useRef(false);

  const snapBack = () => {
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      Animated.timing(iconOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => dx > 5 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        if (dx > 0) {
          const clamped = Math.min(dx, REPLY_THRESHOLD + 16);
          translateX.setValue(clamped);
          iconOpacity.setValue(Math.min(clamped / REPLY_THRESHOLD, 1));
          if (clamped >= REPLY_THRESHOLD && !triggered.current) {
            triggered.current = true;
          }
        }
      },
      onPanResponderRelease: (_, { dx }) => {
        const shouldReply = triggered.current;
        triggered.current = false;
        snapBack();
        if (shouldReply || dx >= REPLY_THRESHOLD) onSwipeRight();
      },
      onPanResponderTerminate: () => {
        triggered.current = false;
        snapBack();
      },
    })
  ).current;

  return (
    <View>
      {/* La flecha de responder, que se va opacando conforme se arrastra. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 16,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: iconOpacity,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(120,120,120,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="return-up-back" size={17} color="#fff" />
        </View>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}
