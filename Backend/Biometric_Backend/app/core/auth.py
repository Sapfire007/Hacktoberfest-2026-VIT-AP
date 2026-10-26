"""
VISION Biometric Backend — Caller authentication

Every biometric request carries the signed-in user's Firebase ID token. This service does
not verify it itself: it asks Node_Backend (GET /api/auth/session), which already verifies
Firebase tokens - signature, expiry and revocation - for every other request. One place
decides who a token belongs to (VISION.md §3.5); this module only asks.

The answer is cached briefly per token, so a burst of captures does not become a burst of
lookups. A revoked or suspended account is therefore refused within a minute, not at once.
"""

import hashlib
import json
import logging
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Dict, Iterable, Optional, Tuple

from fastapi import Header, HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.schemas import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)

CACHE_SECONDS = 60
MAX_CACHE_ENTRIES = 2048
LOOKUP_TIMEOUT_SECONDS = 5

# Firebase uids, and the server-minted `staff_` / `faculty_` ones. Nothing else is a user
# id - in particular nothing with a path separator, a dot or a drive letter.
USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


@dataclass(frozen=True)
class Caller:
    uid: str
    role: Optional[str]


_cache: Dict[str, Tuple[float, Caller]] = {}


def _error(status_code: int, error_code: str, message: str, guidance: str = "") -> HTTPException:
    """An HTTPException in the same shape as every other error from this service."""
    return HTTPException(
        status_code=status_code,
        detail=ErrorResponse(
            success=False,
            error=ErrorDetail(error_code=error_code, message=message, guidance=guidance),
        ).model_dump(),
    )


def _lookup(token: str) -> Optional[Caller]:
    """Ask Node_Backend whose token this is. None means Node refused it."""
    request = urllib.request.Request(
        f"{settings.NODE_API_BASE_URL.rstrip('/')}/auth/session",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=LOOKUP_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            return None
        raise

    data = body.get("data") or {}
    uid = data.get("uid")
    if not isinstance(uid, str) or not uid:
        return None
    role = data.get("role")
    return Caller(uid=uid, role=role if isinstance(role, str) else None)


async def get_caller(authorization: Optional[str] = Header(default=None)) -> Optional[Caller]:
    """
    FastAPI dependency: the signed-in caller, or a 401.

    Returns None only when REQUIRE_AUTH is off, in which case the route applies no
    ownership rules - the service's old, open behaviour.
    """
    if not settings.REQUIRE_AUTH:
        return None

    if not authorization or not authorization.startswith("Bearer "):
        raise _error(401, "AUTH_REQUIRED", "Sign in to use biometric features.",
                     "Sign in again and retry.")

    token = authorization[len("Bearer "):].strip()
    key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.monotonic()

    cached = _cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    try:
        caller = await run_in_threadpool(_lookup, token)
    except Exception as error:  # Node down, wrong NODE_API_BASE_URL, timeout
        logger.error("Could not verify a caller with Node_Backend: %s", error)
        raise _error(503, "AUTH_UNAVAILABLE", "Could not verify your sign-in right now.",
                     "Try again in a moment.")

    if caller is None:
        raise _error(401, "AUTH_INVALID", "Your session has expired.", "Sign in again and retry.")

    if len(_cache) >= MAX_CACHE_ENTRIES:
        _cache.clear()
    _cache[key] = (now + CACHE_SECONDS, caller)
    return caller


def check_user_id(user_id: str) -> str:
    """Refuse anything that is not a plain user id, before it gets near a file path."""
    if not isinstance(user_id, str) or not USER_ID_PATTERN.match(user_id):
        raise _error(400, "INVALID_USER_ID", "That user id is not valid.")
    return user_id


def require_self_or_role(caller: Optional[Caller], user_id: str, roles: Iterable[str] = ()) -> None:
    """The caller is the user concerned, or holds one of `roles`. No-op with auth off."""
    if caller is None:
        return
    if caller.uid == user_id or (caller.role is not None and caller.role in roles):
        return
    raise _error(403, "FORBIDDEN", "You can only manage your own biometric data.")


def require_role(caller: Optional[Caller], roles: Iterable[str]) -> None:
    """The caller holds one of `roles`. No-op with auth off."""
    if caller is None:
        return
    if caller.role is not None and caller.role in roles:
        return
    raise _error(403, "FORBIDDEN", "Your account cannot use this feature.")
