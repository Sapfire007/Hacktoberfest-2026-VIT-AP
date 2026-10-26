/**
 * Reports — the daily visitor register (CSV or PDF) and the gate log (CSV) for a range.
 *
 * Each download is a five-minute signed link opened in the browser, and each is recorded in
 * the audit log. The register lists every visit that started on the chosen day, with times
 * in IST, the officers who handled it, and flags for overstays and watchlist overrides.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { openReport, ReportKind } from '@/services/admin.api';
import { DateRangeBar, todayRange, DateRange } from '@/components/admin/DateRangeBar';
import { AdminPage, Card, ErrorText, Muted } from '@/components/admin/AdminKit';

export default function ReportsScreen() {
  const { getIdToken } = useAuth();
  const [day, setDay] = useState<DateRange>(todayRange());
  const [range, setRange] = useState<DateRange>(todayRange());
  const [busy, setBusy] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (kind: ReportKind, from: string, to?: string) => {
    setError(null);
    setBusy(kind);
    try {
      await openReport(await getIdToken(), kind, from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the report');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage title="Reports" subtitle="Registers for administration. Every download is audited.">
      <ErrorText>{error}</ErrorText>

      <Card title="DAILY VISITOR REGISTER">
        <Text style={styles.body}>
          Every visit that began on the day: pass code, name, phone, party size, vehicle, how they
          got in, host and purpose, gate, in and out times, duration, officers, and flags for
          overstays and watchlist overrides.
        </Text>
        <DateRangeBar value={day} onChange={setDay} singleDay />
        <View style={styles.buttons}>
          <NeuButton
            title="Download PDF"
            variant="primary"
            size="md"
            loading={busy === 'register-pdf'}
            onPress={() => download('register-pdf', day.from)}
          />
          <NeuButton
            title="Download CSV (Excel)"
            variant="ghost"
            size="md"
            loading={busy === 'register-csv'}
            onPress={() => download('register-csv', day.from)}
          />
        </View>
        <Muted>
          The PDF uses a standard font; names in Telugu or Hindi script print correctly only in the
          CSV.
        </Muted>
      </Card>

      <Card title="GATE LOG — ENTRIES, EXITS AND DENIALS">
        <Text style={styles.body}>
          One row per scan, for up to 31 days at a time. Use it to answer “who came in through the
          North Gate on Tuesday” or to hand a record to an enquiry.
        </Text>
        <DateRangeBar value={range} onChange={setRange} presets={['today', 'yesterday', '7d', '30d']} />
        <View style={styles.buttons}>
          <NeuButton
            title="Download CSV"
            variant="primary"
            size="md"
            loading={busy === 'log-csv'}
            onPress={() => download('log-csv', range.from, range.to)}
          />
        </View>
      </Card>

      <Muted>
        On a phone the file opens in your browser, which saves it to Downloads. Links expire after
        five minutes — generate a fresh one if a download fails.
      </Muted>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  body: { ...Typography.bodySm, color: Colors.gray700, lineHeight: 20 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
