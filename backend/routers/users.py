"""User management — school admin creates teacher/parent profiles."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from db import get_db, hash_password, new_id, now_iso
from auth_utils import require_roles

router = APIRouter(prefix="/users", tags=["users"])


class UserCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = Field(pattern="^(teacher|parent)$")
    username: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_]{3,30}$")
    assigned_class: Optional[str] = None  # back-compat
    assigned_classes: Optional[List[str]] = None
    school_role: Optional[str] = None  # e.g. "Subject teacher", "Form master", "Vice Principal"


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    assigned_class: Optional[str] = None
    assigned_classes: Optional[List[str]] = None
    school_role: Optional[str] = None
    password: Optional[str] = None
    username: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_]{3,30}$")


@router.get("")
async def list_users(role: Optional[str] = None, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    q = {"school_id": user["school_id"]} if user["role"] == "school_admin" else {}
    if role:
        q["role"] = role
    rows = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(2000)
    return {"users": rows}


@router.post("")
async def create_user(payload: UserCreateIn, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id(), "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name, "role": payload.role,
        "school_id": user["school_id"], "created_at": now_iso(),
    }
    if payload.username:
        un = payload.username.lower().strip()
        if await db.users.find_one({"username": un}):
            raise HTTPException(status_code=400, detail="Username already taken")
        doc["username"] = un
    if payload.role == "teacher":
        if payload.assigned_classes:
            doc["assigned_classes"] = payload.assigned_classes
        elif payload.assigned_class:
            doc["assigned_classes"] = [payload.assigned_class]
            doc["assigned_class"] = payload.assigned_class
        if payload.school_role:
            doc["school_role"] = payload.school_role
    await db.users.insert_one(doc)
    doc.pop("_id", None); doc.pop("password_hash", None)
    return {"user": doc}


@router.put("/{user_id}")
async def update_user(user_id: str, payload: UserUpdateIn, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    update = {}
    if payload.name: update["name"] = payload.name
    if payload.assigned_class is not None: update["assigned_class"] = payload.assigned_class
    if payload.assigned_classes is not None: update["assigned_classes"] = payload.assigned_classes
    if payload.school_role is not None: update["school_role"] = payload.school_role
    if payload.password: update["password_hash"] = hash_password(payload.password)
    if payload.username:
        un = payload.username.lower().strip()
        clash = await db.users.find_one({"username": un, "id": {"$ne": user_id}})
        if clash: raise HTTPException(status_code=400, detail="Username already taken")
        update["username"] = un
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = now_iso()
    await db.users.update_one({"id": user_id}, {"$set": update})
    return {"ok": True}


@router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] not in ("teacher", "parent", "student"):
        raise HTTPException(status_code=403, detail="Cannot delete admin users")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}
