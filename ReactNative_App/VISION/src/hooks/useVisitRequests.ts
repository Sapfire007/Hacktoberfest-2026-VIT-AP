/**
 * Visit Requests Hook
 *
 * React hook for managing visit requests. Data comes from Node_Backend via
 * visitRequest.service, which refreshes periodically (see POLL_INTERVAL_MS there).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  VisitRequest,
  submitVisitRequest,
  getVisitRequestsByUser,
  getPendingRequestsByFaculty,
  approveVisitRequest,
  rejectVisitRequest,
  cancelVisitRequest,
  subscribeToUserRequests,
  subscribeToPendingFacultyRequests,
  VisitRequestInput,
} from '@/services/visitRequest.service';

interface UseVisitRequestsReturn {
  requests: VisitRequest[];
  loading: boolean;
  error: Error | null;
  submitRequest: (data: VisitRequestInput) => Promise<string>;
  approveRequest: (requestId: string, facultyId: string, remarks?: string) => Promise<void>;
  rejectRequest: (requestId: string, facultyId: string, remarks: string) => Promise<void>;
  cancelRequest: (requestId: string, userId: string, userName: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for user's visit requests (visitor/parent/student view)
 */
export function useVisitRequests(userId: string | undefined): UseVisitRequestsReturn {
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadRequests = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setRequests([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getVisitRequestsByUser(userId);
      setRequests(data);
    } catch (err) {
      console.error('Error loading requests:', err);
      setError(err instanceof Error ? err : new Error('Failed to load requests'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Real-time subscription
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setRequests([]);
      return;
    }

    console.log('🔔 Subscribing to user requests:', userId);
    // The server includes the host's photo, so no per-request faculty lookup is needed.
    const unsubscribe = subscribeToUserRequests(userId, (data) => {
      setRequests(data);
      setLoading(false);
    });

    return () => {
      console.log('🔕 Unsubscribing from user requests');
      unsubscribe();
    };
  }, [userId]);

  const submitRequest = useCallback(
    async (data: VisitRequestInput) => {
      try {
        setError(null);
        const requestId = await submitVisitRequest(data);
        await loadRequests(); // Refresh list
        return requestId;
      } catch (err) {
        console.error('Error submitting request:', err);
        const error = err instanceof Error ? err : new Error('Failed to submit request');
        setError(error);
        throw error;
      }
    },
    [loadRequests]
  );

  const cancelRequest = useCallback(
    async (requestId: string, userId: string, userName: string) => {
      try {
        setError(null);
        await cancelVisitRequest(requestId, userId, userName);
        await loadRequests();
      } catch (err) {
        console.error('Error cancelling request:', err);
        const error = err instanceof Error ? err : new Error('Failed to cancel request');
        setError(error);
        throw error;
      }
    },
    [loadRequests]
  );

  const approveRequest = useCallback(async () => {
    throw new Error('Approve action not available for users');
  }, []);

  const rejectRequest = useCallback(async () => {
    throw new Error('Reject action not available for users');
  }, []);

  return {
    requests,
    loading,
    error,
    submitRequest,
    approveRequest,
    rejectRequest,
    cancelRequest,
    refresh: loadRequests,
  };
}

/**
 * Hook for faculty's pending requests (faculty view)
 */
export function useFacultyRequests(facultyId: string | undefined): UseVisitRequestsReturn {
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadRequests = useCallback(async () => {
    if (!facultyId) {
      setLoading(false);
      setRequests([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getPendingRequestsByFaculty(facultyId);
      setRequests(data);
    } catch (err) {
      console.error('Error loading faculty requests:', err);
      setError(err instanceof Error ? err : new Error('Failed to load requests'));
    } finally {
      setLoading(false);
    }
  }, [facultyId]);

  // Real-time subscription
  useEffect(() => {
    if (!facultyId) {
      console.log('⚠️ useFacultyRequests: No facultyId provided, setting empty state');
      setLoading(false);
      setRequests([]);
      return;
    }

    console.log('🔔 useFacultyRequests: Subscribing to faculty requests for:', facultyId);
    setLoading(true); // Ensure loading state while establishing subscription
    
    const unsubscribe = subscribeToPendingFacultyRequests(facultyId, (data) => {
      console.log('📬 useFacultyRequests: Received faculty request update:', data.length, 'requests');
      setRequests(data);
      setLoading(false);
    });

    return () => {
      console.log('🔕 useFacultyRequests: Unsubscribing from faculty requests');
      unsubscribe();
    };
  }, [facultyId]);

  const approveRequest = useCallback(
    async (requestId: string, facultyId: string, remarks?: string) => {
      try {
        setError(null);
        await approveVisitRequest(requestId, facultyId, remarks);
        await loadRequests();
      } catch (err) {
        console.error('Error approving request:', err);
        const error = err instanceof Error ? err : new Error('Failed to approve request');
        setError(error);
        throw error;
      }
    },
    [loadRequests]
  );

  const rejectRequest = useCallback(
    async (requestId: string, facultyId: string, remarks: string) => {
      try {
        setError(null);
        await rejectVisitRequest(requestId, facultyId, remarks);
        await loadRequests();
      } catch (err) {
        console.error('Error rejecting request:', err);
        const error = err instanceof Error ? err : new Error('Failed to reject request');
        setError(error);
        throw error;
      }
    },
    [loadRequests]
  );

  const submitRequest = useCallback(async () => {
    throw new Error('Submit action not available for faculty');
  }, []);

  const cancelRequest = useCallback(async () => {
    throw new Error('Cancel action not available for faculty');
  }, []);

  return {
    requests,
    loading,
    error,
    submitRequest,
    approveRequest,
    rejectRequest,
    cancelRequest,
    refresh: loadRequests,
  };
}
