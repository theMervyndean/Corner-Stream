"""Subjects router — manage subjects per class."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from db import get_db, now_iso
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/subjects", tags=["subjects"])


class SubjectsIn(BaseModel):
    class_name: str
    subjects: List[str]


@router.get("")
async def list_subjects(class_name: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = get_db()
    school_id = user.get("school_id")
    if not school_id and user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="No school context")
    q = {} if user["role"] == "super_admin" else {"school_id": school_id}
    if class_name:
        q["class_name"] = class_name
    docs = await db.class_subjects.find(q, {"_id": 0}).to_list(500)
    return {"class_subjects": docs}


@router.put("")
async def upsert_subjects(payload: SubjectsIn, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    cleaned = [s.strip() for s in payload.subjects if s and s.strip()]
    school_id = user["school_id"]
    existing = await db.class_subjects.find_one({"school_id": school_id, "class_name": payload.class_name})
    doc = {
        "school_id": school_id,
        "class_name": payload.class_name,
        "subjects": cleaned,
        "updated_at": now_iso(),
    }
    if existing:
        await db.class_subjects.update_one({"school_id": school_id, "class_name": payload.class_name}, {"$set": doc})
    else:
        doc["created_at"] = now_iso()
        await db.class_subjects.insert_one(doc)
    doc.pop("_id", None)
    return {"class_subjects": doc}


@router.delete("/{class_name}")
async def delete_subjects(class_name: str, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    res = await db.class_subjects.delete_one({"school_id": user["school_id"], "class_name": class_name})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
