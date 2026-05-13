"""Auth helpers: JWT issuing, decoding, role-based dependency."""
import os
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends
from db import get_db

JWT_ALGO = "HS256"
ACCESS_EXPIRE_DAYS = 7


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGO)


def _read_token(request: Request) -> str | None:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = _read_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_roles(*allowed_roles: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        role = user.get("role")
        if role in allowed_roles:
            return user
        # Users with the is_admin flag (promoted by another school admin) can
        # perform any school_admin action while keeping their primary role.
        if user.get("is_admin") and "school_admin" in allowed_roles:
            return user
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return dep


def set_auth_cookie(response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_EXPIRE_DAYS * 24 * 3600,
        path="/",
    )


def clear_auth_cookie(response):
    response.delete_cookie(key="access_token", path="/")
