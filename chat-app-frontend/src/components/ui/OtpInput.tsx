import { useRef } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
}

export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const digits = value.padEnd(length, ' ').split('').slice(0, length);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
      {/* Hidden real input */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        autoFocus
      />
      {digits.map((d, i) => {
        const filled = i < value.length;
        const active = i === value.length;
        return (
          <View
            key={i}
            style={{
              width: 48,
              height: 58,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: active ? colors.accent : filled ? colors.accentDark : colors.border,
              backgroundColor: filled ? `${colors.accent}18` : colors.inputBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TextInput
              value={filled ? d : ''}
              editable={false}
              style={{ color: colors.inputText, fontSize: 24, fontWeight: '700', textAlign: 'center' }}
            />
          </View>
        );
      })}
    </Pressable>
  );
}
