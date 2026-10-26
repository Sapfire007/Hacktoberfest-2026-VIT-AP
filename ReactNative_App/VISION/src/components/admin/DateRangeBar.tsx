/**
 * DateRangeBar — preset chips (today, yesterday, 7 / 30 days) plus from/to pickers.
 * Values are IST "YYYY-MM-DD" keys, the same format the backend's range queries take.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/neumorphic';
import { NativeDateTimePicker } from '@/components/ui/NativeDateTimePicker';
import { Chips } from '@/components/admin/AdminKit';
import { addDaysKey, istToday } from '@/utils/istDate';

export interface DateRange {
  from: string;
  to: string;
}

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function presetRange(preset: Preset): DateRange {
  const today = istToday();
  switch (preset) {
    case 'yesterday':
      return { from: addDaysKey(today, -1), to: addDaysKey(today, -1) };
    case '7d':
      return { from: addDaysKey(today, -6), to: today };
    case '30d':
      return { from: addDaysKey(today, -29), to: today };
    default:
      return { from: today, to: today };
  }
}

function currentPreset(range: DateRange): Preset {
  for (const p of ['today', 'yesterday', '7d', '30d'] as Preset[]) {
    const r = presetRange(p);
    if (r.from === range.from && r.to === range.to) return p;
  }
  return 'custom';
}

const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dateToKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function todayRange(): DateRange {
  return presetRange('today');
}

export function lastWeekRange(): DateRange {
  return presetRange('7d');
}

export function DateRangeBar({
  value,
  onChange,
  singleDay,
  presets = ['today', 'yesterday', '7d', '30d'],
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Only one date (the daily register). */
  singleDay?: boolean;
  presets?: Exclude<Preset, 'custom'>[];
}) {
  const labels: Record<string, string> = { today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7 days', '30d': 'Last 30 days' };
  const options = presets
    .filter((p) => !singleDay || p === 'today' || p === 'yesterday')
    .map((p) => ({ key: p as Preset, label: labels[p] }));
  const today = keyToDate(istToday());

  return (
    <View style={styles.wrap}>
      <Chips
        options={[...options, { key: 'custom' as Preset, label: 'Custom' }]}
        value={currentPreset(value)}
        onChange={(p) => (p === 'custom' ? undefined : onChange(presetRange(p)))}
      />
      <View style={styles.pickers}>
        <View style={styles.picker}>
          <NativeDateTimePicker
            label={singleDay ? 'DATE' : 'FROM'}
            mode="date"
            value={keyToDate(value.from)}
            maximumDate={today}
            onChange={(d) => {
              const from = dateToKey(d);
              onChange(singleDay ? { from, to: from } : { from, to: value.to < from ? from : value.to });
            }}
          />
        </View>
        {!singleDay && (
          <View style={styles.picker}>
            <NativeDateTimePicker
              label="TO"
              mode="date"
              value={keyToDate(value.to)}
              minimumDate={keyToDate(value.from)}
              maximumDate={today}
              onChange={(d) => onChange({ from: value.from, to: dateToKey(d) })}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  picker: { flexGrow: 1, flexBasis: 160, maxWidth: 260 },
});
