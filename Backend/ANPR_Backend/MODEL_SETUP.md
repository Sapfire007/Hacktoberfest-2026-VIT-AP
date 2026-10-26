# ANPR Model Setup Guide

## ✅ Current Status

**Models are now stored in the project directory:**
```
C:\Users\toni5\Desktop\VISION\VISION\Backend\ANPR_Backend\.anpr\weights\
├── fast-plate-ocr/
│   └── cct-s-v2-global-model/
└── open-image-models/
    └── yolo-v9-t-384-license-plate-end2end/
```

**Junction points created:**
- `C:\Users\toni5\.cache\open-image-models` → Project directory
- `C:\Users\toni5\.cache\fast-plate-ocr` → Project directory

The libraries (`open-image-models` and `fast-plate-ocr`) continue to work normally because they see the junction points at their expected location, but the actual model files are physically stored in your project directory.

---

## 🔧 How It Works

### The Problem
The Python libraries hardcode their cache location:
```python
cache_dir = Path.home() / ".cache"  # Always C:\Users\toni5\.cache
```

Environment variables like `XDG_CACHE_HOME`, `TORCH_HOME`, etc. are ignored because the path is hardcoded in the library source code.

### The Solution
1. **Models downloaded** to `C:\Users\toni5\.cache\` (initial download)
2. **Models moved** to `Backend\ANPR_Backend\.anpr\weights\`
3. **Junction points created** at original location pointing to project directory

### Junction Points (Windows Directory Links)
- Similar to symbolic links but work at the directory level
- Don't require administrator privileges
- The library thinks it's reading from `C:\Users\toni5\.cache\`
- But it's actually reading from your project directory
- Transparent to the application

---

## 🚀 Setup Instructions

### If Models Already Downloaded
Run the PowerShell script (models must exist first):
```powershell
cd Backend\ANPR_Backend
.\move_models_to_project.ps1
```

Then create junction points:
```powershell
# Open-image-models junction
cmd /c mklink /J "C:\Users\toni5\.cache\open-image-models" "C:\Users\toni5\Desktop\VISION\VISION\Backend\ANPR_Backend\.anpr\weights\open-image-models"

# Fast-plate-ocr junction
cmd /c mklink /J "C:\Users\toni5\.cache\fast-plate-ocr" "C:\Users\toni5\Desktop\VISION\VISION\Backend\ANPR_Backend\.anpr\weights\fast-plate-ocr"
```

### Fresh Installation
1. Start ANPR backend (models will download to user cache automatically)
2. Wait for models to finish downloading
3. Stop the backend
4. Run the setup script above
5. Restart the backend

---

## ✅ Verification

### Check Models in Project
```powershell
Get-ChildItem Backend\ANPR_Backend\.anpr\weights -Recurse -Depth 1
```

### Check Junction Points
```powershell
cmd /c "dir C:\Users\toni5\.cache\open-image-models"
cmd /c "dir C:\Users\toni5\.cache\fast-plate-ocr"
```

### Test ANPR Backend
```powershell
curl http://localhost:8002/api/v1/health
```

Should return:
```json
{
  "status": "ok",
  "service": "VISION ANPR Backend",
  "models_loaded": true,
  "detector_model": "yolo-v9-t-384-license-plate-end2end",
  "ocr_model": "cct-s-v2-global-model"
}
```

---

## 📦 What Gets Committed to Git

With the current `.gitignore`:
```
.anpr/weights/
```

The models will **NOT** be committed to Git. Each developer must:
1. Clone the repo
2. Start ANPR backend once (downloads models)
3. Run the `move_models_to_project.ps1` script
4. Create junction points

### Alternative: Commit Models (Not Recommended)
If you want to commit models to Git:
1. Remove `.anpr/weights/` from `.gitignore`
2. Add and commit: `git add -f Backend/ANPR_Backend/.anpr/weights/`
3. Models are ~50-100MB each, will slow down cloning

---

## 🛠️ Maintenance

### Clean Up Old Models
If you want to remove the junction points and store models only in user cache:
```powershell
# Remove junctions
cmd /c "rmdir C:\Users\toni5\.cache\open-image-models"
cmd /c "rmdir C:\Users\toni5\.cache\fast-plate-ocr"

# Copy models back
Copy-Item -Recurse Backend\ANPR_Backend\.anpr\weights\open-image-models C:\Users\toni5\.cache\
Copy-Item -Recurse Backend\ANPR_Backend\.anpr\weights\fast-plate-ocr C:\Users\toni5\.cache\
```

### Update Models
Models update automatically when library versions change. After update:
1. Stop backend
2. Run `move_models_to_project.ps1` again
3. Junction points will still work

---

## 📝 Notes

- Junction points persist across reboots
- Deleting the project deletes the models (they're physically in the project)
- Junction points will be broken if project is moved/deleted
- No admin privileges required for junction points
- Transparent to the application - no code changes needed
