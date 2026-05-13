"""Super Admin (God Mode) router."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_db, hash_password, now_iso
from auth_utils import require_roles

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/schools")
async def list_schools(user: dict = Depends(require_roles("super_admin"))):
    db = get_db()
    schools = await db.schools.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Attach quick stats per school
    for s in schools:
        s["student_count"] = await db.students.count_documents({"school_id": s["id"]})
        s["user_count"] = await db.users.count_documents({"school_id": s["id"]})
    return {"schools": schools}


class KillSwitchIn(BaseModel):
    kill_switch: bool


@router.post("/schools/{school_id}/kill-switch")
async def toggle_kill(school_id: str, payload: KillSwitchIn, user: dict = Depends(require_roles("super_admin"))):
    db = get_db()
    res = await db.schools.update_one({"id": school_id}, {"$set": {
        "kill_switch": payload.kill_switch,
        "updated_at": now_iso(),
    }})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="School not found")
    return {"ok": True, "kill_switch": payload.kill_switch}


class PasswordOverrideIn(BaseModel):
    user_email: str
    new_password: str


@router.post("/password-override")
async def password_override(payload: PasswordOverrideIn, user: dict = Depends(require_roles("super_admin"))):
    db = get_db()
    res = await db.users.update_one(
        {"email": payload.user_email.lower().strip()},
        {"$set": {"password_hash": hash_password(payload.new_password), "password_overridden_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.get("/stats")
async def global_stats(user: dict = Depends(require_roles("super_admin"))):
    db = get_db()
    return {
        "schools": await db.schools.count_documents({}),
        "students": await db.students.count_documents({}),
        "users": await db.users.count_documents({}),
        "leads": await db.leads.count_documents({}),
        "open_leads": await db.leads.count_documents({"resolved": False}),
        "pending_receipts": await db.bank_receipts.count_documents({"status": "pending"}),
    }
