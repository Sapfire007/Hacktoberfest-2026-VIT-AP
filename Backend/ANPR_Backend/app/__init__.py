"""
VISION ANPR Backend

IMPORTANT: This __init__.py MUST run before any other imports to set the cache directory.
"""

import os
import sys
from pathlib import Path

# Get the backend directory (parent of app/)
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Create .anpr/weights directory in backend root
WEIGHTS_DIR = BACKEND_DIR / ".anpr" / "weights"
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

print(f"[ANPR] Target model cache directory: {WEIGHTS_DIR}")

# The libraries use appdirs/platformdirs which on Windows reads LOCALAPPDATA
# Override it to point to our weights directory
USER_CACHE = WEIGHTS_DIR / "user_cache"
USER_CACHE.mkdir(exist_ok=True)

os.environ["LOCALAPPDATA"] = str(USER_CACHE)
os.environ["APPDATA"] = str(USER_CACHE)  
os.environ["XDG_CACHE_HOME"] = str(WEIGHTS_DIR)

print(f"[ANPR] Set LOCALAPPDATA={USER_CACHE}")
print(f"[ANPR] Models will download to project directory instead of user cache")
