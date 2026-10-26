# 🏗️ VISION System Architecture

## Complete System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          VISION CAMPUS ACCESS SYSTEM                     │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│   React Native App       │
│   (Expo / TypeScript)    │
└────────┬─────────────────┘
         │
         │ User Interface
         │
    ┌────▼──────────────────────────────────────────────────────┐
    │                                                            │
    │  ┌─────────────────┐  ┌──────────────────────────────┐  │
    │  │ Biometric       │  │ Faculty Search               │  │
    │  │ Capture         │  │ (Fuzzy + Vector)             │  │
    │  │                 │  │                              │  │
    │  │ • Camera API    │  │ • Levenshtein Distance      │  │
    │  │ • Face Detection│  │ • N-gram Similarity         │  │
    │  │ • Image Capture │  │ • Phonetic Matching         │  │
    │  │ • Compression   │  │ • Token-based Matching      │  │
    │  └────────┬────────┘  └────────┬─────────────────────┘  │
    │           │                    │                          │
    └───────────┼────────────────────┼──────────────────────────┘
                │                    │
                │ Base64             │ Search Query
                │ Image              │
                │                    │
         ┌──────▼────────────────────▼──────────────────────┐
         │                                                   │
         │            Firebase Services                      │
         │                                                   │
         │  ┌───────────────────────────────────────────┐  │
         │  │         Cloud Firestore                   │  │
         │  │                                           │  │
         │  │  users/{userId}/                         │  │
         │  │  ├── identityProof/                      │  │
         │  │  │   ├── dataUri (base64 image)         │  │
         │  │  │   ├── capturedAt                      │  │
         │  │  │   └── mimeType                        │  │
         │  │  │                                        │  │
         │  │  faculty/{username}/                     │  │
         │  │  ├── name                                │  │
         │  │  ├── email                               │  │
         │  │  ├── department                          │  │
         │  │  ├── passwordHash (Argon2id)            │  │
         │  │  ├── role: "faculty"                    │  │
         │  │  └── status: "active"                   │  │
         │  │                                           │  │
         │  │  requests/{requestId}/                   │  │
         │  │  └── (visit request data)                │  │
         │  └───────────────────────────────────────────┘  │
         │                                                   │
         │  ┌───────────────────────────────────────────┐  │
         │  │     Firebase Authentication               │  │
         │  │     (User login & session management)     │  │
         │  └───────────────────────────────────────────┘  │
         │                                                   │
         └───────────────────┬───────────────────────────────┘
                             │
                             │ Admin SDK
                             │
              ┌──────────────▼──────────────────────────────┐
              │                                              │
              │      Node.js Backend Server                  │
              │      (Express.js)                            │
              │                                              │
              │  ┌────────────────────────────────────────┐ │
              │  │  Faculty Migration Service             │ │
              │  │                                        │ │
              │  │  • Read JSON data                     │ │
              │  │  • Hash passwords (Argon2id)          │ │
              │  │  • Batch write to Firestore          │ │
              │  │  • Error handling & logging           │ │
              │  └────────────────────────────────────────┘ │
              │                                              │
              │  ┌────────────────────────────────────────┐ │
              │  │  Faculty Search Service                │ │
              │  │                                        │ │
              │  │  • Fuzzy matching algorithms          │ │
              │  │  • In-memory caching (5 min)          │ │
              │  │  • Firestore queries                  │ │
              │  │  • REST API endpoints                 │ │
              │  └────────────────────────────────────────┘ │
              │                                              │
              │  ┌────────────────────────────────────────┐ │
              │  │  Authentication Service                │ │
              │  │                                        │ │
              │  │  • Login verification                 │ │
              │  │  • Argon2id password check           │ │
              │  │  • JWT token generation               │ │
              │  │  • Session management                 │ │
              │  └────────────────────────────────────────┘ │
              │                                              │
              └──────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          External Services                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ANPR Backend (Python Flask)                                            │
│  ├── Plate detection & OCR                                              │
│  ├── Multi-frame voting                                                 │
│  └── REST API for plate reading                                         │
│                                                                          │
│  Biometric Backend (Python FastAPI)                                     │
│  ├── Face recognition                                                   │
│  ├── Liveness detection                                                 │
│  └── Biometric matching                                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. Faculty Search Flow

```
┌──────────────┐
│ User types   │
│ "Dr Verna"   │
│ (typo)       │
└──────┬───────┘
       │
       │ Search Query
       │
┌──────▼────────────────────────────────────────────┐
│ Frontend: fuzzySearch.ts                          │
│                                                   │
│ 1. Levenshtein Distance:                         │
│    "Dr. Verma" vs "Dr Verna" = 78% similar      │
│                                                   │
│ 2. N-gram Analysis:                              │
│    ["Dr", "Ve", "er", "rn", "na"]               │
│    Match: 80%                                    │
│                                                   │
│ 3. Phonetic Matching:                            │
│    Soundex: "V650" = "V650" (match)             │
│                                                   │
│ 4. Token-based:                                  │
│    ["Dr", "Verna"] ≈ ["Dr", "Verma"]           │
│    Match: 85%                                    │
│                                                   │
│ Final Score: 0.78 (above 0.25 threshold)        │
└───────────────────────┬───────────────────────────┘
                        │
                        │ Results
                        │
                ┌───────▼────────┐
                │ Display:       │
                │ Dr. Anil Verma │
                │ 78% match      │
                │ [Select]       │
                └────────────────┘
```

### 2. Faculty Migration Flow

```
┌─────────────────────────────────────────────────┐
│ data/allfaculty_with_creds.json                │
│                                                 │
│ {                                               │
│   "name": "Dr. Srinivas S",                    │
│   "username": "srinivas170004",                │
│   "password": "qX7#mB2vLp9!"  ← PLAINTEXT     │
│ }                                               │
└────────────┬────────────────────────────────────┘
             │
             │ Read JSON
             │
┌────────────▼─────────────────────────────────────┐
│ Migration Script                                 │
│                                                  │
│ 1. Read JSON file                               │
│ 2. For each faculty:                            │
│    ├── Validate required fields                │
│    ├── Hash password with Argon2id:            │
│    │   • Memory: 64 MB                         │
│    │   • Iterations: 3                         │
│    │   • Parallelism: 4                        │
│    │   • Time: ~50-150ms per password          │
│    └── Prepare Firestore document              │
│                                                  │
│ 3. Batch write (500 max per batch)             │
└──────────────┬───────────────────────────────────┘
               │
               │ Write to Firestore
               │
┌──────────────▼───────────────────────────────────┐
│ Firestore: faculty/{username}                   │
│                                                  │
│ {                                                │
│   "name": "Dr. Srinivas S",                     │
│   "username": "srinivas170004",                 │
│   "passwordHash": "$argon2id$v=19$m=65536..."  │
│   "role": "faculty",                            │
│   "status": "active",                           │
│   "createdAt": Timestamp,                       │
│   "metadata": { ... }                           │
│ }                                                │
└──────────────────────────────────────────────────┘
```

### 3. Biometric Capture Flow

```
┌──────────────────┐
│ User reaches     │
│ Biometric Screen │
└────────┬─────────┘
         │
         │ Request Camera
         │
┌────────▼──────────────────────────────────────┐
│ Expo Camera API                               │
│                                               │
│ • Request permissions                         │
│ • Start preview                               │
│ • Wait for face detection                    │
└────────┬──────────────────────────────────────┘
         │
         │ Face detected
         │
┌────────▼──────────────────────────────────────┐
│ Countdown & Capture                           │
│                                               │
│ 3... 2... 1... CAPTURE!                      │
│                                               │
│ • takePictureAsync()                         │
│ • Quality: 0.7                               │
│ • Format: JPEG                                │
└────────┬──────────────────────────────────────┘
         │
         │ Image URI
         │
┌────────▼──────────────────────────────────────┐
│ Image Processing                              │
│                                               │
│ 1. Resize to max 1280px width                │
│ 2. Compress JPEG (75% quality)               │
│ 3. Convert to Base64                         │
│    • Add data URI prefix                     │
│    • ~50-150 KB final size                   │
└────────┬──────────────────────────────────────┘
         │
         │ Base64 Data URI
         │
┌────────▼──────────────────────────────────────┐
│ Firebase Storage                              │
│                                               │
│ Firestore: users/{userId}/identityProof/     │
│ {                                             │
│   "dataUri": "data:image/jpeg;base64,/9j...", │
│   "capturedAt": Timestamp,                    │
│   "mimeType": "image/jpeg"                    │
│ }                                             │
└───────────────────────────────────────────────┘
```

### 4. Authentication Flow (After Migration)

```
┌──────────────────┐
│ User enters:     │
│ Username: anil   │
│ Password: ****   │
└────────┬─────────┘
         │
         │ POST /api/auth/login
         │
┌────────▼─────────────────────────────────────────┐
│ Backend: Auth Route                              │
│                                                  │
│ 1. Validate input                               │
│ 2. Query Firestore:                             │
│    faculty/{username}                           │
│                                                  │
│ 3. Get passwordHash from document               │
└────────┬─────────────────────────────────────────┘
         │
         │ passwordHash + provided password
         │
┌────────▼─────────────────────────────────────────┐
│ Argon2 Verification                              │
│                                                  │
│ argon2.verify(hash, password)                   │
│                                                  │
│ • Extracts parameters from hash                 │
│ • Re-hashes password with same params          │
│ • Constant-time comparison                     │
│ • Time: ~50-150ms                              │
└────────┬─────────────────────────────────────────┘
         │
         │ true/false
         │
    ┌────▼─────┐     ┌─────────────┐
    │ Valid?   │     │             │
    └────┬─────┘     │             │
         │           │             │
    ┌────▼─────┐     ┌───▼─────────┐
    │ YES      │     │ NO          │
    └────┬─────┘     └───┬─────────┘
         │               │
         │ Generate JWT  │ Return 401
         │               │
┌────────▼──────┐   ┌────▼──────────┐
│ Return:       │   │ Return:       │
│ {             │   │ {             │
│   success: ✓  │   │   success: ✗  │
│   token: ...  │   │   message: .. │
│   user: {...} │   │ }             │
│ }             │   └───────────────┘
└───────────────┘
```

---

## Component Interaction Map

```
┌───────────────────────────────────────────────────────────────────┐
│                     React Native App Components                    │
└───────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐       ┌──────────────────────────┐
│ BiometricCapture        │       │ FacultySearchPicker      │
│ (Screen)                │       │ (Component)              │
│                         │       │                          │
│ • Camera preview        │       │ • Search input           │
│ • Face detection        │       │ • Fuzzy filtering        │
│ • Countdown timer       │       │ • Results list           │
│ • Image capture         │       │ • Relevance scores       │
└────────┬────────────────┘       └────────┬─────────────────┘
         │                                 │
         │ Uses                            │ Uses
         │                                 │
┌────────▼────────────────┐       ┌────────▼─────────────────┐
│ Expo Camera API         │       │ fuzzySearch.ts           │
│ • takePictureAsync()    │       │ • searchFaculty()        │
│ • Image manipulation    │       │ • fuzzyMatchScore()      │
└────────┬────────────────┘       │ • Algorithms:            │
         │                        │   - Levenshtein          │
         │                        │   - N-gram               │
         │                        │   - Phonetic             │
         │                        │   - Token-based          │
         │                        └────────┬─────────────────┘
         │                                 │
         │ Stores                          │ Reads
         │                                 │
┌────────▼─────────────────────────────────▼─────────────────┐
│                     Firebase Firestore                      │
│                                                             │
│ users/              faculty/              requests/         │
│ └── identityProof   └── (all faculty)    └── (visits)     │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Security Layers                           │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Git Protection
┌─────────────────────────────────────────────────────────────┐
│ .gitignore                                                  │
│ ├── data/                    ← Plaintext passwords         │
│ ├── serviceAccountKey.json   ← Firebase admin credentials  │
│ └── .env files               ← API keys & secrets          │
└─────────────────────────────────────────────────────────────┘

Layer 2: Password Hashing
┌─────────────────────────────────────────────────────────────┐
│ Argon2id                                                    │
│ ├── Type: argon2id (hybrid mode)                          │
│ ├── Memory: 64 MB (GPU attack resistant)                  │
│ ├── Time: 3 iterations                                     │
│ ├── Parallelism: 4 threads                                │
│ └── Output: $argon2id$v=19$m=65536,t=3,p=4$...           │
│                                                             │
│ plaintext → [HASH] → stored hash                          │
│ "password123" → "$argon2id$..." (one-way)                 │
└─────────────────────────────────────────────────────────────┘

Layer 3: Firebase Security Rules
┌─────────────────────────────────────────────────────────────┐
│ Firestore Rules                                             │
│                                                             │
│ • Users can only read their own data                       │
│ • Faculty collection: authenticated read only              │
│ • Password hashes: never exposed in queries                │
│ • Admin operations: require admin token                    │
└─────────────────────────────────────────────────────────────┘

Layer 4: API Security
┌─────────────────────────────────────────────────────────────┐
│ Backend Middleware                                          │
│                                                             │
│ • Input validation (express-validator)                     │
│ • Rate limiting (prevent brute force)                      │
│ • JWT authentication                                        │
│ • CORS configuration                                        │
│ • Helmet.js (security headers)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Performance Optimization Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Performance Layers                        │
└─────────────────────────────────────────────────────────────┘

Frontend Optimization
├── Fuzzy Search
│   ├── Memoization (useMemo)
│   ├── Debouncing (300ms)
│   ├── Result limiting (20 max)
│   └── Lazy evaluation
│
├── Image Processing
│   ├── On-device compression
│   ├── Resize before upload
│   └── Base64 encoding
│
└── Component Rendering
    ├── React.memo for lists
    ├── Virtual scrolling
    └── Lazy imports

Backend Optimization
├── Faculty Search Service
│   ├── In-memory cache (5 min TTL)
│   ├── Batch Firestore queries
│   └── Response compression
│
├── Database
│   ├── Indexed fields (username, email)
│   ├── Composite indexes
│   └── Query optimization
│
└── Caching Strategy
    ├── Static data: 5 minutes
    ├── User data: 1 minute
    └── Force refresh on write

Network Optimization
├── Minimize API calls
├── Batch operations
├── Compression (gzip)
└── CDN for static assets
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Setup                         │
└─────────────────────────────────────────────────────────────┘

Mobile App (Expo)
└── Build → Google Play / App Store
    ├── Android APK/AAB
    └── iOS IPA

Backend Server
└── Deploy → Cloud Provider
    ├── Google Cloud Run (recommended)
    ├── AWS ECS
    ├── Heroku
    └── DigitalOcean

Database
└── Firebase Firestore
    ├── Production project
    ├── Backup enabled
    └── Security rules applied

Environment Variables
├── Production .env
│   ├── FIREBASE_PROJECT_ID
│   ├── API_BASE_URL
│   └── JWT_SECRET
│
└── Staging .env
    └── (separate config)

Monitoring
├── Firebase Analytics
├── Crash reporting (Sentry)
├── Performance monitoring
└── Error logging
```

---

**Note:** This architecture diagram represents the current implementation state. All components are functional and documented.

