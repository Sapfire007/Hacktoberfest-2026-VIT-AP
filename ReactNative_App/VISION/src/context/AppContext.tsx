/**
 * AppContext — Application State Management
 * 
 * Central store for visit requests, permits, vehicles, notifications,
 * and faculty approval actions.
 * 
 * Visit requests and permits come from Node_Backend (via useVisitRequests). Vehicles and
 * notifications are still local to the device — they have no backend yet. Vehicles are
 * saved per account on the device; notifications last for the session. Both start empty:
 * an account sees only what happened to it, never sample data.
 */

import React, { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  VisitRequest,
  Permit,
  Vehicle,
  NotificationItemData,
} from '@/data/mockData';
import { StatusKey } from '@/constants/colors';
import { useAuth } from './AuthContext';
import { useVisitRequests } from '@/hooks/useVisitRequests';
import { submitVisitRequest, cancelVisitRequest as cancelRequest, VisitRequestInput } from '@/services/visitRequest.service';
import { fetchMyGatePasses, GatePassItem } from '@/services/gatePass.service';

/** What a screen passes to addVisitRequest. Identity fields are filled in by the server. */
export type NewVisitRequest = Pick<
  VisitRequest,
  'destination' | 'purpose' | 'visitType' | 'targetFacultyId' | 'date' | 'timeWindow'
> & {
  visitStartAt: string;
  visitEndAt: string;
  vehiclePlate?: string;
  linkedStudentName?: string;
  /** Students only: the parent or guardian who will visit. */
  sponsoredVisitor?: { name: string; phone: string; relation?: string };
  // Accepted for compatibility with older callers; the server ignores them.
  targetFacultyName?: string;
  targetFacultyPhotoURL?: string;
  requesterId?: string;
  requesterName?: string;
  requesterCategory?: string;
  requesterPhotoUri?: string;
};

/** "HH:MM:SS" until `iso`, or null once it has passed. */
function timeLeft(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const sec = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

interface AppContextType {
  requests: VisitRequest[];
  /** Gate passes security sent to this account, and regular passes issued to it. */
  gatePasses: GatePassItem[];
  refreshGatePasses: () => Promise<void>;
  activePermit: Permit | null;
  vehicles: Vehicle[];
  notifications: NotificationItemData[];
  unreadNotificationCount: number;
  addVisitRequest: (requestData: NewVisitRequest) => Promise<VisitRequest>;
  requestsLoading: boolean;
  cancelVisitRequest: (requestId: string) => Promise<void>;
  updateRequestStatus: (requestId: string, status: StatusKey, remarks?: string) => void;
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => void;
  removeVehicle: (vehicleId: string) => void;
  setDefaultVehicle: (vehicleId: string) => void;
  markNotificationRead: (notificationId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  // Only requesters have visit requests. Staff (security, faculty, admin) share this
  // provider, and asking the server for "my requests" as staff is refused with a 403.
  const isRequester = role === 'visitor' || role === 'parent' || role === 'student';
  const { requests: firestoreRequests, loading: requestsLoading } = useVisitRequests(
    isRequester ? user?.uid : undefined
  );
  
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [notifications, setNotifications] = useState<NotificationItemData[]>([]);

  // API requests, shaped for the UI's VisitRequest type
  const requests: VisitRequest[] = useMemo(
    () =>
      firestoreRequests.map((fr) => ({
        id: fr.id,
        requesterId: fr.requesterId,
        requesterName: fr.requesterName,
        requesterCategory: fr.requesterCategory as any,
        requesterPhotoUri: fr.requesterPhotoUri || '',
        destination: fr.destination,
        date: fr.visitDate,
        timeWindow: fr.timeWindow,
        purpose: fr.purpose,
        visitType: fr.visitType,
        status: fr.status as StatusKey,
        targetFacultyId: fr.targetFacultyId,
        targetFacultyName: fr.targetFacultyName,
        targetFacultyPhotoURL: fr.targetFacultyPhotoURL || undefined,
        linkedStudentName: fr.linkedStudentName || undefined,
        vehiclePlate: fr.vehiclePlate || undefined,
        facultyRemarks: fr.facultyRemarks || undefined,
        permitId: fr.permitId || undefined,
        permitQRPayload: fr.permitQRPayload || undefined,
        permitExpiresAt: fr.permitExpiresAt?.toISOString?.() || undefined,
        visitStartAt: fr.visitStartAt || undefined,
        visitEndAt: fr.visitEndAt || undefined,
        visitorName: fr.visitorName || undefined,
        visitorRelation: fr.visitorRelation || undefined,
        checkedInAt: fr.checkedInAt || undefined,
        exitedAt: fr.exitedAt || undefined,
        createdAt: fr.createdAt?.toISOString?.() || new Date().toISOString(),
      })),
    [firestoreRequests]
  );

  /**
   * The permit shown on the home screen: the soonest approved request whose permit has not
   * expired. Derived from server data on every refresh — there is no locally invented
   * permit any more, and no QR the server did not sign.
   */
  const activePermit: Permit | null = useMemo(() => {
    const live = requests
      // Once security signs the visitor out, the permit is spent.
      .filter(
        (r) =>
          r.status === 'approved' && r.permitQRPayload && !r.exitedAt && timeLeft(r.permitExpiresAt)
      )
      .sort((a, b) => (a.visitStartAt || '').localeCompare(b.visitStartAt || ''));

    const next = live[0];
    if (!next) return null;

    return {
      // The request id, so /(main)/permit/[id] can load it.
      id: next.id,
      requestId: next.id,
      destination: next.destination,
      purpose: next.purpose,
      // The name on the permit: the visitor, who may not be the requester.
      requesterName: next.visitorName || next.requesterName,
      date: next.date,
      validityTimeLeft: timeLeft(next.permitExpiresAt) || '00:00:00',
      qrPayload: next.permitQRPayload!,
      isOfflineAvailable: false,
    };
  }, [requests]);

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  // Passes security sent to this account. Polled like requests; only visitors and parents
  // are gate-tracked, so other roles never ask.
  const [gatePasses, setGatePasses] = useState<GatePassItem[]>([]);
  const seenPasses = useRef<Set<string> | null>(null);
  const receivesPasses = role === 'visitor' || role === 'parent';

  const refreshGatePasses = useCallback(async () => {
    if (!user || !receivesPasses) return;
    try {
      const passes = await fetchMyGatePasses();
      setGatePasses(passes);

      // A notification the first time each pass is seen during this session — but not for
      // the ones already there when the app opened.
      const keys = passes.map((p) => p.key);
      if (seenPasses.current === null) {
        seenPasses.current = new Set(keys);
        return;
      }
      const fresh = passes.filter((p) => p.active && !seenPasses.current!.has(p.key));
      fresh.forEach((p) => seenPasses.current!.add(p.key));
      if (fresh.length > 0) {
        setNotifications((n) => [
          ...fresh.map((p) => ({
            id: `notif_${p.key}`,
            type: 'approval' as const,
            title: 'Gate pass received',
            message: `Security sent your ${p.kind === 'regular' ? 'regular pass' : 'gate pass'} (${p.passCode}) to your account.`,
            timestamp: 'Just now',
            read: false,
          })),
          ...n,
        ]);
      }
    } catch (error) {
      console.warn('Gate pass refresh failed:', (error as Error).message);
    }
  }, [user, receivesPasses]);

  useEffect(() => {
    if (!user || !receivesPasses) {
      setGatePasses([]);
      seenPasses.current = null;
      return;
    }
    void refreshGatePasses();
    const timer = setInterval(() => void refreshGatePasses(), 30 * 1000);
    return () => clearInterval(timer);
  }, [user, receivesPasses, refreshGatePasses]);

  // One notification the first time each request is seen approved during this session.
  const seenApproved = useRef<Set<string> | null>(null);

  // Everything here belongs to one account. When the account changes - sign-out, or a
  // different person signing in on the same phone - start again from that account's own
  // saved vehicles and an empty notification list.
  const accountId = user?.uid || user?.id || null;
  const vehiclesKey = accountId ? `@vision_vehicles_${accountId}` : null;
  const vehiclesLoaded = useRef(false);

  useEffect(() => {
    setNotifications([]);
    seenApproved.current = null;
    vehiclesLoaded.current = false;
    setVehicles([]);
    if (!vehiclesKey) return;

    let cancelled = false;
    AsyncStorage.getItem(vehiclesKey)
      .then((raw) => {
        if (cancelled) return;
        const saved = raw ? JSON.parse(raw) : [];
        setVehicles(Array.isArray(saved) ? saved : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) vehiclesLoaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [vehiclesKey]);

  // Saved after every change, but only once this account's list has loaded - otherwise the
  // empty list shown while loading would overwrite what is stored.
  useEffect(() => {
    if (!vehiclesKey || !vehiclesLoaded.current) return;
    AsyncStorage.setItem(vehiclesKey, JSON.stringify(vehicles)).catch(() => {});
  }, [vehicles, vehiclesKey]);
  useEffect(() => {
    if (requestsLoading) return;

    const approvedIds = requests.filter((r) => r.status === 'approved').map((r) => r.id);

    // First load: remember what is already approved, without announcing old approvals.
    if (seenApproved.current === null) {
      seenApproved.current = new Set(approvedIds);
      return;
    }

    const fresh = requests.filter(
      (r) => r.status === 'approved' && !seenApproved.current!.has(r.id)
    );
    if (fresh.length === 0) return;

    fresh.forEach((r) => seenApproved.current!.add(r.id));
    setNotifications((n) => [
      ...fresh.map((r) => ({
        id: `notif_${r.id}`,
        type: 'approval' as const,
        title: 'Request Approved!',
        message: `Your request for ${r.destination} was approved. Your permit is ready.`,
        timestamp: 'Just now',
        read: false,
      })),
      ...n,
    ]);
  }, [requests, requestsLoading]);

  const addVisitRequest = async (requestData: NewVisitRequest) => {
    if (!user) {
      throw new Error('User must be authenticated to submit visit requests');
    }

    // Only what the visit is and who it is for. The server fills in the requester from the
    // signed-in account and the host's name and photo from the faculty directory.
    const visitRequestInput: VisitRequestInput = {
      destination: requestData.destination,
      purpose: requestData.purpose,
      visitType: requestData.visitType,
      visitDate: requestData.date,
      timeWindow: requestData.timeWindow,
      visitStartAt: requestData.visitStartAt,
      visitEndAt: requestData.visitEndAt,
      targetFacultyId: requestData.targetFacultyId,
      vehiclePlate: requestData.vehiclePlate || undefined,
      linkedStudentName: requestData.linkedStudentName,
      sponsoredVisitor: requestData.sponsoredVisitor,
    };

    const requestId = await submitVisitRequest(visitRequestInput);

    // Add notification
    const newNotif: NotificationItemData = {
      id: `notif_${Date.now()}`,
      type: 'info',
      title: 'Visit Request Submitted',
      message: `Your request to visit ${requestData.destination} has been sent for approval.`,
      timestamp: 'Just now',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // Immediate feedback; the next refresh replaces this with the server's copy.
    return {
      ...requestData,
      requesterId: requestData.requesterId || user.id,
      requesterName: requestData.requesterName || user.name || '',
      requesterCategory: (requestData.requesterCategory || 'general') as any,
      requesterPhotoUri: requestData.requesterPhotoUri || '',
      targetFacultyName: requestData.targetFacultyName || '',
      id: requestId,
      status: 'pending' as StatusKey,
      createdAt: new Date().toISOString(),
    };
  };

  const cancelVisitRequest = async (requestId: string) => {
    if (!user) {
      throw new Error('User must be authenticated to cancel visit requests');
    }

    await cancelRequest(requestId, user.id, user.name || user.email || 'Unknown User');
    
    // Local state will be updated by the real-time listener in useVisitRequests
    // Add notification
    setNotifications((n) => [
      {
        id: `notif_${Date.now()}`,
        type: 'info',
        title: 'Request Cancelled',
        message: 'Your visit request has been cancelled.',
        timestamp: 'Just now',
        read: false,
      },
      ...n,
    ]);
  };

  const updateRequestStatus = (requestId: string, status: StatusKey, remarks?: string) => {
    // This function is kept for backwards compatibility with faculty approval UI
    // In practice, faculty will use approveVisitRequest/rejectVisitRequest directly
    console.warn('updateRequestStatus called - faculty should use approve/reject functions directly');
  };

  const addVehicle = (vehicle: Omit<Vehicle, 'id'>) => {
    const newId = `veh_${Date.now()}`;
    const newVeh = { ...vehicle, id: newId };
    setVehicles((prev) => {
      if (newVeh.isDefault) {
        return [newVeh, ...prev.map((v) => ({ ...v, isDefault: false }))];
      }
      return [newVeh, ...prev];
    });
  };

  const removeVehicle = (vehicleId: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
  };

  const setDefaultVehicle = (vehicleId: string) => {
    setVehicles((prev) =>
      prev.map((v) => ({ ...v, isDefault: v.id === vehicleId }))
    );
  };

  const markNotificationRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  };

  return (
    <AppContext.Provider
      value={{
        requests,
        gatePasses,
        refreshGatePasses,
        activePermit,
        requestsLoading,
        vehicles,
        notifications,
        unreadNotificationCount,
        addVisitRequest,
        cancelVisitRequest,
        updateRequestStatus,
        addVehicle,
        removeVehicle,
        setDefaultVehicle,
        markNotificationRead,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
