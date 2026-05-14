"""Auth router."""
from fastapi import APIRouter, HTTPException, Response, Depends
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from db import get_db, hash_password, verify_password, new_id, now_iso, default_classes
from auth_utils import create_access_token, set_auth_cookie, clear_auth_cookie, get_current_user
from password_vault import encrypt_password

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    school_name: str
    school_type: Literal["primary", "secondary", "mixed"] = "secondary"
    username: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_]{3,30}$")
    principal_name: Optional[str] = None
    school_phone: Optional[str] = None
    school_address: Optional[str] = None
    brand_color: Optional[str] = Field(default="#002147", pattern=r"^#[0-9a-fA-F]{6}$")
    logo_url: Optional[str] = None
    whatsapp_phone: Optional[str] = None


class LoginIn(BaseModel):
    identifier: Optional[str] = None  # email OR username
    email: Optional[EmailStr] = None  # backward compat
    password: str


def _user_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "username": u.get("username"),
        "name": u["name"],
        "role": u["role"],
        "school_id": u.get("school_id"),
        "student_id": u.get("student_id"),
        "assigned_class": u.get("assigned_class"),
        "assigned_classes": u.get("assigned_classes", []),
        "school_role": u.get("school_role"),
        "is_admin": bool(u.get("is_admin", False)),
        "password_changed_by_user": bool(u.get("password_changed_by_user", False)),
    }


@router.post("/register")
async def register(payload: RegisterIn, response: Response):
    """Public registration creates a school + its first school_admin user.
    Teachers, parents and students are provisioned by the school admin from inside the dashboard."""
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    school_id = new_id()
    await db.schools.insert_one({
        "id": school_id,
        "name": payload.school_name,
        "school_type": payload.school_type,
        "classes": default_classes(payload.school_type),
        "principal_name": payload.principal_name or payload.name,
        "address": payload.school_address or "",
        "phone": payload.school_phone or "",
        "email": email,
        "motto": "",
        "logo_url": payload.logo_url or "",
        "brand_color": payload.brand_color or "#002147",
        "founded_year": "",
        "website": "",
        "whatsapp_phone": (payload.whatsapp_phone or "").strip(),
        "kill_switch": False,
        "verification_status": "pending_payment",
        "verification_code": None,
        "subscription_tier": None,
        "subscription_duration": None,
        "subscription_expires_at": None,
        "created_at": now_iso(),
    })

    user_id = new_id()
    user_doc = {
        "id": user_id, "email": email,
        "password_hash": hash_password(payload.password),
        "auto_password_encrypted": encrypt_password(payload.password),
        "password_changed_by_user": False,
        "name": payload.name, "role": "school_admin",
        "school_id": school_id, "created_at": now_iso(),
    }
    if payload.username:
        un = payload.username.lower().strip()
        if await db.users.find_one({"username": un}):
            raise HTTPException(status_code=400, detail="Username already taken")
        user_doc["username"] = un
    await db.users.insert_one(user_doc)

    # Payment gate: school admin cannot auto-login. They must pay + be verified by Super Admin.
    return {
        "ok": True,
        "pending_verification": True,
        "school_id": school_id,
        "school_email": email,
        "school_name": payload.school_name,
        "message": "School registered. To activate your account, transfer the tier amount to the bank account shown on the payment page, upload your receipt, and WhatsApp +234 814 188 0550 with your school name. Super Admin will activate your dashboard once payment is confirmed."
    }


@router.post("/login")
async def login(payload: LoginIn, response: Response):
    db = get_db()
    identifier = (payload.identifier or payload.email or "").strip().lower()
    if not identifier:
        raise HTTPException(status_code=400, detail="email or username required")
    # Look up by email OR username
    if "@" in identifier:
        user = await db.users.find_one({"email": identifier})
    else:
        user = await db.users.find_one({"username": identifier})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Kill-switch + payment-verification check for non-super-admins
    if user["role"] != "super_admin" and user.get("school_id"):
        school = await db.schools.find_one({"id": user["school_id"]})
        if school and school.get("kill_switch"):
            raise HTTPException(status_code=403, detail="Your school's subscription has been suspended. Please contact Corner Streams support.")
        if school and school.get("verification_status") == "pending_payment":
            raise HTTPException(status_code=403, detail="Awaiting payment verification. Please transfer the tier amount to UBA 2936722942 (Mervyndean Ifeanyichukwu Hilary), upload your receipt, then WhatsApp +234 814 188 0550 with your school name. Super Admin will activate your dashboard within hours.")
        if school and school.get("verification_status") == "rejected":
            raise HTTPException(status_code=403, detail="Payment verification rejected. Please WhatsApp +234 814 188 0550 to resolve.")

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


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


@router.post("/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    """Allow the currently logged-in user to change their own password.
    Clears the admin-recoverable auto-password (admin will need to Reset to view a new one)."""
    db = get_db()
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(payload.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_changed_by_user": True,
            "auto_password_encrypted": None,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True, "message": "Password updated"}
