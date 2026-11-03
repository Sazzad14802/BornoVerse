/**
 * SubscriptionScreen — Premium plans.
 * - No Premium: every plan, with the benefits.
 * - Premium: the current plan and only longer plans as upgrades; on the
 *   longest plan nothing can be bought. Payment history has its own screen.
 * Prices come from the server, which also refuses the same or a shorter plan.
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
    const [plans, current] = await Promise.all([
      subscriptionApi.plans(),
      subscriptionApi.current().catch(() => null),
    ]);
    return { plans, current };
  }, [user?.premium_until]);
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  const allPlans = data.data?.plans ?? [];
  const current = premium ? data.data?.current ?? null : null;
  const currentPlan = current?.plan ?? null;
  // While Premium is active only longer plans are offered.
  const plans = current && currentPlan ? allPlans.filter((p) => current.upgrade_plan_ids.includes(p.id)) : allPlans;
  const isHighest = !!currentPlan && plans.length === 0;
  const chosen = plans.find((p) => p.id === selected) ?? plans[0];

  const monthly = (plan: Plan) => Number(plan.price) / plan.months;
  const base = allPlans.length ? Math.max(...allPlans.map(monthly)) : 0;

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

  const months = (n: number) => tx(`${n} মাস`, `${n} month${n > 1 ? 's' : ''}`);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={currentPlan ? tx('আপনার প্ল্যান', 'Your plan') : tx('প্রিমিয়াম', 'Premium')} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={data.refresh} tintColor={Colors.primary} />}
      >
        {premium ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>
              {currentPlan
                ? tx(`বর্তমান প্ল্যান: ${currentPlan.name}`, `Current plan: ${currentPlan.name}`)
                : tx('প্রিমিয়াম সক্রিয়', 'Premium is active')}
            </Text>
            <Text style={styles.activeText}>
              {tx(`মেয়াদ: ${formatDate(user?.premium_until, false)}`, `Valid until ${formatDate(user?.premium_until, true)}`)}
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
        ) : isHighest ? (
          <View style={styles.check}>
            <Ionicons name="ribbon-outline" size={40} color={Colors.tintPurpleText} />
            <Text style={styles.checkTitle}>{tx('আপনি সর্বোচ্চ প্ল্যানে আছেন', 'You are on our highest plan')}</Text>
            <Text style={styles.activeText}>
              {tx('সব প্রিমিয়াম সুবিধা চালু আছে। উপভোগ করুন!', 'Every Premium benefit is on. Enjoy listening!')}
            </Text>
          </View>
        ) : (
          <>
            {currentPlan ? <Text style={styles.sectionTitle}>{tx('প্ল্যান আপগ্রেড করুন', 'Upgrade your plan')}</Text> : null}
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
                      {months(plan.months)} · {tx(`মাসে ${formatMoney(monthly(plan).toFixed(0))}`, `${formatMoney(monthly(plan).toFixed(0))}/mo`)}
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
              label={
                chosen
                  ? currentPlan
                    ? tx(`${formatMoney(chosen.price)} দিয়ে আপগ্রেড করুন`, `Upgrade for ${formatMoney(chosen.price)}`)
                    : tx(`${formatMoney(chosen.price)} পরিশোধ করুন`, `Pay ${formatMoney(chosen.price)}`)
                  : tx('প্ল্যান বেছে নিন', 'Choose a plan')
              }
              onPress={buy}
              isLoading={buying}
              disabled={!chosen}
            />
            <Text style={styles.fine}>
              {currentPlan
                ? tx('নতুন প্ল্যানের মেয়াদ বর্তমান মেয়াদের সাথে যোগ হবে।', 'The new plan is added on top of your current expiry.')
                : tx('bKash, Nagad, কার্ড ও ব্যাংক — SSLCommerz-এর মাধ্যমে।', 'bKash, Nagad, cards and banks — via SSLCommerz.')}
            </Text>
          </>
        )}

        {premium && !user?.subscription_cancelled ? (
          <AppButton label={tx('নবায়ন রিমাইন্ডার বন্ধ করুন', 'Turn off renewal')} variant="secondary" onPress={cancel} />
        ) : null}
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
  check: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  checkTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
