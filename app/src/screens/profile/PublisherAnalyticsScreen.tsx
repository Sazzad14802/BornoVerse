/**
 * PublisherAnalyticsScreen — the channel at a glance: followers (total and
 * new per day), listening time, plays, distinct listeners, eligible listens,
 * reports, and the most-listened audiobooks, over 7 / 30 / 90 days.
 * The publisher's own listening is not counted.
 */

import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { ChipGroup } from '../../components/Chip';
import { StateView } from '../../components/StateView';
import { PublisherAnalytics, publisherApi } from '../../api/account';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Range = '7' | '30' | '90';

function hours(seconds: number, english: boolean): string {
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return english ? `${minutes} min` : `${minutes} মিনিট`;
  }
  const value = (seconds / 3600).toFixed(seconds < 36000 ? 1 : 0);
  return english ? `${value} h` : `${value} ঘণ্টা`;
}

function shortDate(iso: string, english: boolean): string {
  return new Date(iso).toLocaleDateString(english ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short' });
}

/** Daily bars with the first, middle and last dates underneath. */
function BarChart({ values, dates, color, english }: { values: number[]; dates: string[]; color: string; english: boolean }) {
  const max = Math.max(1, ...values);
  const marks = dates.length ? [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]] : [];
  return (
    <View>
      <View style={styles.bars}>
        {values.map((v, i) => (
          <View key={i} style={styles.barSlot}>
            <View style={[styles.bar, { height: `${Math.max(v ? 6 : 2, (v / max) * 100)}%`, backgroundColor: v ? color : Colors.track }]} />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {marks.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.axisText}>
            {shortDate(d, english)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Stat({ icon, label, value, tint }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; tint: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function PublisherAnalyticsScreen() {
  const { navigation } = useAppNavigation();
  const { tx, isEnglish } = useLanguage();
  const [range, setRange] = useState<Range>('30');
  const stats = useResource<PublisherAnalytics>(() => publisherApi.analytics(Number(range)), [range]);
  const s = stats.data;
  const dates = s?.daily.map((d) => d.date) ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('চ্যানেল অ্যানালিটিক্স', 'Channel analytics')}
        subtitle={s?.channel?.name}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={stats.isRefreshing} onRefresh={stats.refresh} tintColor={Colors.primary} />}
      >
        <ChipGroup<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: tx('৭ দিন', '7 days') },
            { value: '30', label: tx('৩০ দিন', '30 days') },
            { value: '90', label: tx('৯০ দিন', '90 days') },
          ]}
        />

        {stats.isLoading && !s ? (
          <StateView kind="loading" />
        ) : stats.error && !s ? (
          <StateView kind="error" message={stats.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={stats.reload} />
        ) : s ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{tx('ফলোয়ার', 'Followers')}</Text>
              <Text style={styles.heroValue}>{s.followers}</Text>
              <Text style={styles.heroDelta}>
                {tx(`গত ${s.days} দিনে +${s.new_followers}`, `+${s.new_followers} in the last ${s.days} days`)}
              </Text>
            </View>

            <View style={styles.grid}>
              <Stat icon="time-outline" tint={Colors.primary} value={hours(s.listen_seconds, isEnglish)} label={tx('শোনার সময়', 'Listening time')} />
              <Stat icon="people-outline" tint={Colors.tintBlueText} value={String(s.distinct_listeners)} label={tx('আলাদা শ্রোতা', 'Distinct listeners')} />
              <Stat icon="play-circle-outline" tint={Colors.tintPurpleText} value={String(s.plays)} label={tx('মোট প্লে', 'Plays')} />
              <Stat icon="sparkles-outline" tint={Colors.tintGreenText} value={String(s.eligible_views)} label={tx('এ মাসের যোগ্য শোনা', 'Eligible listens this month')} />
              <Stat icon="library-outline" tint={Colors.textSecondary} value={String(s.audiobooks)} label={tx('অডিওবুক', 'Audiobooks')} />
              <Stat icon="flag-outline" tint={Colors.tintErrorText} value={String(s.reports.total)} label={tx('রিপোর্ট (মোট)', 'Reports (all time)')} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{tx('প্রতিদিন নতুন ফলোয়ার', 'New followers per day')}</Text>
              <BarChart values={s.daily.map((d) => d.followers)} dates={dates} color={Colors.primary} english={isEnglish} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{tx('প্রতিদিন শোনার সময় (মিনিট)', 'Listening minutes per day')}</Text>
              <BarChart values={s.daily.map((d) => Math.round(d.listen_seconds / 60))} dates={dates} color={Colors.tintBlueText} english={isEnglish} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{tx('প্রতিদিন শ্রোতা', 'Listeners per day')}</Text>
              <BarChart values={s.daily.map((d) => d.listeners)} dates={dates} color={Colors.tintPurpleText} english={isEnglish} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{tx('সবচেয়ে বেশি শোনা', 'Most listened')}</Text>
              {s.top_audiobooks.length ? (
                s.top_audiobooks.map((b, i) => {
                  const top = s.top_audiobooks[0].listen_seconds || 1;
                  return (
                    <View key={b.id} style={styles.topRow}>
                      <Text style={styles.topRank}>{i + 1}</Text>
                      <View style={styles.topText}>
                        <Text style={styles.topTitle} numberOfLines={1}>
                          {b.title}
                        </Text>
                        <View style={styles.topTrack}>
                          <View style={[styles.topFill, { width: `${(b.listen_seconds / top) * 100}%` }]} />
                        </View>
                      </View>
                      <Text style={styles.topValue}>{hours(b.listen_seconds, isEnglish)}</Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.muted}>{tx('এই সময়ে কেউ শোনেনি।', 'No listening in this period.')}</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{tx('রিপোর্ট', 'Reports')}</Text>
              <View style={styles.reportRow}>
                <Text style={styles.muted}>{tx('পর্যালোচনায়', 'Under review')}</Text>
                <Text style={styles.reportValue}>{s.reports.open}</Text>
              </View>
              <View style={styles.reportRow}>
                <Text style={styles.muted}>{tx('ব্যবস্থা নেওয়া হয়েছে', 'Action taken')}</Text>
                <Text style={styles.reportValue}>{s.reports.action_taken}</Text>
              </View>
              <View style={styles.reportRow}>
                <Text style={styles.muted}>{tx('খারিজ', 'Dismissed')}</Text>
                <Text style={styles.reportValue}>{s.reports.dismissed}</Text>
              </View>
            </View>

            <Text style={styles.footnote}>
              {tx(
                `মোট আলাদা শ্রোতা (শুরু থেকে): ${s.all_time_listeners}। আপনার নিজের শোনা এখানে গোনা হয় না।`,
                `Distinct listeners since the start: ${s.all_time_listeners}. Your own listening is not counted.`,
              )}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.md },
  hero: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: 2,
  },
  heroLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  heroValue: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
  heroDelta: { fontSize: FontSizes.sm, color: Colors.brandLight, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: {
    width: '31.5%',
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.sm,
    gap: 2,
  },
  statValue: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: FontSizes.base, fontWeight: '700', color: Colors.textPrimary },
  bars: { height: 96, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 10, color: Colors.textMuted },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  topRank: { width: 18, fontSize: FontSizes.sm, fontWeight: '700', color: Colors.textMuted },
  topText: { flex: 1, gap: 4 },
  topTitle: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textPrimary },
  topTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.track, overflow: 'hidden' },
  topFill: { height: '100%', backgroundColor: Colors.primary },
  topValue: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between' },
  reportValue: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.textPrimary },
  muted: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  footnote: { fontSize: FontSizes.xs, color: Colors.textMuted, textAlign: 'center' },
});
