"""Super Admin (God Mode) router."""
import secrets
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
        "pending_schools": await db.schools.count_documents({"verification_status": {"$in": ["pending_payment", "pending_code"]}}),
    }


# ---------- Verification queue (WhatsApp-gated payment flow) ----------

@router.get("/verification-queue")
async def verification_queue(user: dict = Depends(require_roles("super_admin"))):
    """All schools awaiting payment verification (with their latest receipt + WhatsApp code)."""
    db = get_db()
    schools = await db.schools.find(
        {"verification_status": {"$in": ["pending_payment", "pending_code"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    items = []
    for s in schools:
        # Latest receipt for this school
        receipt = await db.bank_receipts.find_one(
            {"school_id": s["id"]}, {"_id": 0, "file_data_url": 0},
            sort=[("created_at", -1)],
        )
        # School admin user for contact
        admin = await db.users.find_one(
            {"school_id": s["id"], "role": "school_admin"},
            {"_id": 0, "email": 1, "name": 1},
        )
        items.append({
            "school_id": s["id"],
            "school_name": s["name"],
            "whatsapp_phone": s.get("whatsapp_phone") or s.get("phone") or "",
            "verification_status": s.get("verification_status"),
            "verification_code": s.get("verification_code"),
            "admin_email": (admin or {}).get("email"),
            "admin_name": (admin or {}).get("name"),
            "created_at": s.get("created_at"),
            "latest_receipt": receipt,
        })
    return {"items": items}


@router.post("/schools/{school_id}/whatsapp-code")
async def generate_whatsapp_code(school_id: str, user: dict = Depends(require_roles("super_admin"))):
    """Generate a fresh 6-digit code for this school. Super admin will WhatsApp it to the
    school's whatsapp_phone, and the school admin types it back during receipt upload."""
    db = get_db()
    code = f"{secrets.randbelow(900000) + 100000}"
    res = await db.schools.update_one(
        {"id": school_id},
        {"$set": {"verification_code": code, "verification_code_generated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="School not found")
    school = await db.schools.find_one({"id": school_id}, {"_id": 0, "name": 1, "whatsapp_phone": 1, "phone": 1})
    return {
        "ok": True,
        "code": code,
        "school_name": school["name"],
        "whatsapp_phone": school.get("whatsapp_phone") or school.get("phone") or "",
        "instructions": f"WhatsApp this 6-digit code to +{(school.get('whatsapp_phone') or school.get('phone') or '').lstrip('+')} so the school admin can paste it during receipt upload.",
    }


class VerifyDecisionIn(BaseModel):
    decision: str  # approve | reject
    note: Optional[str] = ""


@router.post("/schools/{school_id}/verify")
async def verify_school(school_id: str, payload: VerifyDecisionIn, user: dict = Depends(require_roles("super_admin"))):
    """Approve or reject a school's pending payment verification.
    On approve: marks school active, clears verification_code.
    On reject: marks school rejected so login error message shows."""
    if payload.decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve|reject")
    db = get_db()
    school = await db.schools.find_one({"id": school_id}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    if payload.decision == "approve":
        await db.schools.update_one(
            {"id": school_id},
            {"$set": {
                "verification_status": "active",
                "verification_code": None,
                "verification_note": payload.note,
                "verified_at": now_iso(),
                "verified_by": user["email"],
                "kill_switch": False,
            }},
        )
        # Also mark the latest pending bank-receipt for this school as approved
        latest = await db.bank_receipts.find_one(
            {"school_id": school_id, "status": "pending"},
            sort=[("created_at", -1)],
        )
        if latest:
            from datetime import datetime, timezone, timedelta
            days = {"1_term": 90, "2_terms": 180, "full_session": 270}.get(latest.get("duration"), 90)
            expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            await db.bank_receipts.update_one(
                {"id": latest["id"]},
                {"$set": {"status": "approved", "decided_by": user["email"], "updated_at": now_iso()}},
            )
            await db.schools.update_one(
                {"id": school_id},
                {"$set": {
                    "subscription_tier": latest.get("tier"),
                    "subscription_duration": latest.get("duration"),
                    "subscription_expires_at": expires,
                }},
            )
        return {"ok": True, "status": "active"}

    # reject
    await db.schools.update_one(
        {"id": school_id},
        {"$set": {
            "verification_status": "rejected",
            "verification_note": payload.note,
            "verified_at": now_iso(),
            "verified_by": user["email"],
        }},
    )
    return {"ok": True, "status": "rejected"}


# ---------- Cross-tenant lists (Super Admin Dashboard panes) ----------

@router.get("/users")
async def list_all_users(user: dict = Depends(require_roles("super_admin")), limit: int = 500):
    """All users across every school — for Super Admin → Users pane."""
    db = get_db()
    users = await db.users.find(
        {}, {"_id": 0, "password_hash": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    # Resolve school name for each user
    school_ids = list({u.get("school_id") for u in users if u.get("school_id")})
    schools = await db.schools.find({"id": {"$in": school_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(school_ids) or 1)
    name_by_id = {s["id"]: s["name"] for s in schools}
    for u in users:
        u["school_name"] = name_by_id.get(u.get("school_id"), "—") if u.get("school_id") else "—"
    return {"users": users}


@router.get("/students")
async def list_all_students(user: dict = Depends(require_roles("super_admin")), limit: int = 500):
    """All students across every school — for Super Admin → Students pane."""
    db = get_db()
    students = await db.students.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    school_ids = list({s.get("school_id") for s in students if s.get("school_id")})
    schools = await db.schools.find({"id": {"$in": school_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(school_ids) or 1)
    name_by_id = {s["id"]: s["name"] for s in schools}
    for s in students:
        s["school_name"] = name_by_id.get(s.get("school_id"), "—")
    return {"students": students}

