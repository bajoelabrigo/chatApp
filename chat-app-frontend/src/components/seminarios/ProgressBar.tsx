import { View } from 'react-native';

export function ProgressBar({ completed, total, colors, height = 8 }: {
  completed: number; total: number; colors: any; height?: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.bgTertiary, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, backgroundColor: colors.accent }} />
    </View>
  );
}
