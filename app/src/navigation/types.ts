/**
 * Navigation type definitions.
 *
 * Every tab hosts its own stack; the screens a user can reach from any tab
 * (details, player, chapters, generation status, playlists) are shared so a
 * flow never has to jump tabs to continue.
 */

import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Splash: undefined;
  LanguageSelect: undefined;
  NotificationsPrompt: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  /** Sign-up step 2: the emailed code. */
  VerifyEmail: { signup: import('../types/auth').RegisterRequest; resendAfter?: number; devCode?: string };
  Terms: undefined;
};

/** Screens registered in every tab stack. */
export type SharedStackParamList = {
  /** Terms of Service and Privacy Policy. */
  Terms: undefined;
  /** Change favourite genres and channels. */
  EditFavourites: undefined;
  /** Opening a book plays it; without an id the player shows what is loaded. */
  Player: { audiobookId?: string } | undefined;
  GenerationStatus: { audiobookId: string };
  PlaylistDetails: { playlistId: string; name: string };
  Notifications: undefined;
  /** A channel's public page: follow, bell, playlists and audiobooks. */
  ChannelProfile: { channelId: string };
};

export type HomeStackParamList = SharedStackParamList & {
  Home: undefined;
};

export type ExploreStackParamList = SharedStackParamList & {
  Explore: undefined;
  SearchResults: { query?: string; genre?: string };
};

export type LibraryStackParamList = SharedStackParamList & {
  Library: undefined;
};

export type CreateStackParamList = SharedStackParamList & {
  CreateAudiobook: undefined;
  UploadSource: { audiobookId: string; title: string };
};

export type ProfileStackParamList = SharedStackParamList & {
  Profile: undefined;
  Subscription: undefined;
  PaymentCheckout: { orderId: string };
  Publisher: undefined;
  Channel: { channelId: string };
  MyAudiobooks: undefined;
  EditAudiobook: { audiobookId: string };
  /** Moderation notices, strikes and appeals. */
  AccountStatus: undefined;
  /** Running and past appeals. */
  Appeals: undefined;
  /** Completed payments; each opens its details and invoice. */
  PaymentHistory: undefined;
  PaymentDetails: { orderId: string };
  /** The publisher's channel dashboard. */
  PublisherAnalytics: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  ExploreTab: NavigatorScreenParams<ExploreStackParamList>;
  LibraryTab: NavigatorScreenParams<LibraryStackParamList>;
  CreateTab: NavigatorScreenParams<CreateStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};
