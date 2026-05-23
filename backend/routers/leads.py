"""Leads / Contact-us router."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from db import get_db, new_id, now_iso
from auth_utils import require_roles

router = APIRouter(prefix="/leads", tags=["leads"])


class LeadIn(BaseModel):
    name: str
    email: EmailStr
    school_name: Optional[str] = None
    phone: Optional[str] = None
    message: str


@router.post("")
async def submit_lead(payload: LeadIn):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["resolved"] = False
    doc["created_at"] = now_iso()
    await db.leads.insert_one(doc)
    # NOTE: Email-to-thecornerstreams@gmail.com deferred. Lead is queued in Super Admin portal.
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"], "message": "We received your inquiry. Corner Streams will reach out shortly."}


@router.get("")
async def list_leads(user: dict = Depends(require_roles("super_admin"))):
    db = get_db()
    leads = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"leads": leads}


@router.put("/{lead_id}/resolve")
async def resolve_lead(lead_id: str, user: dict = Depends(require_roles("super_admin"))):
    db = get_db()
    res = await db.leads.update_one({"id": lead_id}, {"$set": {"resolved": True, "resolved_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}
