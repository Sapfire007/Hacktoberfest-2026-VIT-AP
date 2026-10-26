# 🔥 Firestore Faculty Integration

## ✅ What Changed

The app now fetches **real faculty data from Firestore** instead of using hardcoded mock data.

---

## 📁 New Files Created

### 1. **Faculty Service** (`src/services/faculty.service.ts`)
Handles fetching and caching faculty from Firestore.

**Features:**
- ✅ Fetch all active faculty
- ✅ In-memory caching (5 minutes)
- ✅ Search by name, department, designation
- ✅ Filter by mentor status
- ✅ Automatic cache refresh

**Functions:**
```typescript
getAllFaculty(forceRefresh?: boolean): Promise<FacultyMember[]>
searchFacultyByQuery(query: string): Promise<FacultyMember[]>
getFacultyByUsername(username: string): Promise<FacultyMember | null>
getFacultyByDepartment(department: string): Promise<FacultyMember[]>
getMentors(): Promise<FacultyMember[]>
clearFacultyCache(): void
```

### 2. **Faculty Hook** (`src/hooks/useFaculty.ts`)
React hook for easy faculty data management.

**Usage:**
```typescript
import { useFaculty } from '@/hooks/useFaculty';

const { faculty, loading, error, refresh } = useFaculty();
```

---

## 🔄 Updated Components

### 1. **New Request Screen** (`app/(main)/requests/new.tsx`)

**Before:**
```typescript
const [selectedFaculty, setSelectedFaculty] = useState(MOCK_FACULTY_DIRECTORY[0]);
```

**After:**
```typescript
const { faculty, loading, error, refresh } = useFaculty();
const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
```

**New Features:**
- ✅ Loading state while fetching
- ✅ Error handling with retry button
- ✅ Empty state message
- ✅ Auto-select first faculty

### 2. **Faculty Search Picker** (`components/ui/FacultySearchPicker.tsx`)

**New Prop:**
```typescript
fetchFromFirestore?: boolean  // Fetch from Firestore instead of prop
```

**Usage (Firestore):**
```typescript
<FacultySearchPicker
  fetchFromFirestore={true}
  selectedFaculty={selected}
  onSelect={setSelected}
/>
```

**Usage (Custom Data):**
```typescript
<FacultySearchPicker
  faculty={customFacultyList}
  selectedFaculty={selected}
  onSelect={setSelected}
/>
```

---

## 🚀 How to Use

### Option 1: Use the Hook (Recommended)

```typescript
import { useFaculty } from '@/hooks/useFaculty';

function MyComponent() {
  const { faculty, loading, error, refresh } = useFaculty();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} onRetry={refresh} />;

  return (
    <FacultyList faculty={faculty} />
  );
}
```

### Option 2: Use the Service Directly

```typescript
import { getAllFaculty } from '@/services/faculty.service';

async function loadFaculty() {
  try {
    const faculty = await getAllFaculty();
    console.log(`Loaded ${faculty.length} faculty members`);
  } catch (error) {
    console.error('Failed to load faculty:', error);
  }
}
```

### Option 3: Use FacultySearchPicker Component

```typescript
<FacultySearchPicker
  fetchFromFirestore={true}
  selectedFaculty={selectedFaculty}
  onSelect={setSelectedFaculty}
  placeholder="Search faculty..."
/>
```

---

## 🔍 Fuzzy Search Still Works!

The fuzzy search works with Firestore data automatically:

```typescript
import { searchFaculty } from '@/utils/fuzzySearch';
import { useFaculty } from '@/hooks/useFaculty';

function SearchComponent() {
  const { faculty } = useFaculty();
  const [query, setQuery] = useState('');

  // Fuzzy search with typo tolerance
  const results = searchFaculty(faculty, query);

  return (
    <Input 
      value={query}
      onChangeText={setQuery}
      placeholder="Search (typos OK!)"
    />
  );
}
```

**Examples:**
- Query: `"Dr Verna"` (typo) → Finds real faculty `"Dr. XYZ Verma"`
- Query: `"Kumar Anil"` → Finds `"Dr. Anil Kumar"`
- Query: `"Computer Science"` → Finds all SCOPE faculty

---

## 📊 Data Structure

**Firestore Collection:** `faculty`
**Document ID:** `{username}`

**Faculty Document:**
```typescript
{
  username: string;         // "srinivas170004"
  name: string;            // "Dr. Srinivas S"
  email: string;           // "srinivas.s@vitap.ac.in"
  department: string;      // "School of Advanced Science (SAS)"
  designation?: string;    // "Professor"
  employeeId?: string;     // "1.70004"
  isMentor?: boolean;      // true/false
  status: string;          // "active"
  // ... other fields
}
```

**App Faculty Type:**
```typescript
interface FacultyMember {
  id: string;              // Document ID (username)
  username: string;
  name: string;
  email: string;
  department: string;
  designation?: string;
  employeeId?: string;
  isMentor?: boolean;
  photoUri?: string;       // Auto-generated from name
  status?: string;
}
```

---

## ⚡ Caching

### How It Works

1. **First fetch:** Queries Firestore (~200ms)
2. **Subsequent fetches:** Returns cached data (instant)
3. **Cache expires:** After 5 minutes
4. **Auto-refresh:** On next fetch after expiry

### Manual Cache Control

```typescript
import { clearFacultyCache } from '@/services/faculty.service';

// Clear cache when faculty data changes
clearFacultyCache();

// Force refresh
const faculty = await getAllFaculty(true);
```

### Cache Info (Debugging)

```typescript
import { getCacheInfo } from '@/services/faculty.service';

const info = getCacheInfo();
console.log(`Cached: ${info.isCached}, Count: ${info.count}, Age: ${info.age}ms`);
```

---

## 🔧 Firebase Query

The service uses this Firestore query:

```typescript
const q = query(
  collection(db, 'faculty'),
  where('status', '==', 'active'),
  orderBy('name', 'asc')
);
```

**Indexes Required:**
- Composite index on `(status, name)` - **Firebase will create automatically**

---

## 🐛 Troubleshooting

### Issue: "No faculty found"

**Possible causes:**
1. Migration script not run yet
2. No faculty marked as "active" in Firestore
3. Firebase connection issue

**Solution:**
1. Check Firebase Console → Firestore → `faculty` collection
2. Verify faculty documents exist
3. Check `status` field is `"active"`
4. Run migration if needed: `node scripts/migrate-faculty-to-firestore.js`

### Issue: Loading forever

**Possible causes:**
1. Firebase not initialized
2. Network connectivity issue
3. Firestore rules blocking read access

**Solution:**
1. Check `src/config/firebase.ts` is configured
2. Verify internet connection
3. Check Firebase Console → Firestore → Rules

**Temporary fix (dev only):**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /faculty/{document=**} {
      allow read: if true;  // Allow read for testing
    }
  }
}
```

### Issue: Faculty shows but search doesn't work

**Possible causes:**
1. Search query too strict (threshold too high)
2. Faculty data missing expected fields

**Solution:**
1. Lower threshold: `searchFaculty(faculty, query, { threshold: 0.2 })`
2. Check faculty documents have `name` and `department` fields

---

## 📝 Migration Checklist

- [ ] Run faculty migration script
- [ ] Verify data in Firebase Console
- [ ] Test faculty list loads in app
- [ ] Test fuzzy search with typos
- [ ] Test faculty selection
- [ ] Test request creation with real faculty

---

## 🔄 Fallback to Mock Data (Optional)

If you want to temporarily use mock data while testing:

```typescript
import { MOCK_FACULTY_DIRECTORY } from '@/data/mockData';

// Use mock data
const faculty = MOCK_FACULTY_DIRECTORY;

// OR conditionally
const { faculty, loading } = useFaculty();
const facultyToUse = faculty.length > 0 ? faculty : MOCK_FACULTY_DIRECTORY;
```

---

## 🎉 Benefits

### Before (Mock Data):
- ❌ Hardcoded 4 faculty members
- ❌ No real data
- ❌ Had to update code to add faculty
- ❌ Not synced with backend

### After (Firestore):
- ✅ Real faculty data from database
- ✅ 200+ faculty members available
- ✅ Auto-updates when migration runs
- ✅ Synced with backend
- ✅ Cached for performance
- ✅ Fuzzy search works with real names

---

## 📚 Complete Example

```typescript
import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useFaculty } from '@/hooks/useFaculty';
import { searchFaculty } from '@/utils/fuzzySearch';

export default function FacultyListScreen() {
  const { faculty, loading, error, refresh } = useFaculty();
  const [searchQuery, setSearchQuery] = React.useState('');

  // Apply fuzzy search
  const filteredFaculty = searchQuery.trim()
    ? searchFaculty(faculty, searchQuery).map(r => r.item)
    : faculty;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Loading faculty from Firestore...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error: {error.message}</Text>
        <Button title="Retry" onPress={refresh} />
      </View>
    );
  }

  if (faculty.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No faculty found</Text>
        <Text>Please run the migration script</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search faculty (typos OK)..."
      />
      
      <Text>Found {filteredFaculty.length} faculty members</Text>
      
      <FlatList
        data={filteredFaculty}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.name}</Text>
            <Text>{item.department}</Text>
            {item.designation && <Text>{item.designation}</Text>}
          </View>
        )}
      />
    </View>
  );
}
```

---

**🎉 You're all set!** The app now uses real faculty data from Firestore with fuzzy search.
