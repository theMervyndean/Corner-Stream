"""Audit router — school admins see their school's activity (uploads, classes, exams, attempts)."""
from fastapi import APIRouter, Depends, Query
from db import get_db
from auth_utils import require_roles

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/")
async def list_audit(
    user: dict = Depends(require_roles("school_admin", "super_admin")),
    limit: int = Query(100, ge=1, le=500),
    event_type: str | None = None,
):
    """Return recent audit events for the current school (admins only).
    Strictly scoped to user.school_id — no cross-tenant leakage."""
    db = get_db()
    q = {"school_id": user["school_id"]}
    if event_type:
        q["event_type"] = event_type
    cursor = db.audit_log.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    events = await cursor.to_list(limit)

    # Counts grouped by event_type (for the activity dashboard summary cards)
    counts = {}
    async for ev in db.audit_log.find({"school_id": user["school_id"]}, {"_id": 0, "event_type": 1}):
        counts[ev["event_type"]] = counts.get(ev["event_type"], 0) + 1

    return {"events": events, "counts": counts, "total": sum(counts.values())}
