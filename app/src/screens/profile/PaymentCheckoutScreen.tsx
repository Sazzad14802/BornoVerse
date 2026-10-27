/**
 * PaymentCheckoutScreen — pays one server-priced order through SSLCommerz and
 * shows the verified result. Development mock orders get explicit test buttons.
 * An attempt that fails or is cancelled is abandoned: "Try again" starts a new
 * order for the same product, so history only ever shows completed payments.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { paymentsApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { ProfileStackParamList } from '../../navigation/types';
import { CheckoutOutcome, runHostedCheckout } from '../../services/checkout';
import { PaymentOrder } from '../../types/domain';
import { formatMoney, newIdempotencyKey } from '../../utils/format';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Phase = 'loading' | 'paying' | 'mock' | 'done' | 'error';

export function PaymentCheckoutScreen() {
  const { navigation } = useAppNavigation();
  const { orderId } = useRoute<RouteProp<ProfileStackParamList, 'PaymentCheckout'>>().params;
  const { refreshUser } = useAuth();
  const { refreshUnread } = useNotifications();
  const { tx } = useLanguage();

  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  const finish = useCallback(
    async (result: PaymentOrder, how: CheckoutOutcome) => {
      setOrder(result);
      setOutcome(how);
      setPhase('done');
      if (result.status === 'success') {
        await refreshUser();
        refreshUnread();
      }
    },
    [refreshUser, refreshUnread],
  );

  const pay = useCallback(
    async (current: PaymentOrder) => {
      setPhase('paying');
      setError('');
      try {
        const { order: result, outcome: how } = await runHostedCheckout(current);
        await finish(result, how);
      } catch (e) {
        setError(errorMessage(e));
        setPhase('error');
      }
    },
    [finish],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    paymentsApi
      .get(orderId)
      .then((loaded) => {
        setOrder(loaded);
        if (loaded.status !== 'pending') finish(loaded, loaded.status === 'success' ? 'success' : 'failed');
        else if (loaded.provider === 'mock') setPhase('mock');
        else pay(loaded);
      })
      .catch((e) => {
        setError(errorMessage(e));
        setPhase('error');
      });
  }, [orderId, pay, finish]);

  /** Abandon this attempt and pay the same product with a fresh order. */
  const startOver = async () => {
    if (!order) return;
    setPhase('loading');
    setOutcome(null);
    setError('');
    try {
      const fresh = await paymentsApi.initiate(order.kind, newIdempotencyKey(), order.plan_id ?? undefined);
      setOrder(fresh);
      if (fresh.provider === 'mock') setPhase('mock');
      else await pay(fresh);
    } catch (e) {
      setError(errorMessage(e));
      setPhase('error');
    }
  };

  const mockSettle = async (status: 'success' | 'failed') => {
    try {
      await finish(await paymentsApi.mockConfirm(orderId, status), status);
    } catch (e) {
      setError(errorMessage(e));
      setPhase('error');
    }
  };

  const product = order?.kind === 'publisher_registration' ? tx('প্রকাশক নিবন্ধন ফি', 'Publisher registration fee') : tx('প্রিমিয়াম সাবস্ক্রিপশন', 'Premium subscription');
  const succeeded = order?.status === 'success';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('পেমেন্ট', 'Payment')} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        {order ? (
          <View style={styles.summary}>
            <Text style={styles.product}>{product}</Text>
            <Text style={styles.amount}>{formatMoney(order.amount)}</Text>
            {order.months ? (
              <Text style={styles.meta}>{tx(`${order.months} মাস`, `${order.months} month${order.months > 1 ? 's' : ''}`)}</Text>
            ) : null}
          </View>
        ) : null}

        {phase === 'loading' || phase === 'paying' ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.status}>
              {phase === 'paying' ? tx('SSLCommerz-এ পেমেন্ট সম্পন্ন করুন…', 'Complete the payment on SSLCommerz…') : tx('লোড হচ্ছে…', 'Loading…')}
            </Text>
          </View>
        ) : null}

        {phase === 'mock' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tx('ডেভেলপমেন্ট পেমেন্ট', 'Development payment')}</Text>
            <Text style={styles.meta}>
              {tx(
                'SSLCommerz কনফিগার করা নেই, তাই এটি পরীক্ষামূলক পেমেন্ট।',
                'SSLCommerz is not configured, so this is a simulated payment.',
              )}
            </Text>
            <AppButton label={tx('সফল পেমেন্ট', 'Simulate success')} onPress={() => mockSettle('success')} />
            <AppButton label={tx('ব্যর্থ পেমেন্ট', 'Simulate failure')} variant="secondary" onPress={() => mockSettle('failed')} />
          </View>
        ) : null}

        {phase === 'done' && order ? (
          <View style={[styles.card, succeeded ? styles.cardSuccess : styles.cardFailed]}>
            <Ionicons
              name={succeeded ? 'checkmark-circle' : outcome === 'pending' ? 'time-outline' : 'close-circle'}
              size={44}
              color={succeeded ? Colors.success : outcome === 'pending' ? Colors.warning : Colors.error}
            />
            <Text style={styles.cardTitle}>
              {succeeded
                ? tx('পেমেন্ট সফল হয়েছে', 'Payment successful')
                : outcome === 'cancelled'
                  ? tx('পেমেন্ট বাতিল করা হয়েছে', 'Payment cancelled')
                  : outcome === 'pending'
                    ? tx('পেমেন্ট যাচাই হচ্ছে', 'Payment is being verified')
                    : tx('পেমেন্ট সম্পন্ন হয়নি', 'Payment not completed')}
            </Text>
            <Text style={styles.meta}>
              {succeeded
                ? order.kind === 'subscription'
                  ? tx('প্রিমিয়াম এখন সক্রিয়।', 'Premium is now active.')
                  : tx('আপনার প্রকাশক অ্যাকাউন্ট এখন সক্রিয়।', 'Your publisher account is now active.')
                : tx('কোনো টাকা কাটা হলে তা স্বয়ংক্রিয়ভাবে যাচাই হবে।', 'If you were charged, it will be verified automatically.')}
            </Text>
            {succeeded ? (
              <AppButton label={tx('ঠিক আছে', 'Done')} onPress={() => navigation.goBack()} />
            ) : (
              <>
                <AppButton label={tx('আবার চেষ্টা করুন', 'Try again')} onPress={startOver} />
                <AppButton label={tx('পরে', 'Later')} variant="secondary" onPress={() => navigation.goBack()} />
              </>
            )}
          </View>
        ) : null}

        {phase === 'error' ? (
          <View style={[styles.card, styles.cardFailed]}>
            <Text style={styles.cardTitle}>{tx('পেমেন্ট শুরু করা যায়নি', 'Could not start payment')}</Text>
            <Text style={styles.meta}>{error}</Text>
            {order ? <AppButton label={tx('আবার চেষ্টা করুন', 'Try again')} onPress={startOver} /> : null}
          </View>
        ) : null}

        <View style={styles.secureRow}>
          <Ionicons name="lock-closed" size={13} color={Colors.textMuted} />
          <Text style={styles.secure}>{tx('SSLCommerz-এর মাধ্যমে নিরাপদ পেমেন্ট', 'Secured by SSLCommerz')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  summary: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.lg,
  },
  product: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  amount: {
    fontSize: FontSizes['3xl'],
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  meta: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  center: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  status: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'stretch',
  },
  cardSuccess: {
    backgroundColor: Colors.tintGreen,
    borderColor: Colors.tintGreen,
  },
  cardFailed: {
    backgroundColor: Colors.tintError,
    borderColor: Colors.tintError,
  },
  cardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secure: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
});
