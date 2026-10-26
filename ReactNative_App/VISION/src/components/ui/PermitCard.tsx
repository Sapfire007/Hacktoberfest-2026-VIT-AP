/**
 * PermitCard — Active Permit Card Component
 * 
 * Displays large QR code, validity countdown timer, "Available Offline" indicator,
 * destination/purpose, requester name and date per Design.md §5.2 and Stitch designs.
 */

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { NeuCard } from './NeuCard';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuInset, neuOutset } from '@/constants/neumorphic';
import { Icon } from '@/components/ui/Icon';

interface PermitCardProps {
  permitId: string;
  destination: string;
  purpose: string;
  requesterName: string;
  date: string;
  validityTimeLeft?: string;
  qrPayload?: string;
  isOfflineAvailable?: boolean;
  status?: 'approved' | 'permit_active'; // Add status prop
  requestId?: string; // Add request ID for display when locked
}

export function PermitCard({
  permitId,
  destination,
  purpose,
  requesterName,
  date,
  validityTimeLeft = '—',
  qrPayload,
  // Off unless the caller knows otherwise: there is no offline permit cache yet.
  isOfflineAvailable = false,
  status = 'approved', // Default to approved (pending verification)
  requestId, // Request ID to display when locked
}: PermitCardProps) {

  // Show locked QR if approved but not yet verified at gate
  const showLockedQR = status === 'approved' && !qrPayload;

  return (
    <NeuCard distance={8} blur={16} radius={Radius['2xl']} style={styles.card}>
      {/* Top Offline Status Badge */}
      {isOfflineAvailable && (
        <View style={styles.offlineBadge}>
          <Icon name="cloud" size={14} color={Colors.green600} />
          <Text style={styles.offlineText}>Available Offline</Text>
        </View>
      )}

      {/* Header Titles */}
      <View style={styles.header}>
        <Text style={styles.destination}>{destination}</Text>
        <Text style={styles.purpose}>{purpose}</Text>
      </View>

      {/* QR Code Container with Inset Frame */}
      <View style={[styles.qrContainer, neuInset(4, 8, Colors.neuSurface)]}>
        <View style={styles.qrInnerFrame}>
          {/* Show locked QR if approved but not yet verified at gate */}
          {showLockedQR ? (
            <>
              <Image
                source={require('../../../assets/images/locked_qr.png')}
                style={styles.lockedQrImage}
                resizeMode="contain"
              />
              <Text style={styles.permitIdLabel}>Permit Approved - Verification Pending</Text>
              {requestId && (
                <View style={styles.requestIdBox}>
                  <Text style={styles.requestIdLabel}>Request ID:</Text>
                  <Text style={styles.requestIdValue}>{requestId}</Text>
                </View>
              )}
              <View style={styles.scanLabelContainer}>
                <Icon name="lock-secure" size={12} color={Colors.gray500} />
                <Text style={styles.scanLabel}>AWAITING GATE VERIFICATION</Text>
              </View>
            </>
          ) : qrPayload ? (
            <>
              <QRCode value={qrPayload} size={160} backgroundColor="#FFFFFF" color="#0B1B33" ecl="M" />
              <Text style={styles.permitIdLabel}>Visitor Permit: {permitId}</Text>
              <Text style={styles.scanLabel}>Show this at the gate • ACTIVE PERMIT</Text>
            </>
          ) : (
            <>
              <View style={styles.qrPlaceholder}>
                <Text style={styles.qrPlaceholderText}>QR code unavailable</Text>
              </View>
              <Text style={styles.permitIdLabel}>Visitor Permit: {permitId}</Text>
              <Text style={styles.scanLabel}>Permit not active</Text>
            </>
          )}
        </View>
      </View>

      {/* Gate Verification Notice - Only shown when approved but not verified */}
      {showLockedQR && (
        <View style={styles.verificationNotice}>
          <Icon name="university" size={24} color={Colors.orange600} style={styles.noticeIconWrapper} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Visit Gate for Verification</Text>
            <Text style={styles.noticeText}>
              Your request has been approved by faculty. Please visit the university gate to complete biometric verification and activate your access QR code.
            </Text>
          </View>
        </View>
      )}

      {/* Validity Countdown Display */}
      <View style={[styles.countdownBox, neuInset(3, 6, Colors.neuSurface)]}>
        <Text style={styles.validForLabel}>VALID FOR</Text>
        <Text style={styles.timerText}>{validityTimeLeft}</Text>
      </View>

      {/* Footer Info */}
      <View style={styles.footerRow}>
        <View>
          <Text style={styles.metaLabel}>REQUESTER</Text>
          <Text style={styles.metaValue}>{requesterName}</Text>
        </View>
        <View style={styles.alignRight}>
          <Text style={styles.metaLabel}>DATE</Text>
          <Text style={styles.metaValue}>{date}</Text>
        </View>
      </View>
    </NeuCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-end',
  },
  offlineText: {
    ...Typography.tiny,
    color: Colors.green600,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    gap: 4,
  },
  destination: {
    ...Typography.headlineMd,
    color: Colors.gray900,
    textAlign: 'center',
  },
  purpose: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
  qrContainer: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    marginTop: Spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  qrInnerFrame: {
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    width: '85%',
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  lockedQrImage: {
    width: 160,
    height: 160,
  },
  requestIdBox: {
    backgroundColor: Colors.blue50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  requestIdLabel: {
    ...Typography.tiny,
    color: Colors.blue600,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  requestIdValue: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  verificationNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.orange50,
    borderLeftWidth: 4,
    borderLeftColor: Colors.orange600,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.sm,
  },
  noticeIconWrapper: {
    marginTop: 2,
  },
  noticeTitle: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.orange700,
    marginBottom: 4,
  },
  noticeText: {
    ...Typography.caption,
    color: Colors.orange600,
    lineHeight: 18,
  },
  permitIdLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.gray700,
    marginTop: 4,
  },
  scanLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  scanLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    letterSpacing: 0.5,
  },
  countdownBox: {
    width: '100%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 2,
    marginTop: Spacing.xs,
  },
  validForLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    letterSpacing: 1,
  },
  timerText: {
    ...Typography.headlineXl,
    color: Colors.navy900,
    fontVariant: ['tabular-nums'],
    fontSize: 34,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    letterSpacing: 0.5,
  },
  metaValue: {
    ...Typography.bodyMd,
    fontWeight: '600',
    color: Colors.gray900,
  },
});
