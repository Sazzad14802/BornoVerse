/**
 * ProfileScreen — account overview and settings hub:
 * identity, membership / publisher status, and entry points to subscription,
 * publisher workspace, own audiobooks, language, notifications and sign-out.
 */

import React, { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { TagBadge } from '../../components/TagBadge';
import { ListRow } from '../../components/ListRow';
import { ChipGroup } from '../../components/Chip';
import { Field, FormCard } from '../../components/Form';
import { ModalBottomSheet } from '../../components/ModalBottomSheet';
import { profileApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { offline } from '../../storage/offline';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { AppLanguage } from '../../storage/languageStorage';
import { isActivePublisher, isPremium } from '../../types/auth';
import { formatDate } from '../../utils/format';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

export function ProfileScreen() {
  const { navigation } = useAppNavigation();
  const { user, refreshUser, logout, setUser } = useAuth();
  const { t, tx, language, setLanguage, isEnglish } = useLanguage();
  const { permission, requestPermission, unreadCount } = useNotifications();
  const { stop } = usePlayer();

  const [refreshing, setRefreshing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  const isPublisher = isActivePublisher(user);
  const premium = isPremium(user);
  const displayName = user.full_name || user.username;

  const publisherStatus: Record<string, string> = {
    none: tx('প্রকাশক হোন', 'Become a publisher'),
    pending_approval: tx('যাচাই অপেক্ষমাণ', 'Verification pending'),
    approved_pending_payment: tx('ফি পরিশোধ বাকি', 'Fee payment pending'),
    active: tx('সক্রিয়', 'Active'),
    rejected: tx('আবেদন বাতিল', 'Application rejected'),
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      setUser(await profileApi.update(name.trim()));
      setEditingName(false);
    } catch (error) {
      Alert.alert(tx('সংরক্ষণ হয়নি', 'Not saved'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const notificationsRow = async () => {
    if (permission === 'granted') {
      Linking.openSettings();
      return;
    }
    const granted = await requestPermission();
    if (!granted) Linking.openSettings();
  };

  const signOut = () =>
    Alert.alert(t('logoutConfirmTitle'), t('logoutConfirmMessage'), [
      { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
      {
        text: tx('সাইন আউট', 'Sign out'),
        style: 'destructive',
        onPress: async () => {
          await stop();
          await offline.clear(user.id).catch(() => {});
          await logout();
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('profileTitle')}
        subtitle={isPublisher ? tx('যাচাইকৃত প্রকাশক', 'Verified publisher') : tx('সদস্য', 'Member')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarChar}>{Array.from(displayName)[0]?.toUpperCase()}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <View style={styles.badgeRow}>
              <TagBadge label={premium ? tx('প্রিমিয়াম', 'PREMIUM') : tx('ফ্রি', 'FREE')} variant={premium ? 'premium' : 'free'} />
              {isPublisher ? <TagBadge label={tx('প্রকাশক', 'PUBLISHER')} variant="genre" /> : null}
            </View>
          </View>
        </View>

        <View style={[styles.highlightCard, premium && styles.premiumCard]}>
            <Text style={styles.highlightTitle}>{premium ? tx('প্রিমিয়াম সক্রিয়', 'Premium is active') : tx('প্রিমিয়ামে আপগ্রেড করুন', 'Upgrade to Premium')}</Text>
            <Text style={styles.highlightText}>
              {premium
                ? tx(`মেয়াদ: ${formatDate(user.premium_until, false)}`, `Valid until ${formatDate(user.premium_until, true)}`)
                : tx('প্রিমিয়াম অডিওবুক, অফলাইন ডাউনলোড ও বেশি অডিও তৈরির সুযোগ।', 'Premium audiobooks, offline downloads and more generations.')}
            </Text>
            <AppButton
              label={premium ? tx('পরিচালনা', 'Manage') : tx('প্ল্যান দেখুন', 'See plans')}
              onPress={() => navigation.navigate('Subscription')}
              variant="compact"
              fullWidth={false}
            />
          </View>

        <FormCard style={styles.menu}>
          <ListRow icon="headset-outline" title={tx('আমার অডিওবুক', 'My audiobooks')} subtitle={tx('তৈরি ও সম্পাদনা', 'Created & edit')} onPress={() => navigation.navigate('MyAudiobooks')} />
          <ListRow
            icon="mic-outline"
            title={isPublisher ? tx('প্রকাশক স্টুডিও', 'Publisher studio') : tx('প্রকাশক হোন', 'Become a publisher')}
            subtitle={
              isPublisher
                ? tx('চ্যানেল, আয় ও উত্তোলন', 'Channels, earnings & withdrawals')
                : user.publisher_status === 'none'
                  ? tx('চ্যানেল খুলে অডিওবুক প্রকাশ করুন', 'Open a channel and publish audiobooks')
                  : publisherStatus[user.publisher_status] ?? user.publisher_status
            }
            onPress={() => navigation.navigate('Publisher')}
          />
          <ListRow
            icon="notifications-outline"
            title={tx('নোটিফিকেশন', 'Notifications')}
            value={unreadCount ? tx(`${unreadCount}টি নতুন`, `${unreadCount} new`) : undefined}
            onPress={() => navigation.navigate('Notifications')}
          />
          <ListRow icon="receipt-outline" title={tx('পেমেন্ট ইতিহাস', 'Payment history')} onPress={() => navigation.navigate('Subscription')} />
          <ListRow icon="create-outline" title={tx('নাম পরিবর্তন', 'Edit name')} value={displayName} onPress={() => setEditingName(true)} last />
        </FormCard>

        <FormCard style={styles.menu}>
          <Text style={styles.groupLabel}>{tx('অ্যাপের ভাষা', 'App language')}</Text>
          <ChipGroup<AppLanguage>
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'bn', label: 'বাংলা' },
              { value: 'en', label: 'English' },
              { value: 'mixed', label: 'বাংলা + English' },
            ]}
          />
          <ListRow
            icon="phone-portrait-outline"
            title={tx('পুশ নোটিফিকেশন', 'Push notifications')}
            subtitle={
              permission === 'granted'
                ? tx('চালু আছে · সেটিংসে বদলাতে চাপুন', 'On · tap to change in settings')
                : tx('বন্ধ · চালু করতে চাপুন', 'Off · tap to turn on')
            }
            onPress={notificationsRow}
            last
          />
        </FormCard>

        <FormCard style={styles.menu}>
          <ListRow icon="log-out-outline" title={tx('সাইন আউট', 'Sign out')} onPress={signOut} destructive last />
        </FormCard>

        <Text style={styles.version}>
          BornoVerse {Constants.expoConfig?.version ?? ''} · {isEnglish ? 'Member since' : 'সদস্য'} {formatDate(user.created_at, isEnglish)}
        </Text>
      </ScrollView>

      <ModalBottomSheet visible={editingName} onClose={() => setEditingName(false)}>
        <View style={styles.sheet}>
          <Field label={tx('পুরো নাম', 'Full name')} value={name} onChangeText={setName} maxLength={150} autoFocus />
          <AppButton label={tx('সংরক্ষণ', 'Save')} onPress={saveName} isLoading={saving} disabled={!name.trim()} />
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChar: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  userMeta: {
    flex: 1,
    gap: 3,
  },
  userName: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  userEmail: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: 4,
  },
  highlightCard: {
    backgroundColor: Colors.tintBrand,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  premiumCard: {
    backgroundColor: Colors.tintPurple,
  },
  highlightTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  highlightText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  menu: {
    paddingVertical: Spacing.xs,
    gap: 0,
  },
  groupLabel: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  version: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  sheet: {
    gap: Spacing.md,
  },
});
