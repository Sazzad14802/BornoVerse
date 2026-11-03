/**
 * PaymentHistoryScreen — completed payments only (no buying here). Tapping a
 * payment opens its details and invoice.
 */

import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { StateView } from '../../components/StateView';
import { paymentsApi } from '../../api/account';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { PaymentOrder } from '../../types/domain';
import { formatDate, formatMoney } from '../../utils/format';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

export function paymentTitle(p: Pick<PaymentOrder, 'kind' | 'months'>, tx: (bn: string, en: string) => string): string {
  return p.kind === 'subscription'
    ? tx(`প্রিমিয়াম · ${p.months} মাস`, `Premium · ${p.months} month${p.months > 1 ? 's' : ''}`)
    : tx('প্রকাশক নিবন্ধন ফি', 'Publisher registration fee');
}

export function PaymentHistoryScreen() {
  const { navigation } = useAppNavigation();
  const { tx, isEnglish } = useLanguage();
  const payments = useResource(() => paymentsApi.list());
  const items = payments.data ?? [];
  const total = items.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('পেমেন্ট ইতিহাস', 'Payment history')}
        subtitle={items.length ? tx(`${items.length}টি পেমেন্ট · মোট ${formatMoney(total)}`, `${items.length} payments · ${formatMoney(total)} total`) : undefined}
        onBack={() => navigation.goBack()}
      />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={payments.isRefreshing} onRefresh={payments.refresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          payments.isLoading ? (
            <StateView kind="loading" />
          ) : payments.error ? (
            <StateView kind="error" message={payments.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={payments.reload} />
          ) : (
            <StateView
              kind="empty"
              title={tx('কোনো পেমেন্ট নেই', 'No payments yet')}
              message={tx('সফল পেমেন্টগুলো এখানে দেখা যাবে।', 'Your completed payments will appear here.')}
            />
          )
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate('PaymentDetails', { orderId: item.id })}
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.first,
              index === items.length - 1 && styles.last,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${paymentTitle(item, tx)}, ${formatMoney(item.amount)}`}
          >
            <View style={styles.icon}>
              <Ionicons name={item.kind === 'subscription' ? 'diamond-outline' : 'mic-outline'} size={18} color={Colors.primary} />
            </View>
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {paymentTitle(item, tx)}
              </Text>
              <Text style={styles.meta}>
                {formatDate(item.updated_at, isEnglish)} · {tx('সফল', 'Paid')}
              </Text>
            </View>
            <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceBorder,
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  pressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySurface,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  meta: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  amount: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
