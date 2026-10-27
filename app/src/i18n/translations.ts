/**
 * Application Localization Dictionaries.
 *
 * Design Pattern:
 * - Strategy Pattern: Pluggable translation dictionary strategies (bn, en, mixed).
 * - Key-Value Mapping with Parametric Interpolation support.
 */

export const enTranslations = {
  // Brand & Identity
  appName: 'BornoVerse',
  appTagline: 'A Universe Worth Listening To.',
  splashBadge: 'Listen · Save · Create',
  editorialPick: "BORNOVERSE EDITOR'S PICK",

  // Bottom Navigation Tabs
  tabHome: 'Home',
  tabExplore: 'Search',
  tabLibrary: 'Your Library',
  tabCreate: 'Create',
  tabProfile: 'Profile',

  // Onboarding
  btnNext: 'Next',
  btnGetStarted: 'Get Started',
  btnContinue: 'Continue',

  // Language Selection
  langSelectTitle: 'Choose Language',
  langSelectSub: 'Bangla-first or English',
  langOptionBnTitle: 'বাংলা (Bangla)',
  langOptionBnSub: 'Bangla interface · বাংলা UI',
  langOptionEnTitle: 'English',
  langOptionEnSub: 'English interface · All screens in English',
  langOptionMixedTitle: 'বাংলা + English',
  langOptionMixedSub: 'Bilingual labels · মিশ্র ইন্টারফেস',

  // Notifications Prompt
  notifTitle: 'Stay Updated',
  notifSub: 'New chapter drops, recommendations, and releases',
  notifDesc: 'Get timely alerts when new chapters are generated or when authors publish audiobooks.',
  notifAllow: 'Allow Notifications',
  notifSkip: 'Skip for Now',

  // Authentication & Account
  authHeaderTitle: 'Account Access',
  authHeaderSub: 'Sign in / Sign up / Google',
  tabSignIn: 'Sign In',
  tabSignUp: 'Sign Up',
  fieldNameLabel: 'Name',
  fieldNameOptional: 'Name · Sign up only',
  fieldNamePlaceholder: 'Your full name (e.g. Saleh)',
  fieldEmailLabel: 'Email',
  fieldEmailPlaceholder: 'your.email@example.com',
  fieldPasswordLabel: 'Password',
  fieldPasswordPlaceholder: 'At least 6 characters',
  btnSigningIn: 'Signing in...',
  btnCreatingAccount: 'Creating account...',
  btnGoogleSignIn: 'Continue with Google',
  forgotPasswordLink: 'Forgot password?',
  offlineDemoBypass: 'Enter offline demo mode',
  noticeTitle: 'Notice',
  successTitle: 'Success',
  accCreatedSuccess: 'Account created successfully!',
  signedInSuccess: 'Signed in successfully!',

  // Home Screen
  greetingEvening: 'Good Evening, {name}',
  greetingMorning: 'Good Morning, {name}',
  greetingAfternoon: 'Good Afternoon, {name}',
  greetingQuestion: 'What would you like to listen to today?',
  continueListeningSection: 'Continue Listening',
  editorsPickMeta: "Editor's Pick · 8h 42m",
  freeBadge: 'FREE',
  premiumBadge: 'PREMIUM',

  // Explore & Search
  exploreTitle: 'Explore',
  exploreSub: 'All genres, authors & collections',
  searchPlaceholder: 'Search by book title, author, or keyword...',
  filterAll: 'All',
  filterBangla: 'Bangla',
  filterEnglish: 'English',
  filterFree: 'Free',
  filterPremium: 'Premium',
  browseByGenre: 'Browse by Genre',
  popularCollections: 'Popular Collections',
  topCharts: 'Top Charts',
  noResultsFound: 'No audiobooks found matching your search.',

  // Audiobook Details
  btnStartListening: 'Start Listening',
  btnResumeListening: 'Resume Listening',
  sectionChapters: 'Chapters',
  sectionDescription: 'Synopsis',
  sectionAuthor: 'Author Information',
  reportCopyright: 'Report Copyright Infringement',
  totalDuration: 'Total Duration',
  languageLabel: 'Language',
  accessLabel: 'Access',

  // Player & Queue
  playerNowPlaying: 'Now Playing',
  playerQueue: 'Chapters Queue',
  speedLabel: 'Speed',
  addToLibrary: 'Add to Library',
  inLibrary: 'In Library',

  // Create Screen
  createTitle: 'Create Audiobook',
  createSub: 'PDF & Text to Voice',
  inputBookTitle: 'Book Title',
  inputBookTitlePlaceholder: 'Enter title (e.g. Nakshi Kanthar Math)',
  inputAuthorName: 'Author Name',
  inputAuthorPlaceholder: 'Author name (e.g. Jasimuddin)',
  languageSelectChoice: 'Voice Narration Language',
  visibilityChoice: 'Visibility',
  visibilityPublic: 'Public (Catalog)',
  visibilityPrivate: 'Private (Only Me)',
  monthlyQuota: 'Monthly Generation Quota: 1/3 Used',
  btnUploadSource: 'Select Source File (PDF / TXT)',
  btnGenerateAudiobook: 'Generate Audiobook',

  // Library Screen
  libraryTitle: 'My Library',
  librarySub: 'Saved & Generated Audiobooks',
  tabSaved: 'Saved',
  tabDownloaded: 'Downloaded',
  tabMyCreated: 'Created by Me',
  noSavedBooks: 'No saved audiobooks yet. Explore and save your favorites!',
  noDownloadedBooks: 'No downloaded audiobooks for offline listening.',
  noCreatedBooks: 'You have not generated any audiobooks yet.',

  // Profile & Settings
  profileTitle: 'Profile & Settings',
  profileSub: 'User Account & Ecosystem',
  subscriptionSection: 'Subscription Plan',
  upgradeToPremium: 'Upgrade to Premium (৳199/month)',
  publisherProgram: 'Publisher Program',
  publisherApply: 'Apply as Publisher',
  publisherManage: 'Manage Channel',
  appLanguageSection: 'App Interface Language',
  copyrightPolicySection: 'Copyright & Intellectual Property',
  copyrightPolicyDesc:
    'BornoVerse safeguards the intellectual property rights of all authors and publishers. You can report any copyright infringement directly from any audiobook page.',
  btnLogout: 'Log Out',
  logoutConfirmTitle: 'Log Out',
  logoutConfirmMessage: 'Are you sure you want to log out?',
  btnCancel: 'Cancel',

  // Modals & Bottom Sheets
  filterSortModalTitle: 'Filter & Sort',
  playbackSettingsTitle: 'Playback Settings',
  copyrightReportTitle: 'Report Copyright Infringement',
  paymentModalTitle: 'Upgrade to Premium',
  paymentModalSub: '৳199/month · Unlimited listening & offline cache',
  publisherFormTitle: 'Publisher Application',
  publisherFormSub: 'Submit Trade License, NID and catalog credentials',
  btnSubmitApplication: 'Submit Application',
  btnCompletePayment: 'Complete Payment (bKash / Card)',

  // Forgot Password Screen
  forgotHeaderTitle: 'Forgot, Verify & Reset',
  forgotHeaderSub: 'Complete recovery path',
  forgotStepEmail: 'Email',
  forgotStepVerify: 'Verify',
  forgotStepReset: 'Reset',
  forgotStepSuccess: 'Success',
  forgotEmailLabel: 'Forgot password email',
  forgotVerifyCodeLabel: '6-digit verification',
  forgotNewPasswordLabel: 'New password',
  forgotBannerTitle: 'Email sent · code verified',
  forgotBannerSub: 'Reset link 15 minutes valid · resend in 00:42',
  btnChangePassword: 'Change Password',
  forgotSuccessTitle: 'Success',
  forgotSuccessSub: 'Password updated · other sessions signed out',

  // Chapters & Queue Screen
  chaptersQueueSub: '{count} chapters · {next} up next',
  upNextSection: 'Up next',
  reorderClearQueue: 'Reorder / Clear Queue',
  queueOptionsTitle: 'Queue Options',
  queueOptionsMessage: 'Would you like to reorder or clear queued audiobooks?',
  btnClearQueue: 'Clear Queue',
  btnOk: 'OK',

  // Search Results & Discovery
  searchResultsTitle: 'Search Results',
  searchResultsSub: 'Suggestions · history · results',
  searchSuggestions: 'Suggestions',
  recentHistory: 'Recent History',
  filterSortBtn: 'Filter · 3 / Sort',
  filterModalHeading: 'Filter & Sort',
  filterSectionTitle: 'Language · Access · Length',
  sortForYou: 'Sort: For you',
  sortOptionsSub: 'New · Most listened · Rating · Duration',
  btnViewResults: 'View 24 Results',

  // Discovery States Screen
  discoveryTitle: 'Discovery States',
  discoverySub: 'Loading · no results · offline · error',
  noResultsTitle: 'No results',
  noResultsHint: 'Check spelling or remove filters',
  offlineTitle: 'Offline',
  offlineHint: 'Only downloaded audiobooks available',
  errorTitle: 'Error',
  errorHint: 'Query preserved · Retry',
  btnRetry: 'Retry',

  // Upload Source & Generation Pipeline
  uploadPdfTitle: 'Upload PDF',
  uploadPdfSub: 'Source file selection & AI processing',
  pickPdfPrompt: 'Select a PDF File',
  pickPdfSub: 'Select a Bangla or English book from device',
  tapToChange: 'Tap to change',
  fileRequiredAlert: 'File required: Please select a PDF file first.',
  processingPipelineFeatures: 'Processing Pipeline Features',
  pipelineFeature1: 'Specialized Bangla OCR for printed and scanned text',
  pipelineFeature2: 'Sentence tokenization and punctuation normalization',
  pipelineFeature3: 'Natural Bengali expressive speech synthesis (Bangla VITS Engine)',
  pipelineFeature4: 'Automatic chapter splitting and time-alignment',
  btnStartGeneration: 'Start Audiobook Generation',
  genProgressTitle: 'Generation Progress',
  genProgressSub: 'AI Audiobook Pipeline',
  statusCompleted: 'Audiobook Generated Successfully!',
  statusInProgress: 'Synthesizing Audio via AI Engine',
  pipelineStepsHeading: 'Pipeline Steps',
  stepPdfUploaded: 'PDF upload completed',
  stepTextOcr: 'Text extraction & OCR',
  stepQueued: 'Queued in pipeline (Priority: High, Position: #{pos})',
  stepSpeechSynthesis: 'Bangla AI speech synthesis (TTS)',
  stepGenDone: 'Audiobook generation complete',
  btnListenAudiobook: 'Listen to audiobook',

  // Register Screen
  registerTitle: 'Create Account',
  fieldUsername: 'Username',
  fieldConfirmPassword: 'Confirm Password',
  btnCreateAccount: 'Create Account',
  alreadyHaveAccount: 'Already have an account?',
  linkLogIn: 'Log In',
};

export type TranslationKey = keyof typeof enTranslations;

export const bnTranslations: Record<TranslationKey, string> = {
  // Brand & Identity
  appName: 'BornoVerse',
  appTagline: 'A Universe Worth Listening To.',
  splashBadge: 'শুনুন · সংরক্ষণ করুন · তৈরি করুন',
  editorialPick: "BornoVerse এডিটর্স চয়েস",

  // Bottom Navigation Tabs
  tabHome: 'হোম',
  tabExplore: 'খুঁজুন',
  tabLibrary: 'লাইব্রেরি',
  tabCreate: 'তৈরি',
  tabProfile: 'প্রোফাইল',

  // Onboarding
  btnNext: 'পরবর্তী',
  btnGetStarted: 'শুরু করুন',
  btnContinue: 'চালিয়ে যান',

  // Language Selection
  langSelectTitle: 'ভাষা বেছে নিন',
  langSelectSub: 'বাংলা অথবা ইংরেজি ইন্টারফেস',
  langOptionBnTitle: 'বাংলা',
  langOptionBnSub: 'বাংলা ইন্টারফেস · সকল স্ক্রিন বাংলায়',
  langOptionEnTitle: 'English',
  langOptionEnSub: 'English interface · সম্পূর্ণ অ্যাপ ইংরেজিতে',
  langOptionMixedTitle: 'বাংলা + English',
  langOptionMixedSub: 'মিশ্র লেবেল · Bilingual labels',

  // Notifications Prompt
  notifTitle: 'আপডেট থাকুন',
  notifSub: 'নতুন অধ্যায়, রিলিজ ও কিউরেটেড কালেকশন',
  notifDesc: 'নতুন কোনো বই প্রকাশিত হলে বা আপনার অডিওবুক রূপান্তর সম্পন্ন হলে তাৎক্ষণিক নোটিফিকেশন পান।',
  notifAllow: 'অনুমতি দিন',
  notifSkip: 'পরে করব',

  // Authentication & Account
  authHeaderTitle: 'অ্যাকাউন্টে প্রবেশ',
  authHeaderSub: 'Sign in / Sign up / Google',
  tabSignIn: 'Sign In',
  tabSignUp: 'Sign Up',
  fieldNameLabel: 'নাম',
  fieldNameOptional: 'নাম · Sign up only',
  fieldNamePlaceholder: 'আপনার পূর্ণ নাম (যেমন: সাদিদ)',
  fieldEmailLabel: 'ইমেইল',
  fieldEmailPlaceholder: 'your.email@example.com',
  fieldPasswordLabel: 'পাসওয়ার্ড',
  fieldPasswordPlaceholder: 'কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড',
  btnSigningIn: 'লগইন হচ্ছে...',
  btnCreatingAccount: 'তৈরি হচ্ছে...',
  btnGoogleSignIn: 'Google দিয়ে চালিয়ে যান',
  forgotPasswordLink: 'পাসওয়ার্ড ভুলে গেছেন?',
  offlineDemoBypass: 'ডেমো মোডে প্রবেশ করুন',
  noticeTitle: 'নোটিশ',
  successTitle: 'অভিনন্দন',
  accCreatedSuccess: 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!',
  signedInSuccess: 'সফলভাবে সাইন ইন হয়েছে!',

  // Home Screen
  greetingEvening: 'শুভ সন্ধ্যা, {name}',
  greetingMorning: 'শুভ সকাল, {name}',
  greetingAfternoon: 'শুভ দুপুর, {name}',
  greetingQuestion: 'আজ কী শুনবেন?',
  continueListeningSection: 'শোনা চালিয়ে যান',
  editorsPickMeta: "এডিটর্স চয়েস · ৮ঘণ্টা ৪২মি",
  freeBadge: 'ফ্রি',
  premiumBadge: 'প্রিমিয়াম',

  // Explore & Search
  exploreTitle: 'খুঁজুন',
  exploreSub: 'সকল জনরা ও লেখক',
  searchPlaceholder: 'বইয়ের নাম, লেখক বা বিষয় লিখুন...',
  filterAll: 'সকল',
  filterBangla: 'বাংলা',
  filterEnglish: 'English',
  filterFree: 'ফ্রি',
  filterPremium: 'প্রিমিয়াম',
  browseByGenre: 'জনরা অনুযায়ী খুঁজুন',
  popularCollections: 'জনপ্রিয় কালেকশন',
  topCharts: 'শীর্ষ তালিকা',
  noResultsFound: 'কোনো অডিওবুক পাওয়া যায়নি।',

  // Audiobook Details
  btnStartListening: 'শুরু করুন',
  btnResumeListening: 'চালিয়ে যান',
  sectionChapters: 'অধ্যায়সমূহ',
  sectionDescription: 'সারসংক্ষেপ',
  sectionAuthor: 'লেখক পরিচিতি',
  reportCopyright: 'কপিরাইট লঙ্ঘন রিপোর্ট করুন',
  totalDuration: 'মোট সময়কাল',
  languageLabel: 'ভাষা',
  accessLabel: 'অ্যাক্সেস',

  // Player & Queue
  playerNowPlaying: 'এখন বাজছে',
  playerQueue: 'অধ্যায় তালিকা',
  speedLabel: 'গতি',
  addToLibrary: 'লাইব্রেরিতে যুক্ত করুন',
  inLibrary: 'লাইব্রেরিতে আছে',

  // Create Screen
  createTitle: 'নতুন অডিওবুক তৈরি',
  createSub: 'PDF থেকে কণ্ঠস্বর',
  inputBookTitle: 'বইয়ের শিরোনাম',
  inputBookTitlePlaceholder: 'বইয়ের নাম লিখুন (যেমন: নকশী কাঁথার মাঠ)',
  inputAuthorName: 'লেখকের নাম',
  inputAuthorPlaceholder: 'লেখকের নাম লিখুন (যেমন: জসীমউদ্দীন)',
  languageSelectChoice: 'ভয়েস ন্যারেশন ভাষা',
  visibilityChoice: 'দৃশ্যমানতা',
  visibilityPublic: 'পাবলিক (সকলের জন্য উন্মুক্ত)',
  visibilityPrivate: 'প্রাইভেট (শুধুমাত্র আমার জন্য)',
  monthlyQuota: 'মাসিক তৈরির কোটা: ১/৩ ব্যবহৃত',
  btnUploadSource: 'উৎস ফাইল সিলেক্ট করুন (PDF / TXT)',
  btnGenerateAudiobook: 'অডিওবুক তৈরি করুন',

  // Library Screen
  libraryTitle: 'আমার লাইব্রেরি',
  librarySub: 'সংরক্ষিত ও তৈরি বই',
  tabSaved: 'সংরক্ষিত',
  tabDownloaded: 'ডাউনলোড',
  tabMyCreated: 'আমার তৈরি',
  noSavedBooks: 'এখনও কোনো বই সংরক্ষিত নেই। পছন্দসই বই সেভ করে রাখুন!',
  noDownloadedBooks: 'অফলাইনে শোনার জন্য কোনো বই ডাউনলোড করা নেই।',
  noCreatedBooks: 'আপনি এখনও কোনো অডিওবুক তৈরি করেননি।',

  // Profile & Settings
  profileTitle: 'প্রোফাইল ও সেটিংস',
  profileSub: 'ইউজার অ্যাকাউন্ট ও সেবা',
  subscriptionSection: 'সাবস্ক্রিপশন প্ল্যান',
  upgradeToPremium: 'Premium-এ আপগ্রেড করুন (৳১৯৯/মাস)',
  publisherProgram: 'প্রকাশক প্রোগ্রাম (Publisher)',
  publisherApply: 'প্রকাশক হিসেবে আবেদন করুন',
  publisherManage: 'চ্যানেল পরিচালনা করুন',
  appLanguageSection: 'অ্যাপের ভাষা (Language)',
  copyrightPolicySection: 'কপিরাইট ও স্বত্বাধিকার নীতিমালা',
  copyrightPolicyDesc:
    'BornoVerse প্ল্যাটফর্মে সকল স্বত্বাধিকারীর অধিকার সুরক্ষিত রাখা হয়। যে কোনো বইয়ের বিরুদ্ধে লঙ্ঘনের অভিযোগ সরাসরি প্রতিটি বইয়ের বিস্তারিত পাতা থেকে রিপোর্ট করা যায়।',
  btnLogout: 'লগআউট করুন',
  logoutConfirmTitle: 'লগআউট',
  logoutConfirmMessage: 'আপনি কি নিশ্চিত যে লগআউট করতে চান?',
  btnCancel: 'বাতিল',

  // Modals & Bottom Sheets
  filterSortModalTitle: 'ফিল্টার ও সাজানো',
  playbackSettingsTitle: 'প্লেব্যাক সেটিংস',
  copyrightReportTitle: 'কপিরাইট লঙ্ঘন রিপোর্ট করুন',
  paymentModalTitle: 'Upgrade to Premium',
  paymentModalSub: 'মাসিক ৳১৯৯ / আনলিমিটেড লিসেনিং ও অফলাইন ক্যাশ',
  publisherFormTitle: 'প্রকাশক আবেদন ফর্ম',
  publisherFormSub: 'জাতীয় পরিচয়পত্র (NID), ট্রেড লাইসেন্স ও প্রকাশনা সংক্রান্ত তথ্য',
  btnSubmitApplication: 'আবেদনপত্র দাখিল করুন',
  btnCompletePayment: 'পেমেন্ট সম্পন্ন করুন (bKash / Card)',

  // Forgot Password Screen
  forgotHeaderTitle: 'পাসওয়ার্ড পুনরুদ্ধার',
  forgotHeaderSub: 'সম্পূর্ণ ভেরিফিকেশন ও রিসেট ধাপ',
  forgotStepEmail: 'ইমেইল',
  forgotStepVerify: 'যাচাই',
  forgotStepReset: 'রিসেট',
  forgotStepSuccess: 'সফল',
  forgotEmailLabel: 'অ্যাকাউন্টের ইমেইল',
  forgotVerifyCodeLabel: '৬ সংখ্যার যাচাইকরণ কোড',
  forgotNewPasswordLabel: 'নতুন পাসওয়ার্ড',
  forgotBannerTitle: 'ইমেইল পাঠানো হয়েছে · কোড যাচাইকৃত',
  forgotBannerSub: 'রিসেট লিঙ্কের মেয়াদ ১৫ মিনিট · পুনরায় পাঠান ০০:৪২',
  btnChangePassword: 'পাসওয়ার্ড বদলান',
  forgotSuccessTitle: 'সফল হয়েছে',
  forgotSuccessSub: 'পাসওয়ার্ড আপডেট হয়েছে · অন্যান্য সেশন লগআউট',

  // Chapters & Queue Screen
  chaptersQueueSub: '{count}টি অধ্যায় · {next}টি কিউতে',
  upNextSection: 'পরবর্তীতে বাজবে',
  reorderClearQueue: 'সারিবদ্ধ তালিকা সাজান / খালি করুন',
  queueOptionsTitle: 'কিউ অপশন',
  queueOptionsMessage: 'সারিবদ্ধ বইগুলোর ক্রম পরিবর্তন বা মুছতে চান?',
  btnClearQueue: 'কিউ খালি করুন',
  btnOk: 'ঠিক আছে',

  // Search Results & Discovery
  searchResultsTitle: 'অনুসন্ধান ফলাফল',
  searchResultsSub: 'পরামর্শ · ইতিহাস · ফলাফল',
  searchSuggestions: 'পরামর্শ',
  recentHistory: 'সাম্প্রতিক অনুসন্ধান',
  filterSortBtn: 'ফিল্টার · ৩ / সাজান',
  filterModalHeading: 'ফিল্টার ও সাজান',
  filterSectionTitle: 'ভাষা · ধরন · সময়সীমা',
  sortForYou: 'সাজান: আপনার জন্য',
  sortOptionsSub: 'নতুন · সর্বাধিক শোনা · রেটিং · সময়কাল',
  btnViewResults: '২৪টি ফলাফল দেখুন',

  // Discovery States Screen
  discoveryTitle: 'ডিসকভারি স্টেট',
  discoverySub: 'লোডিং · ফলাফল নেই · অফলাইন · এরর',
  noResultsTitle: 'কোনো ফলাফল নেই',
  noResultsHint: 'বানান দেখুন বা ফিল্টার সরান',
  offlineTitle: 'অফলাইন',
  offlineHint: 'শুধু ডাউনলোড করা অডিওবুক উপলব্ধ',
  errorTitle: 'সমস্যা হয়েছে',
  errorHint: 'অনুসন্ধান সংরক্ষিত · পুনরায় চেষ্টা করুন',
  btnRetry: 'পুনরায় চেষ্টা করুন',

  // Upload Source & Generation Pipeline
  uploadPdfTitle: 'PDF আপলোড',
  uploadPdfSub: 'সোর্স ফাইল নির্বাচন ও এআই প্রসেসিং',
  pickPdfPrompt: 'PDF ফাইল বেছে নিন',
  pickPdfSub: 'ডিভাইস থেকে বাংলা বা ইংরেজি বই নির্বাচন করুন',
  tapToChange: 'ট্যাপ করে বদলান',
  fileRequiredAlert: 'অনুগ্রহ করে প্রথমে একটি PDF ফাইল নির্বাচন করুন।',
  processingPipelineFeatures: 'প্রসেসিং পাইপলাইন ফিচারসমূহ',
  pipelineFeature1: 'বাংলা লিপির বিশেষায়িত অপটিক্যাল ক্যারেক্টার রিকগনিশন (OCR)',
  pipelineFeature2: 'বাক্য বিভাজন ও স্বরচিহ্ন প্রাক-প্রক্রিয়াকরণ',
  pipelineFeature3: 'প্রাকৃতিক বাংলা কণ্ঠ সংমিশ্রণ (Bangla VITS Engine)',
  pipelineFeature4: 'অধ্যায়ভিত্তিক স্বয়ংক্রিয় অডিও ট্র্যাকিং',
  btnStartGeneration: 'অডিওবুক তৈরি শুরু করুন',
  genProgressTitle: 'রূপান্তর অগ্রগতি',
  genProgressSub: 'AI Audiobook Pipeline',
  statusCompleted: 'অডিওবুক সফলভাবে তৈরি হয়েছে!',
  statusInProgress: 'কৃত্রিম বুদ্ধিমত্তা দিয়ে অডিও তৈরি হচ্ছে',
  pipelineStepsHeading: 'ধাপসমূহ (Pipeline)',
  stepPdfUploaded: 'PDF আপলোড সম্পন্ন',
  stepTextOcr: 'টেক্সট নিষ্কাশন ও ওসিআর',
  stepQueued: 'কিউতে অপেক্ষারত (অগ্রাধিকার: উচ্চ, অবস্থান: #{pos})',
  stepSpeechSynthesis: 'বাংলা এআই স্পিচ সংশ্লেষণ (TTS)',
  stepGenDone: 'অডিওবুক তৈরি সম্পন্ন',
  btnListenAudiobook: 'অডিওবুক শুনুন',

  // Register Screen
  registerTitle: 'নতুন অ্যাকাউন্ট তৈরি',
  fieldUsername: 'ব্যবহারকারীর নাম',
  fieldConfirmPassword: 'পাসওয়ার্ড নিশ্চিত করুন',
  btnCreateAccount: 'অ্যাকাউন্ট তৈরি করুন',
  alreadyHaveAccount: 'ইতিমধ্যে একটি অ্যাকাউন্ট আছে?',
  linkLogIn: 'লগইন করুন',
};

/**
 * Mixed strategy combines English navigation labels with Bengali descriptive text.
 */
export const mixedTranslations: Record<TranslationKey, string> = {
  ...bnTranslations,
  tabHome: 'Home (হোম)',
  tabExplore: 'Search (খুঁজুন)',
  tabLibrary: 'Library (লাইব্রেরি)',
  tabCreate: 'Create (তৈরি)',
  tabProfile: 'Profile (প্রোফাইল)',
  btnStartListening: 'Play (শুরু করুন)',
  btnResumeListening: 'Resume (চালিয়ে যান)',
};
