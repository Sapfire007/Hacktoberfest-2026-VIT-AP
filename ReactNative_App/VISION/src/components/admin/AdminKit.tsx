/**
 * AdminKit — the small set of building blocks every admin console screen is made of.
 *
 * The console runs on a phone, a tablet and a laptop browser, so everything here flexes:
 * pages cap their width on wide screens, tiles wrap, charts are plain Views (no chart
 * library to bundle for three platforms).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  ViewStyle,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';

/** Width at which the console shows a sidebar instead of a hub page. */
export const WIDE_BREAKPOINT = 900;

export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}

// =========================================
// Page
// =========================================

interface AdminPageProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Hide the back link (the overview is the hub). */
  isHub?: boolean;
  children: React.ReactNode;
}

export function AdminPage({ title, subtitle, actions, refreshing, onRefresh, isHub, children }: AdminPageProps) {
  const router = useRouter();
  const wide = useIsWide();

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, wide && styles.pageContentWide]}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.inner}>
        {!wide && !isHub && (
          <Pressable onPress={() => router.replace('/(admin)/overview' as never)} hitSlop={8}>
            <Text style={styles.back}>← Admin console</Text>
          </Pressable>
        )}
        <View style={[styles.header, wide && styles.headerWide]}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({ children, style, title, right }: { children: React.ReactNode; style?: ViewStyle; title?: string; right?: React.ReactNode }) {
  return (
    <View style={[styles.card, neuOutset(4, 8, Colors.neuSurface), style]}>
      {title ? (
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Wrapping row of equal-width children: 1 column on a phone, up to 4 on a laptop. */
export function Grid({ children, min = 220 }: { children: React.ReactNode; min?: number }) {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, 1200) - (width >= WIDE_BREAKPOINT ? 280 : 32);
  const columns = Math.max(1, Math.min(4, Math.floor(usable / min)));
  const items = React.Children.toArray(children);
  return (
    <View style={styles.grid}>
      {items.map((child, index) => (
        <View key={index} style={{ width: `${100 / columns}%`, padding: Spacing.xs }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  onPress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'alert' | 'good';
  onPress?: () => void;
}) {
  const body = (
    <View
      style={[
        styles.tile,
        neuOutset(4, 8, Colors.neuSurface),
        tone === 'alert' && styles.tileAlert,
      ]}
    >
      <Text style={[styles.tileValue, tone === 'alert' && { color: Colors.red600 }, tone === 'good' && { color: Colors.green600 }]}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

// =========================================
// Charts
// =========================================

/** Vertical bars — hours of the day, days of a range. */
export function ColumnChart({
  data,
  height = 140,
  highlight,
}: {
  data: { label: string; value: number }[];
  height?: number;
  highlight?: (index: number) => boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const labelEvery = Math.ceil(data.length / 12);
  return (
    <View>
      <View style={[styles.columns, { height }]}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={styles.columnSlot}>
            {d.value > 0 ? <Text style={styles.columnValue}>{d.value}</Text> : null}
            <View
              style={[
                styles.column,
                { height: Math.max(d.value > 0 ? 3 : 0, (d.value / max) * (height - 18)) },
                highlight?.(i) && { backgroundColor: Colors.orange600 },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.columnLabels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-l-${i}`} style={styles.columnLabel} numberOfLines={1}>
            {i % labelEvery === 0 ? d.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars with labels — gates, categories, sources. */
export function BarList({ data, total }: { data: { label: string; value: number }[]; total?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const sum = total ?? data.reduce((a, d) => a + d.value, 0);
  if (data.length === 0) return <Text style={styles.muted}>No data in this range.</Text>;
  return (
    <View style={{ gap: Spacing.sm }}>
      {data.map((d) => (
        <View key={d.label} style={{ gap: 3 }}>
          <View style={styles.barHeader}>
            <Text style={styles.barLabel} numberOfLines={1}>{d.label}</Text>
            <Text style={styles.barValue}>
              {d.value}
              {sum ? `  ·  ${Math.round((d.value / sum) * 100)}%` : ''}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(d.value / max) * 100}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

// =========================================
// Controls
// =========================================

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const on = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.chip, on ? styles.chipOn : neuOutset(2, 4, Colors.neuSurface)]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchBox({
  value,
  onChangeText,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.gray400}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      autoCorrect={false}
      style={styles.search}
    />
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={Colors.navy900} />
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Pill({ text, tone = 'default' }: { text: string; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const colors = {
    default: { bg: Colors.gray200, fg: Colors.gray700 },
    good: { bg: Colors.green100, fg: Colors.green600 },
    bad: { bg: Colors.red100, fg: Colors.red600 },
    warn: { bg: Colors.orange100, fg: Colors.orange600 },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <Text style={[styles.pillText, { color: colors.fg }]}>{text}</Text>
    </View>
  );
}

/** A row in a list: main text on the left, a trailing element on the right. */
export function ListRow({
  title,
  lines,
  right,
  onPress,
  tone,
}: {
  title: string;
  lines?: (string | null | undefined | false)[];
  right?: React.ReactNode;
  onPress?: () => void;
  tone?: 'alert';
}) {
  const content = (
    <View style={[styles.row, tone === 'alert' && styles.rowAlert]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {(lines ?? []).filter(Boolean).map((line, i) => (
          <Text key={i} style={styles.rowLine}>{line as string}</Text>
        ))}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

/**
 * A confirmation that needs a written reason — suspending, revoking, clearing a flag.
 * (Alert.prompt exists only on iOS, and not in the browser.)
 */
export function ReasonModal({
  visible,
  title,
  message,
  confirmLabel,
  minLength = 5,
  optional,
  danger,
  placeholder,
  secret,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  minLength?: number;
  optional?: boolean;
  danger?: boolean;
  /** Replaces the default "Reason…" placeholder. */
  placeholder?: string;
  /** A password rather than a reason: masked, single line. */
  secret?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = optional || reason.trim().length >= minLength;

  const close = () => {
    setReason('');
    setError(null);
    onCancel();
  };

  // Unmounted as soon as it is closed. A fading-out modal stays clickable in the browser,
  // and a second click would run the action again against a cleared selection.
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          {message ? <Text style={styles.modalMessage}>{message}</Text> : null}
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={
              placeholder ?? (optional ? 'Reason (optional)' : `Reason (at least ${minLength} characters)`)
            }
            placeholderTextColor={Colors.gray400}
            multiline={!secret}
            secureTextEntry={secret}
            autoCapitalize={secret ? 'none' : 'sentences'}
            style={[styles.search, !secret && { minHeight: 80, textAlignVertical: 'top' }]}
          />
          <ErrorText>{error}</ErrorText>
          <View style={styles.modalActions}>
            <NeuButton title="Cancel" variant="ghost" size="sm" onPress={close} />
            <NeuButton
              title={confirmLabel}
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              disabled={!ok}
              loading={busy}
              onPress={async () => {
                if (busy) return;
                setBusy(true);
                setError(null);
                try {
                  await onConfirm(reason.trim());
                  setReason('');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Something went wrong');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// =========================================
// Formatting
// =========================================

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.neuBackground },
  pageContent: { padding: Spacing.lg, paddingTop: Spacing['3xl'], paddingBottom: Spacing['3xl'] },
  pageContentWide: { padding: Spacing['2xl'], paddingTop: Spacing['2xl'] },
  inner: { width: '100%', maxWidth: 1200, alignSelf: 'center', gap: Spacing.md },
  back: { ...Typography.caption, color: Colors.gray600, fontWeight: '700' },
  header: { gap: Spacing.sm },
  headerWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerText: { gap: 2, flexShrink: 1 },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodySm, color: Colors.gray600 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  card: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { ...Typography.tiny, color: Colors.gray600, letterSpacing: 0.6, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  tile: { padding: Spacing.lg, borderRadius: Radius.xl, gap: 2, minHeight: 96 },
  tileAlert: { borderWidth: 2, borderColor: Colors.red600, backgroundColor: Colors.red100 },
  tileValue: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: Colors.navy900 },
  tileLabel: { ...Typography.tiny, color: Colors.gray600, fontWeight: '800', letterSpacing: 0.5 },
  tileHint: { ...Typography.tiny, color: Colors.gray500 },

  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  columnSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  column: { width: '80%', backgroundColor: Colors.navy700, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  columnValue: { fontSize: 9, color: Colors.gray500 },
  columnLabels: { flexDirection: 'row', gap: 2, marginTop: 4 },
  columnLabel: { flex: 1, fontSize: 9, color: Colors.gray500, textAlign: 'center' },

  barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  barLabel: { ...Typography.caption, color: Colors.gray800, flex: 1, textTransform: 'capitalize' },
  barValue: { ...Typography.caption, color: Colors.gray600, fontWeight: '700' },
  barTrack: { height: 8, backgroundColor: Colors.gray200, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: Colors.navy700, borderRadius: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  chipOn: { backgroundColor: Colors.navy900 },
  chipText: { ...Typography.caption, color: Colors.gray700, fontWeight: '700' },
  chipTextOn: { color: Colors.white },

  search: {
    ...Typography.bodySm,
    color: Colors.navy900,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray300,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },

  loading: { padding: Spacing['2xl'], alignItems: 'center' },
  error: { ...Typography.caption, color: Colors.red600 },
  muted: { ...Typography.caption, color: Colors.gray500 },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  rowAlert: { backgroundColor: Colors.red100, paddingHorizontal: Spacing.sm, borderRadius: Radius.md },
  rowTitle: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '800' },
  rowLine: { ...Typography.caption, color: Colors.gray600 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,37,69,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modalTitle: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  modalMessage: { ...Typography.bodySm, color: Colors.gray700 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
});
