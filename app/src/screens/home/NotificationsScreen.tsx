/**
 * NotificationsScreen — the user's inbox, grouped into Today / Earlier. Each
 * item shows an icon for its kind; unread items carry a dot and bold title.
 * Tapping an item marks it read and opens the screen it refers to. Shows a
 * banner when OS notifications are off.
 */

import React from 'react';
import { Linking, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { StateView } from '../../components/StateView';
import { AppNotification, notificationsApi } from '../../api/notifications';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { openNotificationTarget } from '../../navigation/navigationRef';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Icon and tint for a notification kind ("payment.success", "publisher.rejected", ...). */
function appearance(kind: string): { icon: IconName; color: string; background: string } {
  const negative = /(failed|rejected|restrict|suspend|cancel)/.test(kind);
  if (negative) return { icon: 'alert-circle-outline', color: Colors.tintErrorText, background: Colors.tintError };
  if (kind.startsWith('payment')) return { icon: 'card-outline', color: Colors.tintGreenText, background: Colors.tintGreen };
  if (kind.startsWith('generation')) return { icon: 'headset-outline', color: Colors.primary, background: Colors.primarySurface };
  if (kind.startsWith('publisher')) return { icon: 'ribbon-outline', color: Colors.tintPurpleText, background: Colors.tintPurple };
  if (kind.startsWith('withdrawal')) return { icon: 'wallet-outline', color: Colors.tintBlueText, background: Colors.tintBlue };
  if (kind.startsWith('moderation')) return { icon: 'shield-checkmark-outline', color: Colors.tintAmberText, background: Colors.tintAmber };
  return { icon: 'notifications-outline', color: Colors.primary, background: Colors.primarySurface };
}

function timeAgo(iso: string, english: boolean): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return english ? 'Just now' : 'এইমাত্র';
  if (minutes < 60) return english ? `${minutes} min ago` : `${minutes} মিনিট আগে`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return english ? `${hours} h ago` : `${hours} ঘণ্টা আগে`;
  const days = Math.round(hours / 24);
  if (days < 7) return english ? `${days} d ago` : `${days} দিন আগে`;
  return new Date(iso).toLocaleDateString(english ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function NotificationsScreen() {
  const { navigation } = useAppNavigation();
  const { tx, isEnglish } = useLanguage();
  const { permission, requestPermission, setUnreadCount } = useNotifications();
  const inbox = useResource(() => notificationsApi.list());

  const items = inbox.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  const sections = [
    { title: tx('আজ', 'Today'), data: items.filter((n) => isToday(n.created_at)) },
    { title: tx('আগের', 'Earlier'), data: items.filter((n) => !isToday(n.created_at)) },
  ].filter((s) => s.data.length);

  const open = (item: AppNotification) => {
    if (!item.read_at) {
      inbox.setData((current) =>
        (current ?? []).map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      notificationsApi.markRead(item.id).catch(() => {});
      setUnreadCount(Math.max(0, unread - 1));
    }
    openNotificationTarget({ ...item.data, kind: item.kind });
  };

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => {});
    setUnreadCount(0);
    inbox.setData((current) => (current ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const enable = async () => {
    const granted = await requestPermission();
    if (!granted) Linking.openSettings();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('নোটিফিকেশন', 'Notifications')}
        subtitle={unread ? tx(`${unread}টি অপঠিত`, `${unread} unread`) : undefined}
        onBack={() => navigation.goBack()}
        rightActionText={unread ? tx('সব পঠিত', 'Mark all read') : undefined}
        onRightAction={unread ? markAll : undefined}
      />

      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={inbox.isRefreshing} onRefresh={inbox.refresh} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          permission !== 'granted' ? (
            <View style={styles.banner}>
              <Ionicons name="notifications-off-outline" size={22} color={Colors.primary} />
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>{tx('নোটিফিকেশন বন্ধ আছে', 'Notifications are off')}</Text>
                <Text style={styles.bannerBody}>
                  {tx(
                    'অডিওবুক তৈরি শেষ হলে বা পেমেন্ট সফল হলে জানতে চালু করুন।',
                    'Turn them on to hear when an audiobook is ready or a payment succeeds.',
                  )}
                </Text>
              </View>
              <Pressable onPress={enable} hitSlop={8} accessibilityRole="button">
                <Text style={styles.bannerAction}>{tx('চালু করুন', 'Turn on')}</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        ListEmptyComponent={
          inbox.isLoading ? (
            <StateView kind="loading" />
          ) : inbox.error ? (
            <StateView kind="error" message={inbox.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={inbox.reload} />
          ) : (
            <StateView
              kind="empty"
              title={tx('কোনো নোটিফিকেশন নেই', 'You are all caught up')}
              message={tx('গুরুত্বপূর্ণ আপডেট এখানে দেখা যাবে।', 'Important updates will show up here.')}
            />
          )
        }
        renderItem={({ item, index, section }) => {
          const look = appearance(item.kind);
          const isUnread = !item.read_at;
          return (
            <Pressable
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.item,
                index === 0 && styles.itemFirst,
                index === section.data.length - 1 && styles.itemLast,
                isUnread && styles.itemUnread,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${isUnread ? tx('অপঠিত: ', 'Unread: ') : ''}${item.title}`}
            >
              <View style={[styles.iconBox, { backgroundColor: look.background }]}>
                <Ionicons name={look.icon} size={20} color={look.color} />
              </View>
              <View style={styles.itemText}>
                <View style={styles.titleRow}>
                  <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {isUnread ? <View style={styles.dot} /> : null}
                </View>
                {item.body ? (
                  <Text style={styles.itemBody} numberOfLines={3}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={styles.itemTime}>{timeAgo(item.created_at, isEnglish)}</Text>
              </View>
            </Pressable>
          );
        }}
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bannerBody: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  bannerAction: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceBorder,
  },
  itemFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
  },
  itemLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
  },
  itemUnread: {
    backgroundColor: '#FAFEFC',
  },
  pressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  itemTitleUnread: {
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 7,
  },
  itemBody: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  itemTime: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
