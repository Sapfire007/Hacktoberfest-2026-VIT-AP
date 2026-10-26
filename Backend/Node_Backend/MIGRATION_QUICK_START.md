# 🚀 Faculty Migration - Quick Start

## What's Been Done ✅

1. **Created migration script** at `scripts/migrate-faculty-to-firestore.js`
   - Reads faculty data from `data/allfaculty_with_creds.json`
   - Hashes passwords with Argon2id (OWASP recommended)
   - Stores everything in Firestore `faculty` collection

2. **Added `argon2` dependency** to `package.json`
   - Industry-standard password hashing
   - Resistant to GPU/ASIC attacks
   - Winner of Password Hashing Competition

3. **Updated `.gitignore`**
   - Added `data/` directory (sensitive faculty credentials)
   - Added `serviceAccountKey.json` (Firebase credentials)
   - **These files will NEVER be pushed to git** 🔒

4. **Created test script** at `scripts/test-faculty-login.js`
   - Verifies migration worked correctly
   - Tests Argon2id password verification

5. **Comprehensive documentation** in `FACULTY_MIGRATION_GUIDE.md`
   - Step-by-step instructions
   - Troubleshooting guide
   - Security best practices

---

## ⚡ What YOU Need to Do Manually

### Step 1: Install Dependencies (Required)

Open PowerShell in `Backend\Node_Backend\` and run:

```powershell
npm install
```

This will install `argon2` and other required packages.

---

### Step 2: Verify Firebase Service Account Key (Required)

Check if the key exists:

```powershell
Test-Path serviceAccountKey.json
```

**If it returns `False`:**
1. Go to: https://console.firebase.google.com/project/vision-1caa0/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"**
3. Save the downloaded file as: `Backend\Node_Backend\serviceAccountKey.json`

---

### Step 3: Run the Migration (Required)

Execute the migration script:

```powershell
node scripts/migrate-faculty-to-firestore.js
```

Expected output:
```
🚀 Starting faculty data migration...

✓ Loaded XXX faculty records

Processing faculty records...

💾 Committing to Firestore...
✓ Batch committed successfully

═══════════════════════════════════════════════════
                 MIGRATION SUMMARY
═══════════════════════════════════════════════════
Total Records:      XXX
✓ Successful:       XXX
✗ Failed:           0
═══════════════════════════════════════════════════

✅ Migration completed!
```

---

### Step 4: Verify in Firebase Console (Recommended)

1. Open: https://console.firebase.google.com/project/vision-1caa0/firestore
2. Look for `faculty` collection
3. Click on any document
4. Verify:
   - ✅ All fields are present (name, email, username, etc.)
   - ✅ `passwordHash` starts with `$argon2id$`
   - ✅ No plaintext passwords visible

---

### Step 5: Test a Login (Recommended)

Test with a sample faculty member from your data:

```powershell
node scripts/test-faculty-login.js srinivas170004 "qX7#mB2vLp9!"
```

Expected output:
```
🔐 Testing Faculty Login...

Username: srinivas170004
Password: ***************

✓ User found in Firestore
  Name: Dr. Srinivas S
  Email: srinivas.s@vitap.ac.in
  Department: School of Advanced Science (SAS)
  Role: faculty
  Status: active

Verifying password...
✅ Password verification SUCCESSFUL (XXms)

═══════════════════════════════════════════════════
              LOGIN TEST PASSED ✓
═══════════════════════════════════════════════════
```

---

## 🔐 Security Notes

### What's protected:

✅ `Backend\Node_Backend\data/` - **In .gitignore** (faculty credentials)  
✅ `Backend\Node_Backend\serviceAccountKey.json` - **In .gitignore** (Firebase key)  
✅ Passwords are hashed with Argon2id (not plaintext)  
✅ Hashes cannot be reversed (one-way function)

### DO NOT:

❌ Commit the `data/` directory  
❌ Share service account keys  
❌ Push plaintext passwords to git  
❌ Expose password hashes in API responses

---

## 📊 Data Structure

Each faculty document in Firestore:

```
Collection: faculty
Document ID: {username}

Fields:
  - id: number
  - employeeId: string
  - name: string
  - email: string
  - department: string
  - username: string
  - passwordHash: string (Argon2id hash)
  - role: "faculty"
  - status: "active"
  - createdAt: timestamp
  - updatedAt: timestamp
  - metadata: object
```

---

## 🔄 Next Steps (After Migration)

1. **Update your auth routes** to use Firestore + Argon2id
2. **Test the mobile app login** with faculty credentials
3. **Remove the JSON file** (optional, after verification):
   ```powershell
   # Backup first!
   Copy-Item data\allfaculty_with_creds.json data\allfaculty_with_creds.json.backup
   
   # Then remove
   Remove-Item data\allfaculty_with_creds.json
   ```

---

## 📞 Need Help?

- **Full guide:** See `FACULTY_MIGRATION_GUIDE.md`
- **Troubleshooting:** Check the guide's troubleshooting section
- **Test script:** Use `scripts/test-faculty-login.js`

---

## ✅ Checklist

- [ ] Installed dependencies (`npm install`)
- [ ] Verified service account key exists
- [ ] Ran migration script
- [ ] Checked Firebase Console for data
- [ ] Tested sample login
- [ ] Ready to integrate with auth routes!

---

**That's it!** 🎉

The faculty data is now securely stored in Firestore with proper password hashing.
