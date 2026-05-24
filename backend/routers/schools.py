"""Schools router — school info, subscription, class roster management."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from db import get_db, now_iso, default_classes, SCHOOL_TYPES, _calc_grade
from auth_utils import get_current_user, require_roles
from audit_log import log_event, EVENT_CLASS_ADDED, EVENT_CLASS_REMOVED

router = APIRouter(prefix="/schools", tags=["schools"])


async def _realign_scores_to_new_structure(
    db, school_id: str, new_weights: List[int], new_exam_max: int,
) -> dict:
    """Mid-term resiliency: when ca_weights length and/or exam_max change, walk
    every score doc for this school and resize/clamp in place. Never wipes data.

    Rules:
    - Resize ca_scores to len(new_weights): truncate tail when shrinking, pad
      with 0 when growing.
    - Clamp each ca_scores[i] to new_weights[i] (so a column that lost weight
      doesn't leave an over-cap value behind).
    - Clamp exam_score to new_exam_max.
    - Rebuild derived scalars: ca_score = sum(ca_scores), total = ca_score +
      exam_score, grade = _calc_grade(total).
    - Legacy docs (no ca_scores) get a fresh zero-filled array sized to the new
      length, seeded with the clamped legacy ca_score in column 0.

    Returns a small summary {resized, clamped_ca, clamped_exam, total_seen}.
    """
    new_len = len(new_weights)
    cursor = db.scores.find({"school_id": school_id}, {"_id": 0})
    summary = {"resized": 0, "clamped_ca": 0, "clamped_exam": 0, "total_seen": 0}
    async for doc in cursor:
        summary["total_seen"] += 1
        old_arr = doc.get("ca_scores")
        legacy_ca = int(doc.get("ca_score") or 0)
        # Build new ca_scores array
        if isinstance(old_arr, list):
            arr = [int(v or 0) for v in old_arr]
            if len(arr) != new_len:
                summary["resized"] += 1
                if len(arr) > new_len:
                    arr = arr[:new_len]  # truncate tail
                else:
                    arr = arr + [0] * (new_len - len(arr))  # pad with zeros
        else:
            # Legacy single-scalar row → reseed
            summary["resized"] += 1
            arr = [0] * new_len
            if new_len > 0:
                arr[0] = min(legacy_ca, int(new_weights[0]))
        # Per-column clamp against the new weight caps
        for i in range(new_len):
            cap = int(new_weights[i])
            if arr[i] > cap:
                arr[i] = cap
                summary["clamped_ca"] += 1
            if arr[i] < 0:
                arr[i] = 0
        # Exam clamp
        new_exam = int(doc.get("exam_score") or 0)
        if new_exam > new_exam_max:
            new_exam = new_exam_max
            summary["clamped_exam"] += 1
        if new_exam < 0:
            new_exam = 0
        # Derived scalars
        ca_total = sum(arr)
        total = ca_total + new_exam
        grade = _calc_grade(total)
        await db.scores.update_one(
            {"id": doc["id"]},
            {"$set": {
                "ca_scores": arr,
                "ca_score": ca_total,
                "exam_score": new_exam,
                "total": total,
                "grade": grade,
                "realigned_at": now_iso(),
            }},
        )
    return summary


class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    school_type: Optional[Literal["primary", "secondary", "mixed"]] = None
    classes: Optional[List[str]] = None
    principal_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    motto: Optional[str] = None
    logo_url: Optional[str] = None
    founded_year: Optional[str] = None
    website: Optional[str] = None
    brand_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ca_max: Optional[int] = Field(default=None, ge=0, le=100)
    exam_max: Optional[int] = Field(default=None, ge=0, le=100)
    ca_count: Optional[int] = Field(default=None, ge=1, le=6)
    # New per-column CA weight model. Length 2..5, each ≥ 1.
    # When provided alongside exam_max, sum(ca_weights) + exam_max must equal 100.
    ca_weights: Optional[List[int]] = None


@router.get("/me")
async def my_school(user: dict = Depends(get_current_user)):
    """Return ONLY the school of the authenticated user. Hard-isolated by school_id."""
    if not user.get("school_id"):
        raise HTTPException(status_code=404, detail="No school associated")
    db = get_db()
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    # Backfill classes/school_type in response if missing
    if not school.get("classes"):
        school["classes"] = default_classes(school.get("school_type") or "secondary")
    if not school.get("school_type"):
        school["school_type"] = "secondary"
    return {"school": school}


@router.put("/me")
async def update_my_school(payload: SchoolUpdate, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Capture the pre-update assessment structure so we can detect a real change
    # to ca_weights / exam_max and re-align existing score docs after the save.
    pre = await db.schools.find_one(
        {"id": user["school_id"]}, {"_id": 0, "ca_weights": 1, "ca_max": 1, "exam_max": 1},
    ) or {}
    old_weights = list(pre.get("ca_weights") or [])
    old_exam_max = int(pre.get("exam_max") or 0)
    # Sanitize classes: trim, dedupe (preserve order), drop empty
    if "classes" in update:
        seen = set()
        cleaned = []
        for c in update["classes"]:
            n = (c or "").strip()
            if n and n not in seen:
                seen.add(n)
                cleaned.append(n)
        if not cleaned:
            raise HTTPException(status_code=400, detail="At least one class required")
        update["classes"] = cleaned
    if "school_type" in update and update["school_type"] not in SCHOOL_TYPES:
        raise HTTPException(status_code=400, detail="Invalid school_type")
    # ── Assessment structure (CA columns + exam) ──
    # Per-column CA weight model. Validate first; then derive ca_max / ca_count
    # so legacy clients reading those scalar fields stay consistent.
    if update.get("ca_weights") is not None:
        weights = update["ca_weights"]
        if not isinstance(weights, list) or not (2 <= len(weights) <= 5):
            raise HTTPException(status_code=400, detail="CA columns must be between 2 and 5")
        try:
            weights = [int(w) for w in weights]
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="CA weights must be integers")
        if any(w < 1 for w in weights):
            raise HTTPException(status_code=400, detail="Each CA weight must be at least 1")
        # Resolve exam_max: prefer the incoming value, else fall back to existing school doc
        if update.get("exam_max") is not None:
            exam_val = int(update["exam_max"])
        else:
            exam_val = int(pre.get("exam_max") or 0)
        if exam_val < 1:
            raise HTTPException(status_code=400, detail="Exam max must be at least 1")
        if sum(weights) + exam_val != 100:
            raise HTTPException(status_code=400, detail=f"CA weights ({sum(weights)}) + Exam ({exam_val}) must total 100")
        update["ca_weights"] = weights
        update["ca_max"] = sum(weights)
        update["ca_count"] = len(weights)
        update["exam_max"] = exam_val
    # Legacy fallback: when only ca_max/exam_max are provided (no ca_weights), keep the old rule.
    elif update.get("ca_max") is not None and update.get("exam_max") is not None:
        if int(update["ca_max"]) + int(update["exam_max"]) != 100:
            raise HTTPException(status_code=400, detail="CA + Exam max scores must add to 100")
    update["updated_at"] = now_iso()
    await db.schools.update_one({"id": user["school_id"]}, {"$set": update})

    # ── Mid-term resiliency: re-align existing score docs when the marking
    # structure actually changed (length or per-column caps or exam_max).
    # No-op when the shape is unchanged, keeping the hot path zero-cost.
    realign_summary = None
    new_weights = update.get("ca_weights") if update.get("ca_weights") is not None else old_weights
    new_exam_max = int(update.get("exam_max") if update.get("exam_max") is not None else old_exam_max)
    structure_changed = bool(new_weights) and (
        len(new_weights) != len(old_weights)
        or [int(w) for w in new_weights] != [int(w) for w in old_weights]
        or new_exam_max != old_exam_max
    )
    if structure_changed:
        realign_summary = await _realign_scores_to_new_structure(
            db, user["school_id"], list(new_weights), new_exam_max,
        )

    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    out: dict = {"school": school}
    if realign_summary is not None:
        out["realignment"] = realign_summary
    return out


# ---- Class roster helpers ----
class ClassAddIn(BaseModel):
    class_name: str = Field(min_length=1, max_length=80)


@router.post("/me/classes")
async def add_class(payload: ClassAddIn, user: dict = Depends(require_roles("school_admin"))):
    """Append a new class name to the school's roster (e.g., 'JSS 1 Crystal')."""
    db = get_db()
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    classes = list(school.get("classes") or default_classes(school.get("school_type") or "secondary"))
    name = payload.class_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Class name cannot be empty")
    if name in classes:
        raise HTTPException(status_code=400, detail="Class already exists")
    classes.append(name)
    await db.schools.update_one({"id": user["school_id"]}, {"$set": {"classes": classes, "updated_at": now_iso()}})
    await log_event(
        school_id=user["school_id"], event_type=EVENT_CLASS_ADDED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Class added: {name}", details={"class_name": name},
    )
    return {"classes": classes}


@router.delete("/me/classes/{class_name}")
async def remove_class(class_name: str, user: dict = Depends(require_roles("school_admin"))):
    """Remove a class from the roster. Cannot remove if students are assigned to it."""
    db = get_db()
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    classes = list(school.get("classes") or [])
    if class_name not in classes:
        raise HTTPException(status_code=404, detail="Class not found in roster")
    # Block removal if students are assigned
    in_use = await db.students.count_documents({"school_id": user["school_id"], "class_name": class_name})
    if in_use > 0:
        raise HTTPException(status_code=400, detail=f"Cannot remove — {in_use} student(s) are assigned to {class_name}")
    classes.remove(class_name)
    if not classes:
        raise HTTPException(status_code=400, detail="Cannot remove last class")
    await db.schools.update_one({"id": user["school_id"]}, {"$set": {"classes": classes, "updated_at": now_iso()}})
    await log_event(
        school_id=user["school_id"], event_type=EVENT_CLASS_REMOVED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Class removed: {class_name}", details={"class_name": class_name},
    )
    return {"classes": classes}



class ClassRenameIn(BaseModel):
    new_name: str = Field(min_length=1, max_length=80)


@router.put("/me/classes/{old_name}")
async def rename_class(old_name: str, payload: ClassRenameIn, user: dict = Depends(require_roles("school_admin"))):
    """Rename a class in the roster. Also renames the class on every student, scores, skills,
    class_subjects and cbt_exams record that references it."""
    db = get_db()
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    classes = list(school.get("classes") or [])
    if old_name not in classes:
        raise HTTPException(status_code=404, detail="Class not found in roster")
    new_name = payload.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="New name required")
    if new_name == old_name:
        return {"classes": classes}
    if new_name in classes:
        raise HTTPException(status_code=400, detail=f'"{new_name}" already exists')
    classes = [new_name if c == old_name else c for c in classes]
    await db.schools.update_one({"id": user["school_id"]}, {"$set": {"classes": classes, "updated_at": now_iso()}})
    # Cascade rename across collections scoped to this school
    for col in ("students", "class_subjects", "cbt_exams", "scores", "skill_ratings"):
        await db[col].update_many(
            {"school_id": user["school_id"], "class_name": old_name},
            {"$set": {"class_name": new_name, "updated_at": now_iso()}},
        )
    await log_event(
        school_id=user["school_id"], event_type=EVENT_CLASS_ADDED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Class renamed: {old_name} → {new_name}", details={"old_name": old_name, "new_name": new_name},
    )
    return {"classes": classes, "old_name": old_name, "new_name": new_name}
