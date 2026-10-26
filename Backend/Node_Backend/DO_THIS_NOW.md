# 🚨 FACULTY MIGRATION - ACTION REQUIRED

## ⚡ Quick Commands (Copy & Paste)

### 1️⃣ Install Dependencies
```powershell
cd C:\Users\toni5\Desktop\VISION\VISION\Backend\Node_Backend
npm install
```

### 2️⃣ Check for Firebase Service Account Key
```powershell
Test-Path C:\Users\toni5\Desktop\VISION\VISION\Backend\Node_Backend\serviceAccountKey.json
```

**If it says `False`:**
- Go to: https://console.firebase.google.com/project/vision-1caa0/settings/serviceaccounts/adminsdk
- Click "Generate new private key"
- Save to: `Backend\Node_Backend\serviceAccountKey.json`

### 3️⃣ Run Migration
```powershell
cd C:\Users\toni5\Desktop\VISION\VISION\Backend\Node_Backend
node scripts/migrate-faculty-to-firestore.js
```

### 4️⃣ Test Login
```powershell
cd C:\Users\toni5\Desktop\VISION\VISION\Backend\Node_Backend
node scripts/test-faculty-login.js srinivas170004 "qX7#mB2vLp9!"
```

### 5️⃣ Verify in Firebase Console
Open: https://console.firebase.google.com/project/vision-1caa0/firestore/data/~2Ffaculty

---

## ✅ That's It!

After these 5 steps, your faculty data will be securely stored in Firestore with Argon2id hashed passwords.

---

## 📖 Need More Info?

- **Quick Start:** `MIGRATION_QUICK_START.md`
- **Full Guide:** `FACULTY_MIGRATION_GUIDE.md`
- **Summary:** `../FACULTY_MIGRATION_SUMMARY.md` (in project root)

---

## 🔒 What's Protected?

Your `.gitignore` has been updated to exclude:
- ✅ `data/` directory (faculty credentials)
- ✅ `serviceAccountKey.json` (Firebase key)

**These will NEVER be committed to git!**
