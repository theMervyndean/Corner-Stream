"""Schools router — school info, subscription, class roster management."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from db import get_db, now_iso, default_classes, SCHOOL_TYPES
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/schools", tags=["schools"])


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
    update["updated_at"] = now_iso()
    await db.schools.update_one({"id": user["school_id"]}, {"$set": update})
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    return {"school": school}


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
    return {"classes": classes}
