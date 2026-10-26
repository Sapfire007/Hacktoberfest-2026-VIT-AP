# VISION Backend API (TypeScript)

Backend server for the VISION Campus Access Management System built with Node.js, Express, TypeScript, and Firebase.

## 🚀 Features

- **TypeScript**: Full type safety and IntelliSense support
- **Gmail Authentication**: Google Sign-In integration with Firebase Auth
- **User Management**: Firestore-based user profile storage
- **Secure API**: JWT token verification, CORS, Helmet security
- **RESTful API**: Clean endpoint structure for all operations
- **Environment-based Config**: Secure credential management with .env

## 📋 Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- Firebase project with:
  - Firebase Authentication enabled (Google Sign-In provider)
  - Cloud Firestore database created
  - Service account key downloaded

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
cd Backend/Node_Backend
npm install
```

Required packages will be installed:
- `express` - Web framework
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management
- `firebase-admin` - Firebase Admin SDK
- `express-validator` - Request validation
- `helmet` - Security headers
- `morgan` - HTTP request logger
- `typescript` - TypeScript compiler
- `ts-node-dev` - TypeScript development with hot reload
- `@types/*` - TypeScript type definitions

### 2. Firebase Configuration

#### Option A: Using Service Account Key File (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Save the downloaded JSON file as `serviceAccountKey.json` in the `Backend` folder
6. Make sure `serviceAccountKey.json` is added to `.gitignore` (already configured)

#### Option B: Using Environment Variables

Extract values from the service account key and add them to `.env` file.

### 3. Environment Variables

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` with your Firebase credentials:

```env
# Server
PORT=3000
NODE_ENV=development

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Security
JWT_SECRET=your-very-long-random-secret-key
CORS_ORIGINS=http://localhost:8081,exp://localhost:8081

# Collections
FIRESTORE_COLLECTION_USERS=users
FIRESTORE_COLLECTION_VISITS=visit_requests
FIRESTORE_COLLECTION_PERMITS=visit_permits
FIRESTORE_COLLECTION_VEHICLES=vehicles
```

### 4. Enable Google Sign-In in Firebase

1. Go to **Authentication** > **Sign-in method** in Firebase Console
2. Enable **Google** provider
3. Add authorized domains (localhost for development)

### 5. Create Firestore Database

1. Go to **Firestore Database** in Firebase Console
2. Click **Create Database**
3. Choose **Start in test mode** (for development)
4. Select a location close to your users

## 🏃 Running the Server

### Development Mode (with auto-reload and TypeScript compilation)

```bash
npm run dev
```

This uses `ts-node-dev` for hot-reloading during development.

### Build for Production

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

### Production Mode

```bash
npm start
```

This runs the compiled JavaScript from `dist/` folder.

### Type Checking

```bash
npm run type-check
```

Server will start on `http://localhost:3000`

## 📡 API Endpoints

### Health Check

```http
GET /health
```

Response:
```json
{
  "success": true,
  "message": "VISION Backend is running",
  "timestamp": "2024-08-09T10:30:00.000Z",
  "environment": "development"
}
```

### Authentication

#### Register/Login User

```http
POST /api/auth/register
Content-Type: application/json
Authorization: Bearer <firebase-id-token>

{
  "idToken": "firebase-id-token-from-client",
  "role": "visitor",
  "requesterType": "visitor",
  "visitorSubtype": "general"
}
```

Response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "uid": "user-uid",
      "email": "user@example.com",
      "displayName": "User Name",
      "role": "visitor",
      "requesterType": "visitor",
      "profileComplete": false
    }
  }
}
```

#### Get Current User Profile

```http
GET /api/auth/me
Authorization: Bearer <firebase-id-token>
```

## 🗄️ Firestore Schema

### Users Collection

```
users/
  {uid}/
    - uid: string
    - email: string
    - displayName: string
    - photoURL: string | null
    - role: "visitor" | "parent" | "student" | "faculty"
    - requesterType: "visitor" | "parent_guardian" | "external_student"
    - visitorSubtype: "general" | "alumni" | "vendor" | "guest_faculty" | null
    - status: "active" | "suspended"
    - emailVerified: boolean
    - biometricEnrolled: boolean
    - govtIdUploaded: boolean
    - profileComplete: boolean
    - createdAt: timestamp
    - lastLoginAt: timestamp
    - updatedAt: timestamp
```

## 🔐 Security

- **Firebase Authentication**: All user tokens verified server-side
- **CORS**: Configured to allow only specified origins
- **Helmet**: Security headers applied to all responses
- **Environment Variables**: Sensitive data stored in .env (not committed to git)
- **Input Validation**: All inputs validated with express-validator
- **Rate Limiting**: (To be implemented in production)

## 📁 Project Structure

```
Backend/Node_Backend/
├── src/
│   ├── config/
│   │   └── firebase.admin.ts       # Firebase Admin SDK initialization
│   ├── middleware/
│   │   └── auth.middleware.ts      # Authentication middleware
│   ├── routes/
│   │   └── auth.routes.ts          # Authentication endpoints
│   ├── services/
│   │   └── user.service.ts         # User business logic
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   └── server.ts                   # Main server file
├── dist/                           # Compiled JavaScript (generated)
├── .env                            # Environment variables (not in git)
├── .env.example                    # Environment template
├── .gitignore                      # Git ignore rules
├── tsconfig.json                   # TypeScript configuration
├── package.json                    # Dependencies and scripts
├── serviceAccountKey.json          # Firebase service account (not in git)
└── README.md                       # This file
```

## 🧪 Testing

Test the API with curl or Postman:

```bash
# Health check
curl http://localhost:3000/health

# Register user (requires Firebase ID token from client)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <firebase-id-token>" \
  -d '{"idToken":"<token>","role":"visitor","requesterType":"visitor"}'
```

## 🚧 Next Steps

- [ ] Install remaining dependencies when network is stable
- [ ] Add user profile update endpoints
- [ ] Implement visit request creation and management
- [ ] Add permit generation logic
- [ ] Create vehicle management endpoints
- [ ] Add notification service
- [ ] Implement admin endpoints
- [ ] Add comprehensive error handling
- [ ] Set up logging system
- [ ] Add API rate limiting
- [ ] Create API documentation with Swagger
- [ ] Write unit and integration tests

## 📝 Notes

- The backend is designed to handle all business logic and data operations
- Frontend (React Native app) only handles UI and API calls
- All sensitive operations happen server-side for security
- Firebase Admin SDK has elevated privileges - keep credentials secure
- Never commit `.env` or `serviceAccountKey.json` to version control

## 🐛 Troubleshooting

### Firebase initialization error

- Check if service account key file exists and path is correct
- Verify Firebase project ID in .env matches your project
- Ensure you have the correct permissions in Firebase Console

### CORS errors

- Add your frontend URL to CORS_ORIGINS in .env
- For Expo, use: `exp://localhost:8081` or your Expo dev URL

### Port already in use

- Change PORT in .env to a different number
- Or kill the process using the port: `npx kill-port 3000`

## 📄 License

MIT

## 👤 Author

Saptarshi - B.Tech CSE (Core), VIT-AP University
