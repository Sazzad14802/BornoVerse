/**
 * SubscriptionScreen — Premium plans, purchase, auto-renew status and payment history.
 * Prices come from the server; the client only chooses a plan.
 */

import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { StateView } from '../../components/StateView';
import { TagBadge } from '../../components/TagBadge';
import { paymentsApi, subscriptionApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { isPremium } from '../../types/auth';
import { Plan } from '../../types/domain';
import { formatDate, formatMoney, newIdempotencyKey } from '../../utils/format';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const BENEFITS = [
  { bn: 'সব প্রিমিয়াম অডিওবুক শুনুন', en: 'Listen to every premium audiobook' },
  { bn: 'অফলাইনে শোনার জন্য ডাউনলোড', en: 'Download to listen offline' },
  { bn: 'প্রতি মাসে বেশি অডিওবুক তৈরি', en: 'Generate more audiobooks every month' },
  { bn: 'স্বয়ংক্রিয় নবায়ন নেই — যখন খুশি', en: 'No auto-renewal — pay when you want' },
];

export function SubscriptionScreen() {
  const { navigation } = useAppNavigation();
  const { user, refreshUser } = useAuth();
  const { tx, isEnglish } = useLanguage();
  const premium = isPremium(user);

  const data = useResource(async () => {
    const [plans, payments] = await Promise.all([subscriptionApi.plans(), paymentsApi.list()]);
    return { plans, payments };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  const plans = data.data?.plans ?? [];
  const chosen = plans.find((p) => p.id === selected) ?? plans[0];

  const monthly = (plan: Plan) => Number(plan.price) / plan.months;
  const base = plans.length ? Math.max(...plans.map(monthly)) : 0;

  const buy = async () => {
    if (!chosen) return;
    setBuying(true);
    try {
      const order = await paymentsApi.initiate('subscription', newIdempotencyKey(), chosen.id);
      navigation.navigate('PaymentCheckout', { orderId: order.id });
    } catch (error) {
      Alert.alert(tx('পেমেন্ট শুরু করা যায়নি', 'Could not start payment'), errorMessage(error));
    } finally {
      setBuying(false);
    }
  };

  const cancel = () =>
    Alert.alert(
      tx('নবায়ন বন্ধ করবেন?', 'Turn off renewal?'),
      tx('মেয়াদ শেষ হওয়া পর্যন্ত প্রিমিয়াম থাকবে।', 'Premium stays active until it expires.'),
      [
        { text: tx('না', 'No'), style: 'cancel' },
        {
          text: tx('হ্যাঁ', 'Yes'),
          onPress: async () => {
            try {
              await subscriptionApi.cancel();
              await refreshUser();
            } catch (error) {
              Alert.alert(tx('ত্রুটি', 'Error'), errorMessage(error));
            }
          },
        },
      ],
    );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('প্রিমিয়াম', 'Premium')} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={data.refresh} tintColor={Colors.primary} />}
      >
        {premium ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>{tx('প্রিমিয়াম সক্রিয়', 'Premium is active')}</Text>
            <Text style={styles.activeText}>
              {tx(`মেয়াদ: ${formatDate(user?.premium_until, false)}`, `Valid until ${formatDate(user?.premium_until, true)}`)}
            </Text>
            <Text style={styles.activeText}>
              {tx('আরেকটি প্ল্যান কিনলে মেয়াদ বাড়বে।', 'Buying another plan extends your expiry date.')}
            </Text>
          </View>
        ) : (
          <View style={styles.benefits}>
            {BENEFITS.map((b) => (
              <View key={b.en} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                <Text style={styles.benefit}>{isEnglish ? b.en : b.bn}</Text>
              </View>
            ))}
          </View>
        )}

        {data.isLoading ? (
          <StateView kind="loading" />
        ) : data.error && !data.data ? (
          <StateView kind="error" message={data.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={data.reload} />
        ) : (
          <>
            {plans.map((plan) => {
              const active = chosen?.id === plan.id;
              const saving = base ? Math.round((1 - monthly(plan) / base) * 100) : 0;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelected(plan.id)}
                  style={[styles.plan, active && styles.planActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.radio}>{active ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.planText}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planMeta}>
                      {tx(`${plan.months} মাস · মাসে ${formatMoney(monthly(plan).toFixed(0))}`, `${plan.months} month${plan.months > 1 ? 's' : ''} · ${formatMoney(monthly(plan).toFixed(0))}/mo`)}
                    </Text>
                  </View>
                  <View style={styles.planPrice}>
                    <Text style={styles.price}>{formatMoney(plan.price)}</Text>
                    {saving > 0 ? <TagBadge label={tx(`${saving}% সাশ্রয়`, `Save ${saving}%`)} variant="free" /> : null}
                  </View>
                </Pressable>
              );
            })}

            <AppButton
              label={chosen ? tx(`${formatMoney(chosen.price)} পরিশোধ করুন`, `Pay ${formatMoney(chosen.price)}`) : tx('প্ল্যান বেছে নিন', 'Choose a plan')}
              onPress={buy}
              isLoading={buying}
              disabled={!chosen}
            />
            <Text style={styles.fine}>
              {tx('bKash, Nagad, কার্ড ও ব্যাংক — SSLCommerz-এর মাধ্যমে।', 'bKash, Nagad, cards and banks — via SSLCommerz.')}
            </Text>

            {premium && !user?.subscription_cancelled ? (
              <AppButton label={tx('নবায়ন রিমাইন্ডার বন্ধ করুন', 'Turn off renewal')} variant="secondary" onPress={cancel} />
            ) : null}

            {data.data?.payments.length ? (
              <View style={styles.history}>
                <Text style={styles.historyTitle}>{tx('পেমেন্ট ইতিহাস', 'Payment history')}</Text>
                {data.data.payments.map((p) => (
                  <View key={p.id} style={styles.historyRow}>
                    <View style={styles.historyIcon}>
                      <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.planText}>
                      <Text style={styles.historyName}>
                        {p.kind === 'subscription'
                          ? tx(`প্রিমিয়াম · ${p.months} মাস`, `Premium · ${p.months} month${p.months > 1 ? 's' : ''}`)
                          : tx('প্রকাশক নিবন্ধন ফি', 'Publisher registration fee')}
                      </Text>
                      <Text style={styles.planMeta}>{formatDate(p.updated_at, isEnglish)}</Text>
                    </View>
                    <Text style={styles.historyAmount}>{formatMoney(p.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  activeCard: {
    backgroundColor: Colors.tintPurple,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 4,
  },
  activeTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.tintPurpleText,
  },
  activeText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  benefits: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  benefit: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  planActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  planText: {
    flex: 1,
    gap: 2,
  },
  planName: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  planMeta: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  planPrice: {
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    fontSize: FontSizes.md,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  fine: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  history: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  historyTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  historyName: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySurface,
  },
  historyAmount: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
