/**
 * PaymentDetailsScreen — one completed payment: amount, item, dates, method and
 * transaction references, with "Download invoice", which renders a PDF invoice
 * on the phone (expo-print) and opens the share sheet to save or send it.
 */

import React, { useState } from 'react';
import { AppAlert } from '../../components/AppAlert';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { StateView } from '../../components/StateView';
import { Invoice, paymentsApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { ProfileStackParamList } from '../../navigation/types';
import { formatMoney } from '../../utils/format';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function dateTime(iso: string, english: boolean): string {
  return new Date(iso).toLocaleString(english ? 'en-GB' : 'bn-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function providerLabel(provider: string): string {
  return provider === 'sslcommerz' ? 'SSLCommerz' : provider === 'mock' ? 'Test payment' : provider;
}

/** A plain A4 invoice in English (bank/accounting friendly). */
function invoiceHtml(inv: Invoice): string {
  const amount = `BDT ${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const row = (label: string, value: string | null | undefined) =>
    value ? `<tr><td class="k">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#0F2A22;margin:40px;font-size:13px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0C7F5F;padding-bottom:16px}
    .brand{font-size:26px;font-weight:800;color:#0C7F5F}.muted{color:#5B6B66}
    h2{margin:0;font-size:22px;text-align:right}.paid{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:12px;background:#E2F5EA;color:#18794E;font-weight:700;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:10px 8px;text-align:left}
    .items th{background:#F2F7F5;font-size:12px;text-transform:uppercase;letter-spacing:.5px}.items td{border-bottom:1px solid #E3ECE8}
    .num{text-align:right}.total td{font-weight:800;font-size:15px;border-top:2px solid #0F2A22}
    .meta td{padding:4px 8px}.k{color:#5B6B66;width:40%}.foot{margin-top:40px;font-size:11px;color:#5B6B66;text-align:center}
  </style></head><body>
    <div class="head">
      <div><div class="brand">BornoVerse</div><div class="muted">Bangla audiobook platform</div></div>
      <div style="text-align:right"><h2>INVOICE</h2><div class="muted">${escapeHtml(inv.invoice_number)}</div><span class="paid">PAID</span></div>
    </div>
    <table class="meta">
      ${row('Billed to', inv.customer.name)}
      ${row('Email', inv.customer.email)}
      ${row('Customer ID', inv.customer.serial ? `#${inv.customer.serial}` : null)}
      ${row('Date', new Date(inv.issued_at).toLocaleString('en-GB'))}
      ${row('Payment method', providerLabel(inv.provider))}
      ${row('Transaction ID', inv.transaction_id)}
      ${row('Bank transaction ID', inv.bank_transaction_id)}
    </table>
    <table class="items">
      <tr><th>Description</th><th class="num">Amount</th></tr>
      <tr><td>${escapeHtml(inv.item)}</td><td class="num">${amount}</td></tr>
      <tr class="total"><td>Total paid</td><td class="num">${amount}</td></tr>
    </table>
    <div class="foot">This is a computer-generated invoice and needs no signature. Thank you for listening with BornoVerse.</div>
  </body></html>`;
}

export function PaymentDetailsScreen() {
  const { navigation } = useAppNavigation();
  const { orderId } = useRoute<RouteProp<ProfileStackParamList, 'PaymentDetails'>>().params;
  const { tx, isEnglish } = useLanguage();
  const invoice = useResource(() => paymentsApi.invoice(orderId), [orderId]);
  const [saving, setSaving] = useState(false);
  const inv = invoice.data;

  const download = async () => {
    if (!inv) return;
    setSaving(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: invoiceHtml(inv) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `${inv.invoice_number}.pdf`,
        });
      } else {
        AppAlert.alert(tx('ইনভয়েস তৈরি হয়েছে', 'Invoice created'), uri);
      }
    } catch (error) {
      AppAlert.alert(tx('ইনভয়েস তৈরি হয়নি', 'Could not create the invoice'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const rows: [string, string | null | undefined][] = inv
    ? [
        [tx('ইনভয়েস নম্বর', 'Invoice number'), inv.invoice_number],
        [tx('তারিখ', 'Date'), dateTime(inv.issued_at, isEnglish)],
        [tx('পেমেন্ট মাধ্যম', 'Payment method'), providerLabel(inv.provider)],
        [tx('ট্রানজেকশন আইডি', 'Transaction ID'), inv.transaction_id],
        [tx('ব্যাংক ট্রানজেকশন আইডি', 'Bank transaction ID'), inv.bank_transaction_id],
        [tx('নাম', 'Name'), inv.customer.name],
        [tx('ইমেইল', 'Email'), inv.customer.email],
      ]
    : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('পেমেন্টের বিবরণ', 'Payment details')} onBack={() => navigation.goBack()} />
      {invoice.isLoading ? (
        <StateView kind="loading" />
      ) : invoice.error || !inv ? (
        <StateView kind="error" message={invoice.error ?? ''} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={invoice.reload} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summary}>
            <View style={styles.okIcon}>
              <Ionicons name="checkmark" size={28} color={Colors.textOnPrimary} />
            </View>
            <Text style={styles.amount}>{formatMoney(inv.amount)}</Text>
            <Text style={styles.item}>{isEnglish ? inv.item : inv.item_bn}</Text>
            <View style={styles.paid}>
              <Text style={styles.paidText}>{tx('পরিশোধিত', 'Paid')}</Text>
            </View>
          </View>

          <View style={styles.card}>
            {rows
              .filter(([, value]) => !!value)
              .map(([label, value], i, list) => (
                <View key={label} style={[styles.row, i < list.length - 1 && styles.divider]}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value} selectable>
                    {value}
                  </Text>
                </View>
              ))}
          </View>

          <AppButton label={tx('ইনভয়েস ডাউনলোড (PDF)', 'Download invoice (PDF)')} icon="download-outline" onPress={download} isLoading={saving} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  summary: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.lg,
  },
  okIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  item: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  paid: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.tintGreen,
  },
  paidText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.tintGreenText,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  label: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  value: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'right',
  },
});
