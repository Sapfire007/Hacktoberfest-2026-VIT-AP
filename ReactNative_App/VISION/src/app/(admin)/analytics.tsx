/**
 * Analytics (PRD.md FR-RPT-03): visits by day and hour, peak hours, gates, how people got
 * in, visit length, and how well the number-plate camera is doing.
 *
 * OCR accuracy is measured from what officers did with each camera read: accepted as read,
 * or corrected before saving. It is a practical accuracy — the share of reads a person
 * trusted — rather than a lab figure.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { adminAPI } from '@/services/admin.api';
import { useAdminData } from '@/components/admin/useAdminData';
import { DateRangeBar, lastWeekRange } from '@/components/admin/DateRangeBar';
import {
  AdminPage,
  BarList,
  Card,
  ColumnChart,
  ErrorText,
  Grid,
  Loading,
  Muted,
  StatTile,
  fmtHour,
  fmtMinutes,
  useIsWide,
} from '@/components/admin/AdminKit';

export default function AnalyticsScreen() {
  const wide = useIsWide();
  const [range, setRange] = useState(lastWeekRange());
  const { data, loading, error, reload } = useAdminData(
    (t) => adminAPI.analytics(t, range.from, range.to),
    [range.from, range.to]
  );

  const peakSet = new Set((data?.peakHours ?? []).map((p) => p.hour));
  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

  return (
    <AdminPage
      title="Analytics"
      subtitle="Computed from the gate records in the selected range."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
    >
      <Card>
        <DateRangeBar value={range} onChange={setRange} presets={['today', '7d', '30d']} />
      </Card>

      <ErrorText>{error}</ErrorText>
      {!data && loading ? <Loading /> : null}

      {data && (
        <>
          {data.truncated && (
            <Text style={styles.warn}>
              This range has more than 10,000 visits; figures cover the most recent 10,000.
            </Text>
          )}

          <Grid min={180}>
            <StatTile label="VISITS" value={data.totals.visits} hint={`${data.totals.people} people incl. companions`} />
            <StatTile label="UNIQUE VISITORS" value={data.totals.uniqueVisitors} hint="by phone number" />
            <StatTile label="AVERAGE VISIT" value={fmtMinutes(data.duration.averageMinutes)} hint={`median ${fmtMinutes(data.duration.medianMinutes)} · 90% under ${fmtMinutes(data.duration.p90Minutes)}`} />
            <StatTile
              label="PEAK HOUR"
              value={data.peakHours[0] ? `${fmtHour(data.peakHours[0].hour)}–${fmtHour((data.peakHours[0].hour + 1) % 24)}` : '—'}
              hint={data.peakHours[0] ? `${data.peakHours[0].visits} arrivals` : undefined}
            />
            <StatTile label="STILL INSIDE" value={data.totals.stillInside} tone={data.totals.overstaysNow ? 'alert' : 'default'} hint={`${data.totals.overstaysNow} overstayed`} />
            <StatTile
              label="WATCHLIST"
              value={data.watchlist.hits}
              tone={data.watchlist.overrides ? 'alert' : 'default'}
              hint={`${data.watchlist.overrides} admitted on override · ${data.watchlist.denials} denied`}
            />
          </Grid>

          <Card title={`VISITS PER DAY · ${data.range.from} → ${data.range.to}`}>
            <ColumnChart
              data={data.byDay.map((d) => ({ label: d.date.slice(5), value: d.visits }))}
            />
          </Card>

          <Card title="ARRIVALS BY HOUR (IST) — PEAK HOURS HIGHLIGHTED">
            <ColumnChart
              data={data.byHour.map((h) => ({ label: fmtHour(h.hour), value: h.visits }))}
              highlight={(i) => peakSet.has(i)}
            />
          </Card>

          <View style={[styles.split, wide && styles.splitWide]}>
            <Card title="VISITORS PER GATE" style={styles.half}>
              <BarList data={data.byGate.map((g) => ({ label: g.gate, value: g.visits }))} />
            </Card>
            <Card title="HOW THEY GOT IN" style={styles.half}>
              <BarList data={data.bySource.map((s) => ({ label: s.source, value: s.visits }))} />
            </Card>
          </View>

          <View style={[styles.split, wide && styles.splitWide]}>
            <Card title="VISITOR CATEGORY" style={styles.half}>
              <BarList data={data.byCategory.map((c) => ({ label: c.category, value: c.visits }))} />
            </Card>

            <Card title="NUMBER-PLATE CAMERA (OCR)" style={styles.half}>
              {data.ocr.vehicles === 0 ? (
                <Muted>No vehicles recorded in this range.</Muted>
              ) : (
                <>
                  <View style={styles.ocrHead}>
                    <Text style={styles.ocrBig}>{pct(data.ocr.acceptanceRate)}</Text>
                    <Text style={styles.ocrCaption}>
                      of camera reads were accepted by the officer without correction
                      {data.ocr.meanConfidence !== null ? ` · mean model confidence ${pct(data.ocr.meanConfidence)}` : ''}
                    </Text>
                  </View>
                  <BarList
                    total={data.ocr.vehicles}
                    data={[
                      { label: 'Read by camera, accepted', value: data.ocr.acceptedAsRead },
                      { label: 'Read by camera, corrected', value: data.ocr.corrected },
                      { label: 'Typed by the officer', value: data.ocr.manual },
                    ]}
                  />
                  <Muted>
                    A rising “corrected” share means the model needs fine-tuning on local plates
                    (see ANPR_backend_startup.md). A high “typed” share means the camera is not
                    being used.
                  </Muted>
                </>
              )}
            </Card>
          </View>
        </>
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  warn: { ...Typography.caption, color: Colors.orange600 },
  split: { gap: Spacing.md },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1 },
  ocrHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ocrBig: { fontSize: 34, fontWeight: '900', color: Colors.navy900 },
  ocrCaption: { ...Typography.caption, color: Colors.gray600, flex: 1 },
});
