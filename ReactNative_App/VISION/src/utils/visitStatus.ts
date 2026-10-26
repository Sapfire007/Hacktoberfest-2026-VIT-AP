/**
 * Visit Status Utilities
 * 
 * Helper functions for determining visit request status based on dates and current state
 */

import type { StatusKey } from '@/constants/colors';

/**
 * Determine the effective status of a visit request for display purposes
 * 
 * Faculty History Convention:
 * - permit_active/approved → show as "Approved"
 * - rejected → show as "Rejected"
 * - pending with past date → show as "Expired"
 */
export function getEffectiveStatus(
  currentStatus: StatusKey,
  visitDate: string,
  visitEndAt?: string | null
): StatusKey {
  // Convert permit_active to approved for history display
  if (currentStatus === 'permit_active') {
    return 'approved';
  }
  
  // Keep rejected and approved as-is
  if (currentStatus === 'approved' || currentStatus === 'rejected' || currentStatus === 'cancelled') {
    return currentStatus;
  }
  
  // For truly pending requests, check if expired
  const trulyPending = currentStatus === 'pending' || 
                       currentStatus === 'submitted' || 
                       currentStatus === 'under_review';
  
  if (trulyPending) {
    // Check if the visit date has passed
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let visitEndDate: Date;
    
    if (visitEndAt) {
      visitEndDate = new Date(visitEndAt);
    } else {
      visitEndDate = new Date(visitDate);
      visitEndDate.setHours(23, 59, 59, 999);
    }

    // If visit end date has passed, mark as expired
    if (visitEndDate < today) {
      return 'permit_expired';
    }
  }

  return currentStatus;
}

/**
 * Check if a visit is in the past
 */
export function isVisitExpired(visitDate: string, visitEndAt?: string | null): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let visitEndDate: Date;
  
  if (visitEndAt) {
    visitEndDate = new Date(visitEndAt);
  } else {
    visitEndDate = new Date(visitDate);
    visitEndDate.setHours(23, 59, 59, 999);
  }

  return visitEndDate < today;
}
