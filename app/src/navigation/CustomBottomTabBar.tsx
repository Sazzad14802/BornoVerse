/**
 * CustomBottomTabBar — five tabs (Home, Search, Your Library, Create, Profile),
 * each an icon above its label: filled when active, outlined otherwise.
 * Hosts the persistent mini-player right above it.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersistentMiniPlayer } from '../components/PersistentMiniPlayer';
import { useKeyboardHeight } from '../components/KeyboardInset';
import { Colors, Spacing } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { icon: IconName; activeIcon: IconName }> = {
  HomeTab: { icon: 'home-outline', activeIcon: 'home' },
  ExploreTab: { icon: 'search-outline', activeIcon: 'search' },
  LibraryTab: { icon: 'library-outline', activeIcon: 'library' },
  CreateTab: { icon: 'add-circle-outline', activeIcon: 'add-circle' },
  ProfileTab: { icon: 'person-outline', activeIcon: 'person' },
};

export function CustomBottomTabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();

  const getTabLabel = (routeName: string) => {
    switch (routeName) {
      case 'HomeTab':
        return t('tabHome');
      case 'ExploreTab':
        return t('tabExplore');
      case 'LibraryTab':
        return t('tabLibrary');
      case 'CreateTab':
        return t('tabCreate');
      case 'ProfileTab':
        return t('tabProfile');
      default:
        return routeName;
    }
  };

  // The mini player is redundant on the full-screen player of the focused tab.
  const currentRoute = state.routes[state.index];
  const focusedScreen = getFocusedRouteNameFromRoute(currentRoute);
  const hideMiniPlayer = focusedScreen === 'Player';

  // While typing, the keyboard owns the bottom of the screen.
  if (keyboard > 0) return null;

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
      {/* Persistent Mini-Player Pinned Above Tabs */}
      {!hideMiniPlayer && (
        <PersistentMiniPlayer
          onPress={(audiobookId) => navigation.navigate(currentRoute.name, { screen: 'Player', params: { audiobookId } } as any)}
        />
      )}

      {/* 5-Tab Bar */}
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const icons = TAB_ICONS[route.name] ?? { icon: 'ellipse-outline', activeIcon: 'ellipse' };
          const color = isFocused ? Colors.textPrimary : Colors.textSecondary;
          const label = getTabLabel(route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                pressed && styles.tabItemPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
            >
              <Ionicons name={isFocused ? icons.activeIcon : icons.icon} size={24} color={color} />
              <Text
                style={[styles.tabLabel, { color }, isFocused && styles.tabLabelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.xs,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  tabItemPressed: {
    opacity: 0.6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
