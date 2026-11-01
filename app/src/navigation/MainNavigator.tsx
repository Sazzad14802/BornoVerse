/**
 * MainNavigator — five tabs, each with its own stack, a custom tab bar and a
 * docked mini player. Shared routes are registered in every stack (Template
 * Method: `withSharedScreens` adds them to each navigator).
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  CreateStackParamList,
  ExploreStackParamList,
  HomeStackParamList,
  LibraryStackParamList,
  MainTabParamList,
  ProfileStackParamList,
} from './types';
import { Colors } from '../theme';
import { CustomBottomTabBar } from './CustomBottomTabBar';

import { HomeScreen } from '../screens/home/HomeScreen';
import { NotificationsScreen } from '../screens/home/NotificationsScreen';
import { ExploreScreen } from '../screens/explore/ExploreScreen';
import { SearchResultsScreen } from '../screens/explore/SearchResultsScreen';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { PlaylistDetailsScreen } from '../screens/library/PlaylistDetailsScreen';
import { CreateAudiobookScreen } from '../screens/create/CreateAudiobookScreen';
import { UploadSourceScreen } from '../screens/create/UploadSourceScreen';
import { GenerationStatusScreen } from '../screens/create/GenerationStatusScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { SubscriptionScreen } from '../screens/profile/SubscriptionScreen';
import { PaymentCheckoutScreen } from '../screens/profile/PaymentCheckoutScreen';
import { PublisherScreen } from '../screens/profile/PublisherScreen';
import { ChannelScreen } from '../screens/profile/ChannelScreen';
import { MyAudiobooksScreen } from '../screens/profile/MyAudiobooksScreen';
import { EditAudiobookScreen } from '../screens/profile/EditAudiobookScreen';
import { AccountStatusScreen } from '../screens/profile/AccountStatusScreen';
import { PlayerScreen } from '../screens/audiobook/PlayerScreen';
import { ChannelProfileScreen } from '../screens/channel/ChannelProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.background },
};

function withSharedScreens(Stack: any) {
  return (
    <>
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="GenerationStatus" component={GenerationStatusScreen} />
      <Stack.Screen name="PlaylistDetails" component={PlaylistDetailsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ChannelProfile" component={ChannelProfileScreen} />
    </>
  );
}

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      {withSharedScreens(HomeStack)}
    </HomeStack.Navigator>
  );
}

const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();
function ExploreStackNavigator() {
  return (
    <ExploreStack.Navigator screenOptions={stackScreenOptions}>
      <ExploreStack.Screen name="Explore" component={ExploreScreen} />
      <ExploreStack.Screen name="SearchResults" component={SearchResultsScreen} />
      {withSharedScreens(ExploreStack)}
    </ExploreStack.Navigator>
  );
}

const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
function LibraryStackNavigator() {
  return (
    <LibraryStack.Navigator screenOptions={stackScreenOptions}>
      <LibraryStack.Screen name="Library" component={LibraryScreen} />
      {withSharedScreens(LibraryStack)}
    </LibraryStack.Navigator>
  );
}

const CreateStack = createNativeStackNavigator<CreateStackParamList>();
function CreateStackNavigator() {
  return (
    <CreateStack.Navigator screenOptions={stackScreenOptions}>
      <CreateStack.Screen name="CreateAudiobook" component={CreateAudiobookScreen} />
      <CreateStack.Screen name="UploadSource" component={UploadSourceScreen} />
      {withSharedScreens(CreateStack)}
    </CreateStack.Navigator>
  );
}

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Subscription" component={SubscriptionScreen} />
      <ProfileStack.Screen name="PaymentCheckout" component={PaymentCheckoutScreen} />
      <ProfileStack.Screen name="Publisher" component={PublisherScreen} />
      <ProfileStack.Screen name="Channel" component={ChannelScreen} />
      <ProfileStack.Screen name="MyAudiobooks" component={MyAudiobooksScreen} />
      <ProfileStack.Screen name="EditAudiobook" component={EditAudiobookScreen} />
      <ProfileStack.Screen name="AccountStatus" component={AccountStatusScreen} />
      {withSharedScreens(ProfileStack)}
    </ProfileStack.Navigator>
  );
}

export function MainNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomBottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
      <Tab.Screen name="ExploreTab" component={ExploreStackNavigator} />
      <Tab.Screen name="LibraryTab" component={LibraryStackNavigator} />
      <Tab.Screen name="CreateTab" component={CreateStackNavigator} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
}
