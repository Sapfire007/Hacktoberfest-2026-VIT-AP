# Faculty Data Migration Guide

This guide will help you migrate faculty credentials from the JSON file to Firestore with secure Argon2id password hashing.

---

## 📋 Prerequisites

1. **Firebase Project Setup**
   - Ensure your Firebase project is configured
   - Service account key should be available at `Backend/Node_Backend/serviceAccountKey.json`

2. **Node.js and npm**
   - Node.js >= 16.0.0
   - npm >= 8.0.0

---

## 🚀 Migration Steps

### Step 1: Install Dependencies

Navigate to the Node_Backend directory and install the required packages:

```powershell
cd Backend\Node_Backend
npm install
```

This will install `argon2` along with other dependencies.

### Step 2: Verify Service Account Key

Make sure your Firebase service account key is present:

```powershell
# Check if the file exists
Test-Path serviceAccountKey.json
```

If it returns `False`, you need to:
1. Go to [Firebase Console](https://console.firebase.google.com/project/vision-1caa0/settings/serviceaccounts/adminsdk)
2. Click "Generate new private key"
3. Save the downloaded JSON file as `serviceAccountKey.json` in the `Backend/Node_Backend/` directory

### Step 3: Review the Data

The faculty data is located at:
```
Backend\Node_Backend\data\allfaculty_with_creds.json
```

**⚠️ This file contains plaintext passwords and should NEVER be committed to git!**

### Step 4: Run the Migration Script

Execute the migration:

```powershell
node scripts/migrate-faculty-to-firestore.js
```

The script will:
- ✅ Read all faculty credentials from the JSON file
- ✅ Hash each password using Argon2id (OWASP recommended)
- ✅ Store faculty data in Firestore under the `faculty` collection
- ✅ Use `username` as the document ID for fast lookups
- ✅ Add metadata (role, status, timestamps)
- ✅ Provide a detailed migration summary

### Step 5: Verify in Firebase Console

1. Go to: https://console.firebase.google.com/project/vision-1caa0/firestore
2. Navigate to the `faculty` collection
3. Check a few documents to ensure:
   - All fields are present
   - `passwordHash` starts with `$argon2id$`
   - No plaintext passwords are visible

---

## 🔐 Password Hashing Details

### Why Argon2id?

- **OWASP Recommended**: Current best practice for password hashing (2023)
- **Memory-Hard**: Resistant to GPU and ASIC attacks
- **Side-Channel Resistant**: Protects against timing attacks
- **Future-Proof**: Winner of Password Hashing Competition (PHC)

### Configuration Used

```javascript
{
  type: argon2.argon2id,    // Hybrid mode (best security)
  memoryCost: 65536,        // 64 MB memory usage
  timeCost: 3,              // 3 iterations
  parallelism: 4,           // 4 parallel threads
}
```

This configuration provides strong security while maintaining reasonable performance.

---

## 🔄 Updated Authentication Flow

After migration, your login API should:

1. **Lookup user by username:**
   ```javascript
   const userDoc = await db.collection('faculty').doc(username).get();
   ```

2. **Verify password:**
   ```javascript
   const argon2 = require('argon2');
   const isValid = await argon2.verify(userDoc.data().passwordHash, providedPassword);
   ```

3. **Return success/failure accordingly**

---

## 📊 Firestore Document Structure

Each faculty document will have:

```json
{
  "id": 1285,
  "employeeId": "1.70004",
  "name": "Dr. Srinivas S",
  "email": "srinivas.s@vitap.ac.in",
  "department": "School of Advanced Science (SAS)",
  "username": "srinivas170004",
  "passwordHash": "$argon2id$v=19$m=65536,t=3,p=4$...",
  "role": "faculty",
  "status": "active",
  "createdAt": Timestamp,
  "updatedAt": Timestamp,
  "metadata": {
    "migratedFrom": "allfaculty_with_creds.json",
    "migratedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## 🔒 Security Best Practices

### ✅ DO

- Keep `data/` directory in `.gitignore` (already done)
- Never commit plaintext passwords
- Use Argon2id for password hashing
- Regularly rotate Firebase service account keys
- Use environment variables for sensitive config
- Enable Firebase security rules

### ❌ DON'T

- Don't commit the `data/` directory
- Don't share service account keys
- Don't use weaker hashing (MD5, SHA1, bcrypt with low rounds)
- Don't log passwords (even hashed ones)
- Don't expose password hashes in API responses

---

## 🧪 Testing the Migration

### Test a Sample Login

Create a simple test script (`scripts/test-login.js`):

```javascript
const admin = require('firebase-admin');
const argon2 = require('argon2');

// Initialize Firebase
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function testLogin(username, password) {
  try {
    const userDoc = await db.collection('faculty').doc(username).get();
    
    if (!userDoc.exists) {
      console.log('❌ User not found');
      return false;
    }
    
    const userData = userDoc.data();
    const isValid = await argon2.verify(userData.passwordHash, password);
    
    if (isValid) {
      console.log('✅ Login successful!');
      console.log('User:', userData.name);
      console.log('Email:', userData.email);
      console.log('Department:', userData.department);
      return true;
    } else {
      console.log('❌ Invalid password');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// Test with a sample user from the JSON
testLogin('srinivas170004', 'qX7#mB2vLp9!')
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
```

Run it:
```powershell
node scripts/test-login.js
```

---

## 🛠️ Troubleshooting

### Issue: "Cannot find module 'argon2'"

**Solution:**
```powershell
cd Backend\Node_Backend
npm install argon2
```

### Issue: "serviceAccountKey.json not found"

**Solution:**
1. Download from Firebase Console → Project Settings → Service Accounts
2. Save to `Backend/Node_Backend/serviceAccountKey.json` (root of Node_Backend directory)

### Issue: "Permission denied" errors in Firestore

**Solution:**
- Update Firestore security rules to allow the service account
- Or temporarily set rules to test mode (not for production!)

### Issue: Migration script runs but no data appears

**Solution:**
- Check Firebase Console for errors
- Verify the collection name is correct (`faculty`)
- Ensure batch commit succeeded (check script output)

---

## 📝 Post-Migration Cleanup

### Optional: Remove the JSON File (After Verification)

⚠️ **Only do this after confirming migration was successful!**

```powershell
# Backup first
Copy-Item Backend\Node_Backend\data\allfaculty_with_creds.json Backend\Node_Backend\data\allfaculty_with_creds.json.backup

# Then remove if everything is working
Remove-Item Backend\Node_Backend\data\allfaculty_with_creds.json
```

---

## 🔄 Updating Existing Auth Routes

### Example: Faculty Login Endpoint

Update your login route to use Firestore + Argon2id:

```typescript
// src/routes/auth.routes.ts
import { Router } from 'express';
import argon2 from 'argon2';
import admin from 'firebase-admin';

const router = Router();
const db = admin.firestore();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    // Fetch user from Firestore
    const userDoc = await db.collection('faculty').doc(username.toLowerCase()).get();

    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const userData = userDoc.data();

    // Check if account is active
    if (userData.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active',
      });
    }

    // Verify password
    const isValidPassword = await argon2.verify(userData.passwordHash, password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Create session token (use your existing JWT logic)
    const token = generateJWT(userData); // Your JWT function

    // Return success
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        username: userData.username,
        name: userData.name,
        email: userData.email,
        department: userData.department,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
```

---

## 📞 Support

If you encounter any issues during migration:

1. Check the migration script output for error details
2. Review Firebase Console → Firestore for data
3. Check Node.js version compatibility
4. Verify all dependencies are installed

---

## ✅ Migration Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Service account key is present
- [ ] Reviewed faculty data JSON file
- [ ] Ran migration script successfully
- [ ] Verified data in Firebase Console
- [ ] Tested sample login with Argon2id verification
- [ ] Updated authentication routes
- [ ] Tested end-to-end login flow
- [ ] Backed up and removed plaintext JSON file (optional)
- [ ] Updated `.gitignore` to exclude `data/` directory ✓

---

**🎉 Migration Complete!**

Your faculty credentials are now securely stored in Firestore with industry-standard Argon2id password hashing.
