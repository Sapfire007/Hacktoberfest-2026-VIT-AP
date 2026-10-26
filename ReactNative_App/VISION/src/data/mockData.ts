/**
 * VISION App — Comprehensive Mock Data
 * 
 * Mock dataset covering users, faculty directory, visit requests, permits,
 * vehicles, notifications, and advisees matching PRD.md schema & Stitch designs.
 */

import { StatusKey, CategoryKey } from '@/constants/colors';

export interface UserProfile {
  id: string;
  uid?: string; // Firebase UID
  username?: string; // Faculty username
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  phone: string;
  email: string;
  // Matches the backend's role vocabulary exactly (VISION.md section 3). The app used to
  // carry its own set ('requester' | 'approver' | ...) and remap on the way in, which
  // silently collapsed faculty, security and admin into one bucket.
  role: 'visitor' | 'parent' | 'student' | 'faculty' | 'security' | 'admin';
  employeeId?: string;
  requesterType?: 'visitor' | 'parent_guardian';
  visitorSubtype?: 'general' | 'alumni' | 'vendor' | 'guest_faculty' | 'external_student';
  profilePhotoUri?: string;
  photoUri?: string;
  biometricEnrolled: boolean;
  profileComplete?: boolean; // Whether user completed onboarding form
  govtIdUploaded?: boolean; // Whether user uploaded government ID
  govtIdType?: string;
  govtIdMasked?: string;
  identityProof?: {
    idType: string;
    documentName: string;
    mimeType: string;
    fileSize?: number;
    documentUri?: string;
    storageUri?: string;
    uploadedAt?: string;
  };
  linkedStudents?: { id: string; name: string; regNo: string; mentorId: string }[];
  department?: string;
  designation?: string;
  isMentor?: boolean;
}

export interface VisitRequest {
  id: string;
  destination: string;
  purpose: string;
  visitType: string;
  requesterId: string;
  requesterName: string;
  requesterCategory: CategoryKey;
  requesterPhotoUri: string;
  targetFacultyId: string;
  targetFacultyName: string;
  targetFacultyPhotoURL?: string; // Faculty profile photo
  linkedStudentName?: string;
  date: string;
  timeWindow: string;
  status: StatusKey;
  vehiclePlate?: string;
  facultyRemarks?: string;
  createdAt: string;
  permitId?: string;
  /** ISO start/end of the visit window. */
  visitStartAt?: string;
  visitEndAt?: string;
  /** Signed permit token — what the permit QR encodes. Present once approved. */
  permitQRPayload?: string;
  /** ISO time the permit stops being valid. */
  permitExpiresAt?: string;
  /** Who comes to the gate — differs from the requester when a student sponsors a parent. */
  visitorName?: string;
  visitorRelation?: string;
  /** ISO times security checked the permit in and out. */
  checkedInAt?: string;
  exitedAt?: string;
}

export interface Permit {
  id: string;
  requestId: string;
  destination: string;
  purpose: string;
  requesterName: string;
  date: string;
  validityTimeLeft: string;
  qrPayload: string;
  isOfflineAvailable: boolean;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleType: '2-wheeler' | '4-wheeler' | 'other';
  model: string;
  color: string;
  isDefault: boolean;
}

export interface FacultyMember {
  id: string;
  name: string;
  department: string;
  designation: string;
  photoUri: string;
  isMentor: boolean;
}

export interface NotificationItemData {
  id: string;
  type: 'approval' | 'rejection' | 'entry' | 'exit' | 'alert' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// ─── Initial Mock Users ──────────────────────────────────────

export const MOCK_USERS: Record<string, UserProfile> = {
  alex: {
    id: 'usr_alex',
    name: 'Alex Morgan',
    phone: '+91 98765 43210',
    email: 'alex.m@example.com',
    role: 'visitor',
    requesterType: 'visitor',
    visitorSubtype: 'guest_faculty',
    profilePhotoUri: 'https://picsum.photos/id/64/300/300',
    biometricEnrolled: true,
    govtIdType: 'Aadhaar',
    govtIdMasked: 'XXXX-XXXX-8921',
  },
  ramesh: {
    id: 'usr_ramesh',
    name: 'Ramesh Kumar',
    phone: '+91 98123 45678',
    email: 'ramesh.k@example.com',
    role: 'parent',
    requesterType: 'parent_guardian',
    profilePhotoUri: 'https://picsum.photos/id/1005/300/300',
    biometricEnrolled: true,
    linkedStudents: [
      { id: 'std_rahul', name: 'Rahul K.', regNo: '24BCE7012', mentorId: 'fac_dr_verma' },
    ],
  },
  priya: {
    id: 'usr_priya',
    name: 'Priya Sharma',
    phone: '+91 97654 32109',
    email: 'priya.delivery@amazon.in',
    role: 'visitor',
    requesterType: 'visitor',
    visitorSubtype: 'vendor',
    profilePhotoUri: 'https://picsum.photos/id/1027/300/300',
    biometricEnrolled: true,
  },
  dr_verma: {
    id: 'fac_dr_verma',
    name: 'Dr. Anil Verma',
    phone: '+91 94321 87654',
    email: 'anil.verma@vitap.ac.in',
    role: 'faculty',
    department: 'School of Computer Science & Engineering',
    designation: 'Professor & Student Mentor',
    photoUri: 'https://picsum.photos/id/1012/300/300',
    isMentor: true,
    biometricEnrolled: true,
  },
  ananya: {
    id: 'std_ananya',
    name: 'Ananya S.',
    phone: '+91 91234 56789',
    email: 'ananya.24bce7033@vitap.ac.in',
    role: 'student',
    profilePhotoUri: 'https://picsum.photos/id/338/300/300',
    biometricEnrolled: false,
  },
};

// ─── Faculty Directory ───────────────────────────────────────

export const MOCK_FACULTY_DIRECTORY: FacultyMember[] = [
  {
    id: 'fac_dr_verma',
    name: 'Dr. Anil Verma',
    department: 'Computer Science & Eng. (SCOPE)',
    designation: 'Professor & Dean',
    photoUri: 'https://picsum.photos/id/1012/300/300',
    isMentor: true,
  },
  {
    id: 'fac_dr_rao',
    name: 'Dr. B. K. Rao',
    department: 'Electronics & Comm. (SENSE)',
    designation: 'Associate Professor',
    photoUri: 'https://picsum.photos/id/1025/300/300',
    isMentor: true,
  },
  {
    id: 'fac_dr_mehta',
    name: 'Dr. Sneha Mehta',
    department: 'Mechanical Engineering (SMEC)',
    designation: 'Assistant Professor',
    photoUri: 'https://picsum.photos/id/1062/300/300',
    isMentor: false,
  },
  {
    id: 'fac_dr_sharma',
    name: 'Dr. R. C. Sharma',
    department: 'Physics & Sciences (SAS)',
    designation: 'HOD Science Dept',
    photoUri: 'https://picsum.photos/id/1074/300/300',
    isMentor: true,
  },
];

// ─── Initial Visit Requests ──────────────────────────────────

export const MOCK_VISIT_REQUESTS: VisitRequest[] = [
  {
    id: '48593-A',
    destination: 'Academic Block 1',
    purpose: 'Guest Lecture Attendance',
    visitType: 'Meeting',
    requesterId: 'usr_alex',
    requesterName: 'Alex Morgan',
    requesterCategory: 'guest_faculty',
    requesterPhotoUri: 'https://picsum.photos/id/64/300/300',
    targetFacultyId: 'fac_dr_verma',
    targetFacultyName: 'Dr. Anil Verma',
    date: 'Oct 24, 2023',
    timeWindow: '09:00 AM - 01:00 PM',
    status: 'approved',
    vehiclePlate: 'AP16 BY 4455',
    createdAt: '2023-10-24T08:30:00Z',
    permitId: 'PERMIT-48593-A',
  },
  {
    id: 'REQ-102',
    destination: 'Main Admin Building',
    purpose: 'Meeting with Dean',
    visitType: 'Official Meeting',
    requesterId: 'usr_alex',
    requesterName: 'Alex Morgan',
    requesterCategory: 'general',
    requesterPhotoUri: 'https://picsum.photos/id/64/300/300',
    targetFacultyId: 'fac_dr_verma',
    targetFacultyName: 'Dr. Anil Verma',
    date: 'Oct 24, 2023',
    timeWindow: '09:00 AM',
    status: 'approved',
    createdAt: '2023-10-24T08:00:00Z',
  },
  {
    id: 'REQ-103',
    destination: 'Research Labs',
    purpose: 'Equipment Inspection',
    visitType: 'Maintenance',
    requesterId: 'usr_alex',
    requesterName: 'Alex Morgan',
    requesterCategory: 'vendor',
    requesterPhotoUri: 'https://picsum.photos/id/64/300/300',
    targetFacultyId: 'fac_dr_rao',
    targetFacultyName: 'Dr. B. K. Rao',
    date: 'Oct 26, 2023',
    timeWindow: '02:00 PM',
    status: 'pending',
    createdAt: '2023-10-24T07:45:00Z',
  },
  {
    id: 'REQ-104',
    destination: 'Central Library',
    purpose: 'Archival Research',
    visitType: 'Research',
    requesterId: 'usr_alex',
    requesterName: 'Alex Morgan',
    requesterCategory: 'alumni',
    requesterPhotoUri: 'https://picsum.photos/id/64/300/300',
    targetFacultyId: 'fac_dr_sharma',
    targetFacultyName: 'Dr. R. C. Sharma',
    date: 'Oct 20, 2023',
    timeWindow: '10:00 AM',
    status: 'rejected',
    facultyRemarks: 'Faculty unavailable during scheduled hours due to exam invigilation.',
    createdAt: '2023-10-19T14:20:00Z',
  },
  {
    id: 'REQ-201',
    destination: 'Student Hostel Block C',
    purpose: 'Medical emergency / document pickup',
    visitType: 'Parent Visit',
    requesterId: 'usr_ramesh',
    requesterName: 'Ramesh Kumar',
    requesterCategory: 'parent',
    requesterPhotoUri: 'https://picsum.photos/id/1005/300/300',
    targetFacultyId: 'fac_dr_verma',
    targetFacultyName: 'Dr. Anil Verma (Mentor)',
    linkedStudentName: 'Rahul K.',
    date: 'Today',
    timeWindow: '11:00 AM - 04:00 PM',
    status: 'pending',
    createdAt: '2023-10-24T08:58:00Z',
  },
  {
    id: 'REQ-202',
    destination: 'Block B Laboratory',
    purpose: 'Delivering lab equipment to Block B',
    visitType: 'Vendor Delivery',
    requesterId: 'usr_priya',
    requesterName: 'Priya Sharma',
    requesterCategory: 'vendor',
    requesterPhotoUri: 'https://picsum.photos/id/1027/300/300',
    targetFacultyId: 'fac_dr_mehta',
    targetFacultyName: 'Dr. Sneha Mehta',
    date: 'Today',
    timeWindow: '10:30 AM',
    status: 'pending',
    createdAt: '2023-10-24T08:45:00Z',
  },
];

// ─── Initial Active Permit ────────────────────────────────────

export const MOCK_ACTIVE_PERMIT: Permit = {
  id: 'PERMIT-48593-A',
  requestId: '48593-A',
  destination: 'Academic Block 1',
  purpose: 'Guest Lecture Attendance',
  requesterName: 'Alex Morgan',
  date: 'Oct 24, 2023',
  validityTimeLeft: '02:45:00',
  qrPayload: 'VISION-PERMIT-48593-A-HASH-8921-VITAP',
  isOfflineAvailable: true,
};

// ─── Initial User Vehicles ───────────────────────────────────

export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'veh_1',
    plateNumber: 'AP16 BY 4455',
    vehicleType: '4-wheeler',
    model: 'Hyundai Creta',
    color: 'White',
    isDefault: true,
  },
  {
    id: 'veh_2',
    plateNumber: 'AP39 EQ 1234',
    vehicleType: '2-wheeler',
    model: 'Royal Enfield Classic',
    color: 'Black',
    isDefault: false,
  },
];

// ─── Initial Notifications ───────────────────────────────────

export const MOCK_NOTIFICATIONS: NotificationItemData[] = [
  {
    id: 'notif_1',
    type: 'approval',
    title: 'Visit Request Approved',
    message: 'Dr. Anil Verma approved your visit request to Academic Block 1.',
    timestamp: '10m ago',
    read: false,
  },
  {
    id: 'notif_2',
    type: 'info',
    title: 'Permit Generated',
    message: 'Your digital permit PERMIT-48593-A is ready and cached offline.',
    timestamp: '8m ago',
    read: false,
  },
  {
    id: 'notif_3',
    type: 'rejection',
    title: 'Request Declined',
    message: 'Dr. R. C. Sharma was unable to approve your request for Oct 20.',
    timestamp: '2 days ago',
    read: true,
  },
];
