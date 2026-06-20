import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

const BAR_HEIGHT = 64;
const SIDE_MARGIN = 16;
const INNER_PAD = 5;
const PILL_H = 50;

interface Props {
  state: any;
  descriptors: any;
  navigation: any;
}

export default function FloatingTabBar({ state, descriptors, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const numTabs = state.routes.length;
  const barWidth = screenWidth - SIDE_MARGIN * 2;
  const tabWidth = (barWidth - INNER_PAD * 2) / numTabs;

  const indicatorAnim = useRef(new Animated.Value(state.index * tabWidth)).current;
  const scaleAnims = useRef(state.routes.map(() => new Animated.Value(1))).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(indicatorAnim, {
      toValue: state.index * tabWidth,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.75,
    }).start();

    // Glow pulse when switching tabs
    glowAnim.setValue(0);
    Animated.timing(glowAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [state.index, tabWidth]);

  const handlePress = (route: any, index: number, isFocused: boolean) => {
    Animated.sequence([
      Animated.timing(scaleAnims[index], {
        toValue: 0.82,
        duration: 65,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnims[index], {
        toValue: 1,
        damping: 7,
        stiffness: 240,
        useNativeDriver: true,
      }),
    ]).start();

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const barBg = isDark ? '#161618' : '#FFFFFF';
  const barBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const pillBg = isDark ? 'rgba(255,255,255,0.10)' : `${colors.accent}15`;
  const pillBorder = isDark ? 'rgba(255,255,255,0.08)' : `${colors.accent}35`;

  return (
    // Outer View reserves layout space — must match bgPrimary so React Navigation's
    // default white container doesn't bleed through in dark mode
    <View style={{ height: BAR_HEIGHT + Math.max(insets.bottom, 8) + 14, backgroundColor: colors.bgPrimary }}>
      {/* The floating pill bar */}
      <View
        style={{
          position: 'absolute',
          bottom: Math.max(insets.bottom, 8) + 6,
          left: SIDE_MARGIN,
          right: SIDE_MARGIN,
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: barBg,
          flexDirection: 'row',
          paddingHorizontal: INNER_PAD,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: barBorder,
          shadowColor: isDark ? '#000000' : colors.accent,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.60 : 0.14,
          shadowRadius: 28,
          elevation: 24,
        }}
      >
        {/* Sliding active indicator pill */}
        <Animated.View
          style={{
            position: 'absolute',
            top: (BAR_HEIGHT - PILL_H) / 2,
            left: INNER_PAD,
            width: tabWidth,
            height: PILL_H,
            borderRadius: PILL_H / 2,
            backgroundColor: pillBg,
            borderWidth: 1,
            borderColor: pillBorder,
            transform: [{ translateX: indicatorAnim }],
          }}
        />

        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const iconColor = isFocused ? colors.accent : colors.textMuted;
          const label = String(options.title ?? route.name);

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => handlePress(route, index, isFocused)}
              style={{
                width: tabWidth,
                height: BAR_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              activeOpacity={1}
            >
              <Animated.View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: scaleAnims[index] }],
                }}
              >
                {options.tabBarIcon?.({ color: iconColor, size: 22, focused: isFocused })}
                <Text
                  style={{
                    color: iconColor,
                    fontSize: 10,
                    fontWeight: isFocused ? '700' : '400',
                    marginTop: 3,
                    letterSpacing: isFocused ? 0.3 : 0,
                  }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
