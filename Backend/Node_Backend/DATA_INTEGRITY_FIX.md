# Data Integrity Fix - Visit Request System

## Issue Summary

**Date**: October 8, 2026  
**Reported By**: User testing flow with sapfire955@gmail.com (visitor) and Dr. Sibi Chakkaravarthy S (faculty)

### Problems Identified

1. **Visitor Issue**: Only 1 of 3 approved requests visible in visitor app
2. **Faculty Issue**: Faculty inbox showing empty (no pending requests)

---

## Root Cause Analysis

### Issue 1: Visitor Request Mismatch (FIXED ✅)

**Problem**: Visit requests had wrong `requesterId` field

- **Current User ID**: `31dih5uBjqacLLwurFCyE7WsmnT2`
- **Request's requesterId**: `MaDRHpa8qXY12BXDduL1OVLeX7h1` (old ID)
- **Result**: Backend query `where('requesterId', '==', uid)` returned 0 matches

**Root Cause**: User signed out and signed in again with a new Firebase Auth UID, but old visit requests still referenced the previous user ID.

**How It Happened**:
1. User created 3 visit requests while signed in with one Firebase Auth account
2. User signed out and signed in again, receiving a new Firebase Auth UID
3. The `users` collection document ID changed to match the new UID
4. Old visit requests still had `requesterId` pointing to the old, now-invalid user ID

**Fix Applied**: 
```bash
npx tsx src/scripts/fix-visitor-requester-ids.ts
```

Updated all 3 requests:
- Request `Z2HCf55tNWj6dgJQmZzt` (Student Activity Centre)
- Request `qOZK1Z86NZwGSvoxo5iT` (Academic Block-2)
- Request `vDx5c16sYg48D8qwraH0` (Central Block)

Changed `requesterId` from `MaDRHpa8qXY12BXDduL1OVLeX7h1` → `31dih5uBjqacLLwurFCyE7WsmnT2`

**Verification**: 
```bash
npx tsx src/scripts/debug-visitor-requests.ts
```
Now shows all 3 requests with ✅ MATCHES indicator.

---

### Issue 2: Faculty Inbox Empty (ROOT CAUSE IDENTIFIED)

**Problem**: Faculty member (Dr. Sibi Chakkaravarthy S) inbox shows empty despite 3 requests targeting them

**Database State**:
- Faculty document `sibi870084` exists with `uid = 'faculty_sibi870084'`
- NO user document exists with ID `faculty_sibi870084`
- NO user document exists with email `chakkaravarthy.sibi@vitap.ac.in`

**Root Cause**: Faculty member has NEVER signed in to the app

**Backend Flow**:
1. Faculty opens inbox → calls `visitAPI.inbox(token, 'pending')`
2. Backend extracts `uid` from Firebase Auth token
3. Backend calls `resolveFacultyForUser(uid)` to find faculty record
4. `resolveFacultyForUser()` logic:
   - First tries: `where('uid', '==', uid)` → no match (no user doc exists)
   - Fallback: `where('employeeIdClaim', '==', employeeIdFromToken.toLowerCase())` → no match
   - Returns `null`
5. Since faculty cannot be resolved, inbox query is never executed
6. Result: empty inbox

**Solution Required**: 
Dr. Sibi must sign in to the mobile app at least once to create the user document that links their Firebase Auth UID to the faculty record.

**Alternative Fix** (if faculty cannot sign in immediately):
Manually create a user document that matches the faculty record's UID. However, this is NOT recommended as it bypasses proper authentication flow.

---

## Scripts Created

### 1. `debug-visitor-requests.ts`
Diagnostic script to check visitor's request data integrity:
- Finds user by email
- Queries requests by document ID
- Queries requests by uid (if different)
- Queries requests by email to find all matches
- Shows requesterId mismatches

### 2. `fix-visitor-requester-ids.ts`
Fix script for requesterId mismatches:
- Finds current user document
- Finds all requests with matching email but wrong requesterId
- Updates requesterId to match current user ID
- Uses batch write for atomic updates

### 3. `debug-dr-sibi-inbox.ts`
Diagnostic script for faculty inbox issues:
- Checks faculty document and UID field
- Verifies user document exists for the UID
- Searches for user by email
- Lists all visit requests targeting the faculty

### 4. `fix-dr-sibi-uid.ts`
Script to link faculty UID (specific to Dr. Sibi):
- Looks up faculty document
- Finds matching auth user by email and role
- Updates faculty document with correct UID

### 5. `fix-faculty-uid-links.ts`
Bulk script to fix all faculty UID links (592 records):
- Processes all faculty documents
- For each missing UID, finds matching auth user
- Updates faculty document with correct UID
- Note: Takes 2+ minutes to run, timed out at 120s

---

## Prevention Strategies

### For Visitor Request Issue

**Problem**: User ID changes when signing out/in create orphaned requests

**Solutions**:

1. **Email-based lookups** (Recommended):
   - Add compound index: `requesterId` + `requesterEmail` + `createdAt`
   - Query by email as fallback when uid query returns 0 results
   - Update returned requests' `requesterId` inline before returning

2. **Migration script on login**:
   - On successful login, check for orphaned requests by email
   - Automatically update their `requesterId` to current UID
   - Run as part of `staff.service.ts:ensureStaffAuthUser()` or similar

3. **Persistent user IDs**:
   - Store a separate `permanentUserId` that never changes
   - Use this for `requesterId` instead of Firebase Auth UID
   - Map Auth UID → permanent ID in users collection

### For Faculty Inbox Issue

**Problem**: Faculty document created before user signs in

**Solutions**:

1. **Eager user creation** (Recommended):
   - When faculty is added to `faculty` collection, also create `users` document
   - Set `uid` to match document ID initially
   - Update `uid` when faculty first signs in

2. **Lazy resolution with email fallback**:
   - Update `resolveFacultyForUser()` to also search by email
   - Add query: `where('email', '==', userEmail)`
   - Requires composite index and user email from token

3. **Force first login**:
   - Require all faculty to complete onboarding before accepting requests
   - Block request submission if target faculty has no user document

---

## Status Values Reference

Visit request status lifecycle:

1. **pending** - Initial state after submission
2. **approved** - Faculty approved the request, permit issued
3. **permit_active** - Visitor activated permit at gate (after biometric verification)
4. **rejected** - Faculty rejected the request
5. **cancelled** - Requester cancelled the request

Note: `permit_active` is set by `/api/security/activate-permit` after biometric check at gate.

---

## Testing Verification

### Visitor Side (sapfire955@gmail.com)
- ✅ Backend returns all 3 requests
- ✅ All requests have matching `requesterId`
- ✅ All requests visible in mobile app
- ✅ Filter logic handles `permit_active` status correctly

### Faculty Side (Dr. Sibi Chakkaravarthy S)
- ⚠️ Faculty has never signed in
- ❌ No user document exists
- ❌ `resolveFacultyForUser()` returns null
- ❌ Inbox query never executes
- **Action Required**: Faculty must sign in to create user document

---

## Files Modified

### Backend
- `Backend/Node_Backend/src/services/visit.service.ts` - Added temporary logging (removed)

### Frontend
- `ReactNative_App/VISION/src/services/visitRequest.service.ts` - Added temporary logging (removed)
- `ReactNative_App/VISION/src/hooks/useVisitRequests.ts` - Added temporary logging (removed)
- `ReactNative_App/VISION/src/app/(main)/requests/index.tsx` - Added temporary logging (removed)

### Scripts Created
- `Backend/Node_Backend/src/scripts/debug-visitor-requests.ts`
- `Backend/Node_Backend/src/scripts/fix-visitor-requester-ids.ts`
- `Backend/Node_Backend/src/scripts/debug-dr-sibi-inbox.ts`
- `Backend/Node_Backend/src/scripts/fix-dr-sibi-uid.ts`
- `Backend/Node_Backend/src/scripts/fix-faculty-uid-links.ts`

---

## Next Steps

1. ✅ Visitor issue resolved - requests now visible
2. ⏳ Faculty must sign in to create user document
3. 🔄 Consider implementing email-based fallback for request queries
4. 🔄 Consider eager user creation for new faculty members
5. 📊 Audit other users/faculty for similar UID mismatches
