/**
 * PublisherScreen — any user can become a publisher here:
 * 1. submit verification (legal name + PDF) → 2. admin review →
 * 3. pay the registration fee → 4. studio: channels, earnings, withdrawals.
 * Publishing itself happens inside a channel (see ChannelScreen).
 */

import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Field, FormCard } from '../../components/Form';
import { ListRow } from '../../components/ListRow';
import { ModalBottomSheet } from '../../components/ModalBottomSheet';
import { StateView } from '../../components/StateView';
import { TagBadge } from '../../components/TagBadge';
import { paymentsApi, publisherApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { PickedFile } from '../../api/upload';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { Channel } from '../../types/domain';
import { formatDate, formatMoney, newIdempotencyKey } from '../../utils/format';
import { pickDocument } from '../../utils/pickers';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const STEPS = ['pending_approval', 'approved_pending_payment', 'active'] as const;

export function PublisherScreen() {
  const { navigation } = useAppNavigation();
  const { user, refreshUser } = useAuth();
  const { tx, isEnglish } = useLanguage();
  const status = user?.publisher_status ?? 'none';
  const active = status === 'active';

  const data = useResource(async () => {
    await refreshUser();
    const [applications, fee, dashboard, channels] = await Promise.all([
      publisherApi.applications(),
      publisherApi.registrationFee().catch(() => null),
      active ? publisherApi.dashboard() : Promise.resolve(null),
      active ? publisherApi.channels() : Promise.resolve([]),
    ]);
    return { applications, fee, dashboard, channels };
  }, [active]);

  const [legalName, setLegalName] = useState(user?.full_name ?? '');
  const [document, setDocument] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [channelSheet, setChannelSheet] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [withdrawSheet, setWithdrawSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');

  const latest = data.data?.applications[0];
  const awaitingReview = latest?.status === 'pending';
  const canApply = ((status === 'none' || status === 'pending_approval') && !awaitingReview) || status === 'rejected';
  const stepIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      Alert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const chooseDocument = () =>
    run('pick', async () => {
      const picked = await pickDocument('pdf');
      if (picked) setDocument(picked);
    });

  const apply = () =>
    run('apply', async () => {
      if (legalName.trim().length < 2 || !document) throw new Error(tx('আইনি নাম ও PDF দুটোই দিন।', 'Enter your legal name and choose a PDF.'));
      await publisherApi.apply(legalName.trim(), document);
      setDocument(null);
      Alert.alert(tx('আবেদন জমা হয়েছে', 'Application submitted'), tx('পর্যালোচনার পর নোটিফিকেশন পাবেন।', 'You will be notified after review.'));
      await data.reload();
    });

  const payFee = () =>
    run('fee', async () => {
      const order = await paymentsApi.initiate('publisher_registration', newIdempotencyKey());
      navigation.navigate('PaymentCheckout', { orderId: order.id });
    });

  const openChannel = (channel: Channel) => navigation.navigate('Channel', { channelId: channel.id });

  const newChannel = () => {
    setChannelName('');
    setChannelDescription('');
    setChannelSheet(true);
  };

  const createChannel = () =>
    run('channel', async () => {
      if (!channelName.trim()) throw new Error(tx('চ্যানেলের নাম দিন।', 'Enter a channel name.'));
      const channel = await publisherApi.createChannel(channelName.trim(), channelDescription.trim());
      setChannelSheet(false);
      await data.reload();
      openChannel(channel);
    });

  const withdraw = () =>
    run('withdraw', async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error(tx('সঠিক পরিমাণ দিন।', 'Enter a valid amount.'));
      if (destination.trim().length < 5) throw new Error(tx('bKash/ব্যাংক তথ্য দিন।', 'Enter a bKash or bank destination.'));
      await publisherApi.requestWithdrawal(value.toFixed(2), destination.trim());
      setWithdrawSheet(false);
      setAmount('');
      Alert.alert(tx('অনুরোধ জমা হয়েছে', 'Request submitted'), tx('অ্যাডমিন অনুমোদনের পর জানানো হবে।', 'You will be notified once an admin reviews it.'));
      await data.reload();
    });

  const dashboard = data.data?.dashboard;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('প্রকাশক স্টুডিও', 'Publisher studio')} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={data.refresh} tintColor={Colors.primary} />}
      >
        <View style={styles.steps}>
          {[tx('যাচাই', 'Verify'), tx('ফি', 'Fee'), tx('সক্রিয়', 'Active')].map((label, i) => (
            <View key={label} style={styles.step}>
              <View style={[styles.stepDot, i <= stepIndex && styles.stepDotDone]}>
                {i < stepIndex || active ? (
                  <Ionicons name="checkmark" size={16} color={Colors.textOnPrimary} />
                ) : (
                  <Text style={styles.stepNumber}>{i + 1}</Text>
                )}
              </View>
              <Text style={styles.stepLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {data.isLoading ? <StateView kind="loading" /> : null}

        {status === 'rejected' && latest?.reason ? (
          <View style={styles.rejected}>
            <Text style={styles.rejectedTitle}>{tx('আবেদন বাতিল হয়েছে', 'Application rejected')}</Text>
            <Text style={styles.rejectedText}>{latest.reason}</Text>
          </View>
        ) : null}

        {awaitingReview ? (
          <FormCard>
            <Text style={styles.cardTitle}>{tx('পর্যালোচনা চলছে', 'Under review')}</Text>
            <Text style={styles.cardText}>
              {tx(`${formatDate(latest?.created_at, false)} তারিখে জমা দেওয়া আবেদনটি অ্যাডমিন দেখছেন।`, `Submitted ${formatDate(latest?.created_at, true)}. An administrator is reviewing it.`)}
            </Text>
          </FormCard>
        ) : null}

        {canApply ? (
          <FormCard>
            <Text style={styles.cardTitle}>{tx('প্রকাশক হোন', 'Become a publisher')}</Text>
            <Text style={styles.cardText}>
              {tx(
                'যাচাইয়ের পর নিবন্ধন ফি দিয়ে চ্যানেল খুলুন, MP3 আপলোড করুন বা আপনার তৈরি অডিওবুক প্রকাশ করুন। শুরু করতে আইনি নাম ও পরিচয়/প্রতিষ্ঠানের প্রমাণপত্র (PDF) জমা দিন।',
                'Once verified and the registration fee is paid, you can open channels, upload MP3s and publish your generated audiobooks. Start by submitting your legal name and an identity or organisation document (PDF).',
              )}
            </Text>
            <Field label={tx('আইনি নাম', 'Legal name')} required value={legalName} onChangeText={setLegalName} maxLength={150} />
            <AppButton
              label={document ? document.name : tx('PDF বেছে নিন', 'Choose PDF')}
              variant="secondary"
              onPress={chooseDocument}
            />
            <AppButton label={tx('আবেদন জমা দিন', 'Submit application')} onPress={apply} isLoading={busy === 'apply'} disabled={!document} />
          </FormCard>
        ) : null}

        {status === 'approved_pending_payment' ? (
          <FormCard>
            <Text style={styles.cardTitle}>{tx('আবেদন অনুমোদিত', 'Application approved')}</Text>
            <Text style={styles.cardText}>
              {tx('এককালীন নিবন্ধন ফি দিলেই প্রকাশনা শুরু করতে পারবেন।', 'Pay the one-time registration fee to start publishing.')}
            </Text>
            <AppButton
              label={data.data?.fee ? tx(`${formatMoney(data.data.fee)} পরিশোধ করুন`, `Pay ${formatMoney(data.data.fee)}`) : tx('ফি পরিশোধ করুন', 'Pay fee')}
              onPress={payFee}
              isLoading={busy === 'fee'}
            />
          </FormCard>
        ) : null}

        {active && dashboard ? (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{formatMoney(dashboard.available_balance)}</Text>
                <Text style={styles.statLabel}>{tx('উত্তোলনযোগ্য', 'Available')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{dashboard.eligible_views}</Text>
                <Text style={styles.statLabel}>{tx('এ মাসের যোগ্য শোনা', 'Eligible listens (month)')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{dashboard.audiobooks}</Text>
                <Text style={styles.statLabel}>{tx('অডিওবুক', 'Audiobooks')}</Text>
              </View>
            </View>
            <AppButton
              label={tx('টাকা তোলার অনুরোধ', 'Request withdrawal')}
              onPress={() => setWithdrawSheet(true)}
              disabled={Number(dashboard.available_balance) <= 0}
            />

            <FormCard style={styles.list}>
              <View style={styles.listHeader}>
                <Text style={styles.cardTitle}>{tx('চ্যানেল', 'Channels')}</Text>
                <AppButton label={tx('+ নতুন', '+ New')} variant="compact" fullWidth={false} onPress={newChannel} />
              </View>
              {data.data?.channels.length ? (
                data.data.channels.map((c, i, all) => (
                  <ListRow
                    key={c.id}
                    title={c.name}
                    subtitle={c.moderated ? tx('অ্যাডমিন সীমিত করেছেন', 'Restricted by admin') : c.description || undefined}
                    onPress={() => openChannel(c)}
                    last={i === all.length - 1}
                  />
                ))
              ) : (
                <Text style={styles.cardText}>{tx('প্রকাশ করতে প্রথমে একটি চ্যানেল খুলুন।', 'Create a channel to start publishing.')}</Text>
              )}
            </FormCard>

            <FormCard style={styles.list}>
              <Text style={styles.cardTitle}>{tx('আয় ও উত্তোলন', 'Earnings & withdrawals')}</Text>
              {[...dashboard.ledger.map((l) => ({ id: l.id, title: l.kind === 'earning' ? tx(`আয় · ${l.month}`, `Earnings · ${l.month}`) : tx('উত্তোলন', 'Withdrawal'), amount: l.amount, badge: null as string | null })),
                ...dashboard.withdrawals.filter((w) => w.status !== 'completed').map((w) => ({ id: w.id, title: tx('উত্তোলন অনুরোধ', 'Withdrawal request'), amount: `-${w.amount}`, badge: w.status }))]
                .slice(0, 12)
                .map((row, i, all) => (
                  <View key={row.id} style={[styles.ledgerRow, i < all.length - 1 && styles.divider]}>
                    <Text style={styles.ledgerTitle}>{row.title}</Text>
                    {row.badge ? <TagBadge label={row.badge} variant="genre" /> : null}
                    <Text style={[styles.ledgerAmount, row.amount.startsWith('-') && styles.negative]}>{formatMoney(row.amount.replace('-', ''))}</Text>
                  </View>
                ))}
              {!dashboard.ledger.length && !dashboard.withdrawals.length ? (
                <Text style={styles.cardText}>
                  {tx('মাস শেষে প্রিমিয়াম শোনার ভিত্তিতে আয় যোগ হয়।', 'Earnings are added at month close based on premium listens.')}
                </Text>
              ) : null}
            </FormCard>
          </>
        ) : null}

        {data.error && !data.data ? (
          <StateView kind="error" message={data.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={data.reload} />
        ) : null}
        <Text style={styles.fine}>{isEnglish ? 'Payouts are reviewed by administrators.' : 'উত্তোলন অ্যাডমিন যাচাই করে সম্পন্ন করেন।'}</Text>
      </ScrollView>

      <ModalBottomSheet visible={channelSheet} onClose={() => setChannelSheet(false)}>
        <View style={styles.sheet}>
          <Text style={styles.cardTitle}>{tx('নতুন চ্যানেল', 'New channel')}</Text>
          <Field label={tx('নাম', 'Name')} required value={channelName} onChangeText={setChannelName} maxLength={150} />
          <Field label={tx('বিবরণ', 'Description')} value={channelDescription} onChangeText={setChannelDescription} multiline maxLength={5000} />
          <AppButton label={tx('চ্যানেল খুলুন', 'Create channel')} onPress={createChannel} isLoading={busy === 'channel'} />
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={withdrawSheet} onClose={() => setWithdrawSheet(false)}>
        <View style={styles.sheet}>
          <Text style={styles.cardTitle}>{tx('টাকা তোলার অনুরোধ', 'Request withdrawal')}</Text>
          {dashboard ? (
            <Text style={styles.cardText}>{tx(`উত্তোলনযোগ্য: ${formatMoney(dashboard.available_balance)}`, `Available: ${formatMoney(dashboard.available_balance)}`)}</Text>
          ) : null}
          <Field label={tx('পরিমাণ (৳)', 'Amount (BDT)')} required value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Field
            label={tx('গন্তব্য', 'Destination')}
            required
            value={destination}
            onChangeText={setDestination}
            placeholder={tx('যেমন: bKash 01XXXXXXXXX', 'e.g. bKash 01XXXXXXXXX')}
            maxLength={150}
          />
          <AppButton label={tx('অনুরোধ পাঠান', 'Send request')} onPress={withdraw} isLoading={busy === 'withdraw'} />
        </View>
      </ModalBottomSheet>
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
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  step: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: Colors.primary,
  },
  stepNumber: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: FontSizes.sm,
  },
  stepLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  rejected: {
    backgroundColor: Colors.tintError,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 4,
  },
  rejectedTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.tintErrorText,
  },
  rejectedText: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: 4,
  },
  statValue: {
    fontSize: FontSizes.md,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  list: {
    gap: Spacing.xs,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  ledgerTitle: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  ledgerAmount: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.success,
  },
  negative: {
    color: Colors.textSecondary,
  },
  fine: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  sheet: {
    gap: Spacing.md,
  },
});
