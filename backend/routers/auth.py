"""Auth router."""
from fastapi import APIRouter, HTTPException, Response, Depends
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from db import get_db, hash_password, verify_password, new_id, now_iso
from auth_utils import create_access_token, set_auth_cookie, clear_auth_cookie, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str = Field(pattern="^(school_admin|teacher|parent)$")
    school_name: Optional[str] = None  # required if school_admin
    school_id: Optional[str] = None  # required if teacher/parent


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _user_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "school_id": u.get("school_id"),
    }


@router.post("/register")
async def register(payload: RegisterIn, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    school_id = payload.school_id
    if payload.role == "school_admin":
        if not payload.school_name:
            raise HTTPException(status_code=400, detail="school_name is required for school admin")
        school_id = new_id()
        await db.schools.insert_one({
            "id": school_id,
            "name": payload.school_name,
            "principal_name": payload.name,
            "address": "",
            "phone": "",
            "kill_switch": False,
            "subscription_tier": None,
            "subscription_duration": None,
            "subscription_expires_at": None,
            "created_at": now_iso(),
        })
    else:
        if not school_id:
            raise HTTPException(status_code=400, detail="school_id is required")
        if not await db.schools.find_one({"id": school_id}):
            raise HTTPException(status_code=400, detail="School not found")

    user_id = new_id()
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "school_id": school_id,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)

    token = create_access_token(user_id, email, payload.role)
    set_auth_cookie(response, token)
    return {"user": _user_public(user_doc), "token": token}


@router.post("/login")
async def login(payload: LoginIn, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Kill-switch check for non-super-admins
    if user["role"] != "super_admin" and user.get("school_id"):
        school = await db.schools.find_one({"id": user["school_id"]})
        if school and school.get("kill_switch"):
            raise HTTPException(status_code=403, detail="Your school's subscription has been suspended. Please contact Corner Streams support.")

    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    return {"user": _user_public(user), "token": token}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": _user_public(user)}


@router.get("/schools-public")
async def list_schools_public():
    """List schools so parents/teachers can register against them."""
    db = get_db()
    schools = await db.schools.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    return {"schools": schools}
