/**
 * PublisherScreen — the publisher room. Any user (free or premium) can apply:
 * 1. submit verification (legal name + PDF), 2. admin review,
 * 3. pay the registration fee, 4. create the one channel, then manage it,
 *    earnings and withdrawals here. Publishing happens in the channel
 *    (ChannelScreen), organised with playlists.
 * The setup steps show only until the account is active. If moderation
 * restricts the publisher's content, a red warning with an Appeal button
 * appears at the top; once they have appealed, "Appeal history" stays here.
 * The channel can be deleted (its audiobooks stay private) and created again.
 */

import React, { useState } from 'react';
import { AppAlert } from '../../components/AppAlert';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Field, FormCard } from '../../components/Form';
import { ListRow } from '../../components/ListRow';
import { ModalBottomSheet, SheetScrollView } from '../../components/ModalBottomSheet';
import { ChipGroup } from '../../components/Chip';
import { StateView } from '../../components/StateView';
import { TagBadge } from '../../components/TagBadge';
import { paymentsApi, publisherApi } from '../../api/account';
import { moderationApi } from '../../api/moderation';
import { errorMessage } from '../../api/client';
import { PickedFile } from '../../api/upload';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { Channel, PayoutMethod, Withdrawal } from '../../types/domain';
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
    const [applications, fee, dashboard, channels, standing, appeals] = await Promise.all([
      publisherApi.applications(),
      publisherApi.registrationFee().catch(() => null),
      active ? publisherApi.dashboard() : Promise.resolve(null),
      active ? publisherApi.channels() : Promise.resolve([]),
      moderationApi.standing().catch(() => null),
      moderationApi.appeals().catch(() => []),
    ]);
    return { applications, fee, dashboard, channels, standing, appeals };
  }, [active]);

  const [legalName, setLegalName] = useState(user?.full_name ?? '');
  const [document, setDocument] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [withdrawSheet, setWithdrawSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('bkash');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');

  const latest = data.data?.applications[0];
  const awaitingReview = latest?.status === 'pending';
  const canApply = ((status === 'none' || status === 'pending_approval') && !awaitingReview) || status === 'rejected';
  const stepIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      AppAlert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(error));
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
      AppAlert.alert(tx('আবেদন জমা হয়েছে', 'Application submitted'), tx('পর্যালোচনার পর নোটিফিকেশন পাবেন।', 'You will be notified after review.'));
      await data.reload();
    });

  const payFee = () =>
    run('fee', async () => {
      const order = await paymentsApi.initiate('publisher_registration', newIdempotencyKey());
      navigation.navigate('PaymentCheckout', { orderId: order.id });
    });

  const openChannel = (channel: Channel) => navigation.navigate('Channel', { channelId: channel.id });

  const createChannel = () =>
    run('channel', async () => {
      if (!channelName.trim()) throw new Error(tx('চ্যানেলের নাম দিন।', 'Enter a channel name.'));
      const channel = await publisherApi.createChannel(channelName.trim(), channelDescription.trim());
      await data.reload();
      openChannel(channel);
    });

  const openWithdraw = () => {
    const available = Number(data.data?.dashboard?.available_balance ?? 0);
    if (available <= 0) {
      AppAlert.alert(
        tx('তোলার মতো টাকা নেই', 'Nothing to withdraw yet'),
        tx(
          'প্রতিদিন শেষে সেদিন আপনার কনটেন্ট যতটা শোনা হয়েছে, সেই অনুপাতে প্রিমিয়াম আয়ের অংশ ব্যালান্সে যোগ হয়। ব্যালান্সে টাকা এলেই যেকোনো সময় তুলতে পারবেন।',
          'At the end of every day, your share of that day’s Premium income (by how much your content was listened to) is added to your balance. You can withdraw any time once there is money in it.',
        ),
      );
      return;
    }
    setAmount('');
    setWithdrawSheet(true);
  };

  const withdraw = () =>
    run('withdraw', async () => {
      const value = Number(amount);
      const available = Number(data.data?.dashboard?.available_balance ?? 0);
      if (!Number.isFinite(value) || value <= 0) throw new Error(tx('সঠিক পরিমাণ দিন।', 'Enter a valid amount.'));
      if (value > available) {
        throw new Error(tx(`সর্বোচ্চ ${formatMoney(available)} তোলা যাবে।`, `You can withdraw at most ${formatMoney(available)}.`));
      }
      if (payoutMethod === 'bank') {
        if (!bankName.trim() || !accountName.trim() || accountNumber.trim().length < 6) {
          throw new Error(tx('ব্যাংকের নাম, অ্যাকাউন্টের নাম ও নম্বর দিন।', 'Enter the bank name, account name and account number.'));
        }
      } else if (!/^01[3-9]\d{8}$/.test(accountNumber.trim())) {
        throw new Error(tx('১১ অঙ্কের সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)।', 'Enter a valid 11-digit mobile number (01XXXXXXXXX).'));
      }
      await publisherApi.requestWithdrawal(value.toFixed(2), {
        method: payoutMethod,
        account_name: accountName.trim(),
        account_number: accountNumber.trim(),
        bank_name: bankName.trim(),
        branch: branch.trim(),
      });
      setWithdrawSheet(false);
      setAmount('');
      AppAlert.alert(
        tx('অনুরোধ জমা হয়েছে', 'Request submitted'),
        tx(
          'অ্যাডমিন যাচাই করে কবে টাকা পাঠানো হবে জানাবেন, আর পাঠানোর পর রেফারেন্সসহ নোটিফিকেশন পাবেন।',
          'An admin will review it and tell you when the money will be sent; you will get the payment reference once it is sent.',
        ),
      );
      await data.reload();
    });

  // Fill fields an older server may not send, so the studio never breaks on them.
  const rawDashboard = data.data?.dashboard;
  const dashboard = rawDashboard
    ? {
        ...rawDashboard,
        lifetime_earned: rawDashboard.lifetime_earned ?? '0',
        withdrawn: rawDashboard.withdrawn ?? '0',
        pending_withdrawals: rawDashboard.pending_withdrawals ?? '0',
        followers: rawDashboard.followers ?? 0,
        ledger: rawDashboard.ledger ?? [],
        withdrawals: rawDashboard.withdrawals ?? [],
        this_month: Object.assign(
          { month: '', estimated: '0', eligible_views: rawDashboard.eligible_views ?? 0, all_eligible_views: 0, publisher_percent: 70 },
          rawDashboard.this_month,
        ),
      }
    : undefined;
  const withdrawalStatus = (status: Withdrawal['status']) =>
    ({
      pending: tx('অপেক্ষমাণ', 'Pending'),
      approved: tx('অনুমোদিত', 'Approved'),
      completed: tx('পাঠানো হয়েছে', 'Paid'),
      rejected: tx('বাতিল', 'Rejected'),
    })[status] ?? status;
  const myChannel = data.data?.channels[0];
  const standing = data.data?.standing;
  const appealable = standing?.cases.filter((c) => c.can_appeal) ?? [];
  const restrictedUntil = standing?.publishing_restricted_until;
  const underAction = standing?.cases.filter((c) => c.status === 'action_taken') ?? [];
  const showWarning = !!restrictedUntil || underAction.length > 0;
  const hasAppeals = (data.data?.appeals.length ?? 0) > 0;
  const appealHistory = (
    <Pressable
      onPress={() => navigation.navigate('Appeals')}
      style={({ pressed }) => [styles.appealRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={tx('আপিলের ইতিহাস', 'Appeal history')}
    >
      <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
      <Text style={styles.appealText}>{tx('আপিলের ইতিহাস', 'Appeal history')}</Text>
      <View style={styles.appealCount}>
        <Text style={styles.appealCountText}>{data.data?.appeals.length ?? 0}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
  const today = dashboard?.this_month.today;

  const deleteChannel = (channel: Channel) =>
    AppAlert.alert(
      tx('চ্যানেল মুছবেন?', 'Delete this channel?'),
      tx(
        `«${channel.name}» মুছে যাবে, ফলোয়ার ও চ্যানেলের প্লেলিস্টও। অডিওবুকগুলো মুছবে না — "আমার অডিওবুক"-এ প্রাইভেট হয়ে থাকবে, শ্রোতারা দেখবে না। পরে নতুন চ্যানেল খুলতে পারবেন।`,
        `“${channel.name}”, its followers and channel playlists will be removed. Your audiobooks are not deleted: they stay private in My audiobooks, hidden from listeners. You can create a new channel later.`,
      ),
      [
        { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
        {
          text: tx('মুছুন', 'Delete'),
          style: 'destructive',
          onPress: () =>
            run('delete-channel', async () => {
              const result = await publisherApi.deleteChannel(channel.id);
              await data.reload();
              AppAlert.alert(
                tx('চ্যানেল মুছে ফেলা হয়েছে', 'Channel deleted'),
                tx(`${result.audiobooks_kept}টি অডিওবুক প্রাইভেট হিসেবে রাখা হয়েছে।`, `${result.audiobooks_kept} audiobooks were kept as private.`),
              );
            }),
        },
      ],
    );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('প্রকাশক স্টুডিও', 'Publisher studio')} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={data.refresh} tintColor={Colors.primary} />}
      >
        {showWarning ? (
          <View style={styles.warning}>
            <View style={styles.warningHead}>
              <Ionicons name="warning" size={22} color={Colors.tintErrorText} />
              <Text style={styles.warningTitle}>{tx('আপনার কনটেন্টে ব্যবস্থা নেওয়া হয়েছে', 'Action was taken on your content')}</Text>
            </View>
            {underAction.map((c) => (
              <Text key={c.report_id} style={styles.warningText}>
                «{c.audiobook.title}»
              </Text>
            ))}
            {restrictedUntil ? (
              <Text style={styles.warningText}>
                {tx(
                  `প্রকাশের সুবিধা ${formatDate(restrictedUntil, false)} পর্যন্ত সীমিত।`,
                  `Publishing is restricted until ${formatDate(restrictedUntil, true)}.`,
                )}
              </Text>
            ) : null}
            {appealable.length ? (
              <>
                <Text style={styles.warningText}>
                  {tx(
                    `সিদ্ধান্ত ভুল মনে হলে ${formatDate(appealable[0].appeal_deadline, false)}-এর মধ্যে আপিল করুন।`,
                    `If you think this is a mistake, appeal by ${formatDate(appealable[0].appeal_deadline, true)}.`,
                  )}
                </Text>
                <AppButton label={tx('আপিল করুন', 'Appeal')} variant="danger" onPress={() => navigation.navigate('AccountStatus')} />
              </>
            ) : (
              <AppButton label={tx('বিস্তারিত দেখুন', 'View details')} variant="secondary" onPress={() => navigation.navigate('AccountStatus')} />
            )}
          </View>
        ) : null}

        {hasAppeals && !(active && dashboard && myChannel) ? appealHistory : null}

        {active ? null : (
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
        )}

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

        {active && data.data && !myChannel ? (
          <FormCard>
            <View style={styles.createIcon}>
              <Ionicons name="radio-outline" size={26} color={Colors.primary} />
            </View>
            <Text style={styles.cardTitle}>{tx('আপনার চ্যানেল তৈরি করুন', 'Create your channel')}</Text>
            <Text style={styles.cardText}>
              {tx(
                'প্রতিটি প্রকাশকের একটি চ্যানেল থাকে। শ্রোতারা এটি ফলো করবে, আর আপনি প্লেলিস্ট দিয়ে অডিওবুক সাজাবেন।',
                'Every publisher has one channel. Listeners follow it, and you organise your audiobooks with playlists.',
              )}
            </Text>
            <Field label={tx('চ্যানেলের নাম', 'Channel name')} required value={channelName} onChangeText={setChannelName} maxLength={150} />
            <Field
              label={tx('বিবরণ', 'Description')}
              value={channelDescription}
              onChangeText={setChannelDescription}
              multiline
              maxLength={5000}
            />
            <AppButton label={tx('চ্যানেল তৈরি করুন', 'Create channel')} onPress={createChannel} isLoading={busy === 'channel'} />
          </FormCard>
        ) : null}

        {active && dashboard && myChannel ? (
          <>
            <View style={styles.earnings}>
              <Text style={styles.earningsLabel}>{tx('উত্তোলনযোগ্য ব্যালান্স', 'Available balance')}</Text>
              <Text style={styles.earningsValue}>{formatMoney(dashboard.available_balance)}</Text>
              <View style={styles.earningsRow}>
                <View style={styles.earningsItem}>
                  <Text style={styles.earningsSmallValue}>{formatMoney(dashboard.this_month.estimated)}</Text>
                  <Text style={styles.earningsSmallLabel}>{tx('এ মাসে (আজসহ)', 'This month (incl. today)')}</Text>
                </View>
                <View style={styles.earningsItem}>
                  <Text style={styles.earningsSmallValue}>{formatMoney(dashboard.lifetime_earned)}</Text>
                  <Text style={styles.earningsSmallLabel}>{tx('মোট আয়', 'Total earned')}</Text>
                </View>
                <View style={styles.earningsItem}>
                  <Text style={styles.earningsSmallValue}>{formatMoney(dashboard.withdrawn)}</Text>
                  <Text style={styles.earningsSmallLabel}>{tx('তোলা হয়েছে', 'Paid out')}</Text>
                </View>
              </View>
              {Number(dashboard.pending_withdrawals) > 0 ? (
                <Text style={styles.earningsNote}>
                  {tx(`${formatMoney(dashboard.pending_withdrawals)} উত্তোলনের অপেক্ষায়`, `${formatMoney(dashboard.pending_withdrawals)} waiting to be paid out`)}
                </Text>
              ) : null}
              <Text style={styles.earningsNote}>
                {today
                  ? tx(
                      `আজ এ পর্যন্ত: আনুমানিক ${formatMoney(today.estimated)} (আপনার ${today.listens}টি যোগ্য শোনা, সবার ${today.all_listens}টি)। প্রতিদিন শেষে সেদিনের প্রিমিয়াম আয়ের ${dashboard.this_month.publisher_percent}% শোনার অনুপাতে ভাগ হয়ে ব্যালান্সে যোগ হয় — যেকোনো সময় তুলতে পারবেন।`,
                      `Today so far: about ${formatMoney(today.estimated)} (${today.listens} of ${today.all_listens} eligible listens are yours). At the end of each day, ${dashboard.this_month.publisher_percent}% of that day's Premium income is shared by listens and added to your balance — withdraw any time.`,
                    )
                  : tx(
                      `এ মাসে আপনার ${dashboard.this_month.eligible_views}টি যোগ্য শোনা (সবার ${dashboard.this_month.all_eligible_views}টি)।`,
                      `${dashboard.this_month.eligible_views} of ${dashboard.this_month.all_eligible_views} eligible listens this month are yours.`,
                    )}
              </Text>
              <AppButton label={tx('টাকা তোলার অনুরোধ', 'Request withdrawal')} icon="cash-outline" onPress={openWithdraw} />
            </View>

            {hasAppeals ? appealHistory : null}

            <FormCard style={styles.list}>
              <ListRow
                icon="stats-chart-outline"
                title={tx('চ্যানেল অ্যানালিটিক্স', 'Channel analytics')}
                subtitle={tx('ফলোয়ার, শোনার সময়, শ্রোতা ও রিপোর্ট', 'Followers, listening time, listeners and reports')}
                value={tx(`${dashboard.followers} ফলোয়ার`, `${dashboard.followers} followers`)}
                onPress={() => navigation.navigate('PublisherAnalytics')}
                last
              />
            </FormCard>

            {myChannel ? (
              <FormCard style={styles.list}>
                <Text style={styles.cardTitle}>{tx('আমার চ্যানেল', 'My channel')}</Text>
                <ListRow
                  icon="radio-outline"
                  title={myChannel.name}
                  subtitle={
                    myChannel.moderated
                      ? tx('অ্যাডমিন সীমিত করেছেন', 'Restricted by admin')
                      : tx('অডিওবুক প্রকাশ ও প্লেলিস্ট পরিচালনা', 'Publish audiobooks and manage playlists')
                  }
                  onPress={() => openChannel(myChannel)}
                />
                <ListRow
                  icon="eye-outline"
                  title={tx('পাবলিক পেজ দেখুন', 'View public page')}
                  subtitle={tx('শ্রোতারা যেভাবে দেখেন', 'As listeners see it')}
                  onPress={() => navigation.navigate('ChannelProfile', { channelId: myChannel.id })}
                />
                <ListRow
                  icon="trash-outline"
                  title={tx('চ্যানেল মুছুন', 'Delete channel')}
                  subtitle={tx('অডিওবুক প্রাইভেট হয়ে থাকবে', 'Audiobooks stay, as private')}
                  onPress={() => deleteChannel(myChannel)}
                  destructive
                  last
                />
              </FormCard>
            ) : null}

            <FormCard style={styles.list}>
              <Text style={styles.cardTitle}>{tx('উত্তোলনের অনুরোধ', 'Withdrawal requests')}</Text>
              {dashboard.withdrawals.slice(0, 10).map((w, i, all) => (
                <View key={w.id} style={[styles.ledgerBlock, i < all.length - 1 && styles.divider]}>
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerTitle} numberOfLines={1}>
                      {w.destination}
                    </Text>
                    <Text style={styles.ledgerAmount}>{formatMoney(w.amount)}</Text>
                  </View>
                  <View style={styles.ledgerRow}>
                    <TagBadge label={withdrawalStatus(w.status)} variant={w.status === 'completed' ? 'free' : w.status === 'rejected' ? 'premium' : 'genre'} />
                    <Text style={styles.ledgerMeta} numberOfLines={2}>
                      {w.status === 'completed'
                        ? tx(`পাঠানো হয়েছে ${formatDate(w.paid_at, false)} · রেফ: ${w.payout_reference ?? ''}`, `Sent ${formatDate(w.paid_at, true)} · Ref: ${w.payout_reference ?? ''}`)
                        : w.status === 'approved' && w.scheduled_for
                          ? tx(`${formatDate(w.scheduled_for, false)}-এর মধ্যে পাঠানো হবে`, `Will be sent by ${formatDate(w.scheduled_for, true)}`)
                          : w.status === 'rejected'
                            ? w.reason
                            : tx(`জমা ${formatDate(w.created_at, false)}`, `Requested ${formatDate(w.created_at, true)}`)}
                    </Text>
                  </View>
                </View>
              ))}
              {!dashboard.withdrawals.length ? (
                <Text style={styles.cardText}>{tx('এখনো কোনো উত্তোলনের অনুরোধ নেই।', 'No withdrawal requests yet.')}</Text>
              ) : null}
            </FormCard>

            <FormCard style={styles.list}>
              <Text style={styles.cardTitle}>{tx('মাসিক আয়', 'Monthly earnings')}</Text>
              {dashboard.ledger.filter((l) => l.kind === 'earning').slice(0, 12).map((l, i, all) => (
                <View key={l.id} style={[styles.ledgerRow, styles.ledgerBlock, i < all.length - 1 && styles.divider]}>
                  <Text style={styles.ledgerTitle}>{l.month}</Text>
                  <Text style={styles.ledgerAmount}>{formatMoney(l.amount)}</Text>
                </View>
              ))}
              {!dashboard.ledger.some((l) => l.kind === 'earning') ? (
                <Text style={styles.cardText}>
                  {tx('প্রথম মাস শেষ হলে এখানে আয় দেখা যাবে।', 'Your earnings appear here once your first month closes.')}
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

      <ModalBottomSheet visible={withdrawSheet} onClose={() => setWithdrawSheet(false)}>
        <View style={styles.sheet}>
          <Text style={styles.cardTitle}>{tx('টাকা তোলার অনুরোধ', 'Request withdrawal')}</Text>
          <SheetScrollView maxHeight={460}>
            <View style={styles.sheetBody}>
              {dashboard ? (
                <Text style={styles.cardText}>
                  {tx(`সর্বোচ্চ তোলা যাবে: ${formatMoney(dashboard.available_balance)}`, `You can withdraw up to ${formatMoney(dashboard.available_balance)}`)}
                </Text>
              ) : null}
              <View style={styles.amountRow}>
                <View style={styles.flex}>
                  <Field label={tx('পরিমাণ (৳)', 'Amount (BDT)')} required value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
                </View>
                <AppButton
                  label={tx('সব', 'All')}
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setAmount(String(Number(dashboard?.available_balance ?? 0)))}
                />
              </View>
              <Text style={styles.fieldLabel}>{tx('কোথায় পাঠাবেন', 'Send to')}</Text>
              <ChipGroup<PayoutMethod>
                value={payoutMethod}
                onChange={setPayoutMethod}
                options={[
                  { value: 'bkash', label: 'bKash' },
                  { value: 'nagad', label: 'Nagad' },
                  { value: 'rocket', label: 'Rocket' },
                  { value: 'bank', label: tx('ব্যাংক', 'Bank') },
                ]}
              />
              {payoutMethod === 'bank' ? (
                <>
                  <Field label={tx('ব্যাংকের নাম', 'Bank name')} required value={bankName} onChangeText={setBankName} maxLength={150} />
                  <Field label={tx('অ্যাকাউন্টের নাম', 'Account holder name')} required value={accountName} onChangeText={setAccountName} maxLength={150} />
                  <Field label={tx('অ্যাকাউন্ট নম্বর', 'Account number')} required value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" maxLength={50} />
                  <Field label={tx('শাখা', 'Branch')} value={branch} onChangeText={setBranch} maxLength={150} />
                </>
              ) : (
                <>
                  <Field
                    label={tx('মোবাইল নম্বর', 'Mobile number')}
                    required
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    keyboardType="phone-pad"
                    placeholder="01XXXXXXXXX"
                    maxLength={11}
                  />
                  <Field label={tx('অ্যাকাউন্টের নাম (ঐচ্ছিক)', 'Account name (optional)')} value={accountName} onChangeText={setAccountName} maxLength={150} />
                </>
              )}
            </View>
          </SheetScrollView>
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
  warning: {
    backgroundColor: Colors.tintError,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#F5C2C2',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  warningHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  warningTitle: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.tintErrorText,
  },
  warningText: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  earnings: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  earningsLabel: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },
  earningsValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  earningsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  earningsItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 2,
  },
  earningsSmallValue: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  earningsSmallLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  earningsNote: {
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 17,
  },
  ledgerBlock: {
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  ledgerMeta: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  sheetBody: {
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  flex: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
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
  appealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  appealText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  appealCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appealCountText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  pressed: {
    opacity: 0.7,
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
  createIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
