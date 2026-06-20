import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../../src/context/ThemeContext';
import { useOfferingStore } from '../../src/store/useOfferingStore';
import { createOrderApi, createSubscriptionApi, type SubscriptionTier } from '../../src/services/offeringService';

const PRESET_AMOUNTS = [5, 10, 25, 50];

const SUBSCRIPTION_TIERS: { tier: SubscriptionTier; label: string; price: string; desc: string }[] = [
  { tier: 'sub_5',  label: 'Semilla',    price: '$5/mes',  desc: 'Ofrenda mensual básica' },
  { tier: 'sub_10', label: 'Cosecha',    price: '$10/mes', desc: 'Ofrenda mensual regular' },
  { tier: 'sub_20', label: 'Abundancia', price: '$20/mes', desc: 'Ofrenda mensual especial' },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function OfrendasScreen() {
  const { colors } = useTheme();
  const { status, history, loading, fetchStatus, fetchHistory } = useOfferingStore();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [loadingSub, setLoadingSub] = useState<SubscriptionTier | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
      fetchHistory();
    }, [])
  );

  function getEffectiveAmount(): number | null {
    if (customAmount.trim()) {
      const n = parseFloat(customAmount.replace(',', '.'));
      return isNaN(n) || n < 1 ? null : n;
    }
    return selectedAmount;
  }

  async function handleOneTimeOfrenda() {
    const amount = getEffectiveAmount();
    if (!amount) {
      Alert.alert('Monto inválido', 'Por favor ingresa un monto de al menos $1.');
      return;
    }
    setLoadingOrder(true);
    try {
      const { approvalUrl } = await createOrderApi(amount);
      await WebBrowser.openAuthSessionAsync(approvalUrl, 'chatapp://');
      fetchStatus();
      fetchHistory();
    } catch {
      Alert.alert('Error', 'No se pudo iniciar el pago. Intenta de nuevo.');
    } finally {
      setLoadingOrder(false);
    }
  }

  async function handleSubscription(tier: SubscriptionTier) {
    setLoadingSub(tier);
    try {
      const { approvalUrl } = await createSubscriptionApi(tier);
      await WebBrowser.openAuthSessionAsync(approvalUrl, 'chatapp://');
      fetchStatus();
      fetchHistory();
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la suscripción. Intenta de nuevo.');
    } finally {
      setLoadingSub(null);
    }
  }

  const anyLoading = loadingOrder || loadingSub !== null;
  const effectiveAmount = getEffectiveAmount();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.accent + '20',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <FontAwesome5 name="hand-holding-heart" size={28} color={colors.accent} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary }}>
              Ofrendas
            </Text>
            <Text style={{
              fontSize: 13, color: colors.textMuted, textAlign: 'center',
              marginTop: 6, lineHeight: 19,
            }}>
              Tu ofrenda es completamente voluntaria.{'\n'}Dios ama al dador alegre. — 2 Cor 9:7
            </Text>
          </View>

          {/* Stats */}
          {loading && !status && (
            <ActivityIndicator color={colors.accent} style={{ marginBottom: 24 }} />
          )}
          {status && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
              <StatCard label="Dadas" value={String(status.totalOfferings)} colors={colors} />
              <StatCard label="Total" value={formatCents(status.totalAmountCents)} colors={colors} />
              {status.isActiveSubscriber && (
                <StatCard label="Suscripción" value="Activa ✓" highlight colors={colors} />
              )}
            </View>
          )}

          {/* One-time */}
          <SectionTitle title="Ofrenda única" colors={colors} />
          <View style={{
            backgroundColor: colors.bgSecondary, borderRadius: 16,
            padding: 18, marginBottom: 24, borderWidth: 1, borderColor: colors.border,
          }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 14 }}>
              Elige un monto o escribe el tuyo. El pago se procesa de forma segura con PayPal.
            </Text>

            {/* Preset amounts */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {PRESET_AMOUNTS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  onPress={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: selectedAmount === amt && !customAmount
                      ? colors.accent
                      : colors.bgTertiary,
                    borderWidth: 1,
                    borderColor: selectedAmount === amt && !customAmount
                      ? colors.accent
                      : colors.border,
                  }}
                >
                  <Text style={{
                    fontWeight: '700', fontSize: 13,
                    color: selectedAmount === amt && !customAmount
                      ? '#fff'
                      : colors.textPrimary,
                  }}>
                    ${amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom amount */}
            <TextInput
              placeholder="Otro monto (ej: 15)"
              placeholderTextColor={colors.inputPlaceholder}
              keyboardType="decimal-pad"
              value={customAmount}
              onChangeText={(t) => { setCustomAmount(t); setSelectedAmount(null); }}
              style={{
                backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 14,
                paddingVertical: 11, color: colors.inputText, fontSize: 15,
                borderWidth: 1, borderColor: customAmount ? colors.accent : colors.border,
                marginBottom: 14,
              }}
            />

            <TouchableOpacity
              onPress={handleOneTimeOfrenda}
              disabled={anyLoading || !effectiveAmount}
              style={{
                backgroundColor: colors.accent, borderRadius: 12,
                paddingVertical: 14, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 8,
                opacity: anyLoading || !effectiveAmount ? 0.5 : 1,
              }}
            >
              {loadingOrder
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="heart" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {effectiveAmount ? `Dar $${effectiveAmount.toFixed(2)} con PayPal` : 'Selecciona un monto'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Subscriptions */}
          <SectionTitle title="Ofrenda mensual" colors={colors} />
          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
            Comprométete a dar cada mes. Puedes cancelar en cualquier momento desde tu cuenta PayPal.
          </Text>
          <View style={{ gap: 10, marginBottom: 28 }}>
            {SUBSCRIPTION_TIERS.map((t) => (
              <SubscriptionCard
                key={t.tier}
                tier={t}
                loading={loadingSub === t.tier}
                disabled={anyLoading}
                onPress={() => handleSubscription(t.tier)}
                colors={colors}
              />
            ))}
          </View>

          {/* History */}
          {history.length > 0 && (
            <>
              <SectionTitle title="Mis ofrendas" colors={colors} />
              <View style={{ gap: 10 }}>
                {history.map((item) => (
                  <View key={item._id} style={{
                    backgroundColor: colors.bgSecondary, borderRadius: 12,
                    padding: 14, flexDirection: 'row', alignItems: 'center',
                    borderWidth: 1, borderColor: colors.border,
                  }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: item.status === 'paid' ? colors.accent + '20' : colors.textMuted + '20',
                      alignItems: 'center', justifyContent: 'center', marginRight: 12,
                    }}>
                      <Ionicons
                        name={item.type === 'subscription' ? 'repeat' : 'heart'}
                        size={16}
                        color={item.status === 'paid' ? colors.accent : colors.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14 }}>
                        {item.type === 'subscription' ? 'Mensual' : 'Única'} — {formatCents(item.amount)}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {formatDate(item.createdAt)}
                      </Text>
                    </View>
                    <StatusBadge status={item.status} />
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 }}>
      {title}
    </Text>
  );
}

function StatCard({ label, value, highlight, colors }: {
  label: string; value: string; highlight?: boolean; colors: any;
}) {
  return (
    <View style={{
      flex: 1, backgroundColor: highlight ? colors.accent + '15' : colors.bgSecondary,
      borderRadius: 12, padding: 14, alignItems: 'center',
      borderWidth: 1, borderColor: highlight ? colors.accent + '40' : colors.border,
    }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: highlight ? colors.accent : colors.textPrimary }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

function SubscriptionCard({ tier, loading, disabled, onPress, colors }: {
  tier: typeof SUBSCRIPTION_TIERS[0];
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={{
        backgroundColor: colors.bgSecondary, borderRadius: 14,
        padding: 16, flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: colors.border,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
          {tier.label}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
          {tier.desc}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.accent }}>
          {tier.price}
        </Text>
        {loading
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Ionicons name="arrow-forward-circle" size={22} color={colors.accent} />}
      </View>
    </TouchableOpacity>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    paid:      { bg: '#22c55e20', text: '#22c55e', label: 'Confirmada' },
    cancelled: { bg: '#94a3b820', text: '#94a3b8', label: 'Cancelada' },
    pending:   { bg: '#f59e0b20', text: '#f59e0b', label: 'Pendiente' },
    failed:    { bg: '#ef444420', text: '#ef4444', label: 'Fallida' },
  };
  const cfg = configs[status] ?? configs.pending;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: cfg.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: cfg.text }}>{cfg.label}</Text>
    </View>
  );
}
