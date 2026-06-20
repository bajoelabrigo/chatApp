import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function Column({
  label,
  value,
  display,
  onUp,
  onDown,
  colors,
}: {
  label: string;
  value: number;
  display: string;
  onUp: () => void;
  onDown: () => void;
  colors: any;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, fontWeight: '500' }}>{label}</Text>
      <TouchableOpacity onPress={onUp} style={{ padding: 8 }} hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}>
        <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '700' }}>▲</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700', minWidth: 56, textAlign: 'center', marginVertical: 4 }}>
        {display}
      </Text>
      <TouchableOpacity onPress={onDown} style={{ padding: 8 }} hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}>
        <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '700' }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

interface Props {
  visible: boolean;
  title?: string;
  /** ISO date string or undefined */
  value?: string;
  onConfirm: (isoDate: string) => void;
  onClose: () => void;
  colors: any;
  /** Minimum selectable year (default: current year) */
  minYear?: number;
}

export function DatePickerModal({ visible, title = 'Seleccionar fecha', value, onConfirm, onClose, colors, minYear }: Props) {
  const now = new Date();
  const baseYear = minYear ?? now.getFullYear();

  const init = value ? new Date(value) : now;
  const [day, setDay]     = useState(init.getDate());
  const [month, setMonth] = useState(init.getMonth() + 1);
  const [year, setYear]   = useState(Math.max(init.getFullYear(), baseYear));

  function clampDay(d: number, m: number, y: number) {
    return Math.min(d, daysInMonth(m, y));
  }

  function stepDay(dir: 1 | -1) {
    const max = daysInMonth(month, year);
    setDay((d) => {
      const next = d + dir;
      return next < 1 ? max : next > max ? 1 : next;
    });
  }

  function stepMonth(dir: 1 | -1) {
    setMonth((m) => {
      const next = m + dir;
      const nm = next < 1 ? 12 : next > 12 ? 1 : next;
      setDay((d) => clampDay(d, nm, year));
      return nm;
    });
  }

  function stepYear(dir: 1 | -1) {
    setYear((y) => {
      const next = Math.max(baseYear, y + dir);
      setDay((d) => clampDay(d, month, next));
      return next;
    });
  }

  function handleConfirm() {
    const d = new Date(year, month - 1, day, 12, 0, 0);
    onConfirm(d.toISOString());
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.bgPrimary, borderRadius: 24, padding: 28, width: '100%' }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
            {title}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
            <Column
              label="Día"
              value={day}
              display={String(day).padStart(2, '0')}
              onUp={() => stepDay(1)}
              onDown={() => stepDay(-1)}
              colors={colors}
            />
            <Text style={{ color: colors.textMuted, fontSize: 24, fontWeight: '700', paddingTop: 20 }}>/</Text>
            <Column
              label="Mes"
              value={month}
              display={MONTHS[month - 1]}
              onUp={() => stepMonth(1)}
              onDown={() => stepMonth(-1)}
              colors={colors}
            />
            <Text style={{ color: colors.textMuted, fontSize: 24, fontWeight: '700', paddingTop: 20 }}>/</Text>
            <Column
              label="Año"
              value={year}
              display={String(year)}
              onUp={() => stepYear(1)}
              onDown={() => stepYear(-1)}
              colors={colors}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
