/**
 * TermsScreen — BornoVerse Terms of Service and Privacy Policy, linked from the
 * sign-up checkbox and from Profile.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../../contexts/LanguageContext';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

export const TERMS_UPDATED = '2026-11-04';

type Section = { title: [string, string]; body: [string, string][] };

const TERMS: Section[] = [
  {
    title: ['১. সেবা ও অ্যাকাউন্ট', '1. The service and your account'],
    body: [
      [
        'বর্ণভার্স একটি বাংলা অডিওবুক প্ল্যাটফর্ম। অ্যাকাউন্ট খুলতে একটি সঠিক ইমেইল লাগবে এবং তা যাচাই করতে হবে। আপনার পাসওয়ার্ড গোপন রাখা আপনার দায়িত্ব; অ্যাকাউন্ট থেকে হওয়া সব কাজের দায় আপনার।',
        'BornoVerse is a Bangla audiobook platform. You need a valid email address, which you must verify, to open an account. You are responsible for keeping your password secret and for everything done from your account.',
      ],
      ['অ্যাকাউন্ট খুলতে আপনার বয়স অন্তত ১৩ বছর হতে হবে।', 'You must be at least 13 years old to open an account.'],
    ],
  },
  {
    title: ['২. কনটেন্ট ও কপিরাইট', '2. Content and copyright'],
    body: [
      [
        'আপনি যা আপলোড বা প্রকাশ করেন (PDF, অডিও, কভার, বিবরণ), তার প্রয়োজনীয় স্বত্ব বা অনুমতি আপনার থাকতে হবে। অন্যের কপিরাইট লঙ্ঘন, চৌর্যবৃত্তি, যৌন, বেআইনি, হয়রানিমূলক বা বিভ্রান্তিকর কনটেন্ট নিষিদ্ধ।',
        'You must own or have permission for everything you upload or publish (PDFs, audio, covers, descriptions). Copyright infringement, plagiarism, sexual, illegal, harassing or misleading content is not allowed.',
      ],
      [
        'আপনার কনটেন্টের স্বত্ব আপনারই থাকে। প্রকাশ করলে আপনি বর্ণভার্সকে তা প্ল্যাটফর্মে সংরক্ষণ, প্রক্রিয়া (যেমন টেক্সট থেকে অডিও) ও শ্রোতাদের কাছে স্ট্রিম করার অনুমতি দেন।',
        'You keep the rights to your content. By publishing it you allow BornoVerse to store it, process it (for example text to speech) and stream it to listeners on the platform.',
      ],
    ],
  },
  {
    title: ['৩. রিপোর্ট, মডারেশন ও আপিল', '3. Reports, moderation and appeals'],
    body: [
      [
        'শ্রোতারা কনটেন্ট রিপোর্ট করতে পারেন। মডারেটররা কনটেন্ট লুকাতে, প্রকাশ সীমিত করতে বা অ্যাকাউন্ট স্থগিত করতে পারেন। প্রতিটি সিদ্ধান্তের বিরুদ্ধে ৭ দিনের মধ্যে প্রকাশক স্টুডিও থেকে আপিল করা যায়।',
        'Listeners can report content. Moderators may hide content, restrict publishing or suspend accounts. Each decision can be appealed within 7 days from the Publisher studio.',
      ],
      [
        'নিশ্চিত লঙ্ঘনে স্ট্রাইক যোগ হয়: ২টিতে ৭ দিন, ৩টিতে ৩০ দিন প্রকাশ সীমিত, ৪টিতে অ্যাকাউন্ট স্থগিত।',
        'Confirmed violations add strikes: 2 strikes restrict publishing for 7 days, 3 for 30 days, and 4 suspend the account.',
      ],
    ],
  },
  {
    title: ['৪. প্রিমিয়াম ও পেমেন্ট', '4. Premium and payments'],
    body: [
      [
        'প্রিমিয়ামের দাম অ্যাপে দেখানো হয় এবং পেমেন্ট SSLCommerz-এর মাধ্যমে হয়। স্বয়ংক্রিয় নবায়ন নেই। প্রিমিয়াম চলাকালীন শুধু বড় প্ল্যানে আপগ্রেড করা যায়; নতুন মেয়াদ বর্তমান মেয়াদের সাথে যোগ হয়। পরিশোধিত অর্থ সাধারণত ফেরতযোগ্য নয়।',
        'Premium prices are shown in the app and payments go through SSLCommerz. There is no automatic renewal. While Premium is active you can only upgrade to a longer plan; the new period is added to your current one. Payments are generally non-refundable.',
      ],
      [
        'প্রকাশকরা যাচাই ও নিবন্ধন ফি দেওয়ার পর প্রিমিয়াম শোনার ভিত্তিতে আয় করেন; উত্তোলন অ্যাডমিন যাচাই করেন।',
        'Publishers earn from premium listens after verification and a registration fee; withdrawals are reviewed by administrators.',
      ],
    ],
  },
  {
    title: ['৫. গোপনীয়তা নীতি', '5. Privacy policy'],
    body: [
      [
        'আমরা যা সংরক্ষণ করি: নাম, ইমেইল, পাসওয়ার্ডের হ্যাশ (আসল পাসওয়ার্ড নয়), পছন্দের ধরন ও চ্যানেল, শোনার অগ্রগতি, লাইব্রেরি, ফলো, পেমেন্টের রেকর্ড, আপলোড করা ফাইল, নোটিফিকেশন ও ডিভাইসের পুশ টোকেন।',
        'What we store: your name, email, a hash of your password (never the password itself), favourite genres and channels, listening progress, library, follows, payment records, uploaded files, notifications and your device push token.',
      ],
      [
        'কেন: অ্যাকাউন্ট চালাতে, সুপারিশ দেখাতে, পেমেন্ট ও প্রকাশকের আয় হিসাব করতে, নিরাপত্তা ও মডারেশনের জন্য। আমরা আপনার তথ্য বিক্রি করি না।',
        'Why: to run your account, recommend audiobooks, process payments and publisher earnings, and for security and moderation. We do not sell your data.',
      ],
      [
        'কার সাথে: পেমেন্টের জন্য SSLCommerz, ইমেইলের জন্য ইমেইল সেবাদাতা, Google সাইন-ইনের জন্য Google, এবং আমাদের হোস্টিং ও স্টোরেজ সেবা — শুধু প্রয়োজনীয় তথ্য।',
        'Shared with: SSLCommerz for payments, our email provider for emails, Google for Google sign-in, and our hosting and storage providers — only what each needs.',
      ],
      [
        'আপনার অধিকার: প্রোফাইল থেকে নাম বদলাতে পারেন এবং "অ্যাকাউন্ট মুছুন" দিয়ে অ্যাকাউন্ট ও সব সম্পর্কিত তথ্য স্থায়ীভাবে মুছে ফেলতে পারেন। অ্যাডমিনের অডিট লগে কাজের রেকর্ড থাকে, কিন্তু তা আর আপনার সাথে যুক্ত থাকে না।',
        'Your rights: you can change your name in Profile and permanently delete your account and all related data with "Delete account". The admin audit log keeps a record of actions, but it is no longer linked to you.',
      ],
    ],
  },
  {
    title: ['৬. পরিবর্তন ও যোগাযোগ', '6. Changes and contact'],
    body: [
      [
        'এই শর্ত বদলালে অ্যাপে জানানো হবে। পরিবর্তনের পরও ব্যবহার চালিয়ে গেলে নতুন শর্তে সম্মতি ধরা হবে। প্রশ্ন থাকলে অ্যাপের মাধ্যমে আমাদের সাথে যোগাযোগ করুন।',
        'If these terms change, we will tell you in the app. Using BornoVerse after a change means you accept the new terms. For questions, contact us through the app.',
      ],
    ],
  },
];

export function TermsScreen() {
  const navigation = useNavigation();
  const { tx, isEnglish } = useLanguage();
  const pick = (pair: [string, string]) => (isEnglish ? pair[1] : pair[0]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={tx('ফিরে যান', 'Go back')}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.heading} numberOfLines={1}>
          {tx('শর্তাবলি ও গোপনীয়তা নীতি', 'Terms & Privacy Policy')}
        </Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>
          {tx(`সর্বশেষ হালনাগাদ: ${TERMS_UPDATED}`, `Last updated: ${TERMS_UPDATED}`)}
        </Text>
        {TERMS.map((section) => (
          <View key={section.title[1]} style={styles.section}>
            <Text style={styles.title}>{pick(section.title)}</Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph[1]} style={styles.body}>
                {pick(paragraph)}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  updated: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  body: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
});
