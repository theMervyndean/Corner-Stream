"""Subjects router — manage subjects per class."""
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import openpyxl
from db import get_db, now_iso
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/subjects", tags=["subjects"])


class SubjectsIn(BaseModel):
    class_name: str
    subjects: List[str]
    teacher_assignments: Optional[dict] = None  # {subject_name: teacher_user_id}


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
    # Validate teacher_assignments: only keep subjects that exist + verify teachers belong to school
    teacher_assignments = {}
    if payload.teacher_assignments:
        valid_teacher_ids = set()
        async for t in db.users.find({"school_id": school_id, "role": "teacher"}, {"id": 1, "_id": 0}):
            valid_teacher_ids.add(t["id"])
        for subj, tid in payload.teacher_assignments.items():
            if subj in cleaned and tid in valid_teacher_ids:
                teacher_assignments[subj] = tid
    doc = {
        "school_id": school_id,
        "class_name": payload.class_name,
        "subjects": cleaned,
        "teacher_assignments": teacher_assignments,
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


@router.post("/bulk-upload")
async def bulk_upload_subjects(file: UploadFile = File(...), user: dict = Depends(require_roles("school_admin", "super_admin"))):
    """Long-format .xlsx upload: columns class_name | subject_name.
    Replaces subject lists for every class found in the file (per-class atomic);
    classes not in the file are left untouched."""
    db = get_db()
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload a .xlsx file")
    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(BytesIO(contents), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read workbook: {e}")
    # Use the first sheet (defaults to 'Subjects' from our template)
    ws = wb.active
    header = [str((ws.cell(row=1, column=ci).value or "")).strip().lower() for ci in range(1, ws.max_column + 1)]
    try:
        class_col = header.index("class_name") + 1
        subject_col = header.index("subject_name") + 1
    except ValueError:
        raise HTTPException(status_code=400, detail="File must have headers 'class_name' and 'subject_name' on row 1")

    # Group subjects by class (preserve order, de-dup case-insensitively)
    grouped: dict[str, list[str]] = {}
    for ri in range(2, ws.max_row + 1):
        cls = ws.cell(row=ri, column=class_col).value
        subj = ws.cell(row=ri, column=subject_col).value
        if cls is None and subj is None:
            continue
        cls = (str(cls).strip() if cls is not None else "")
        subj = (str(subj).strip() if subj is not None else "")
        if not cls or not subj:
            continue
        bucket = grouped.setdefault(cls, [])
        if subj.lower() not in {x.lower() for x in bucket}:
            bucket.append(subj)

    # Resolve which classes are valid for this school
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0, "classes": 1}) or {}
    valid_classes = set(school.get("classes") or [])

    saved: list[str] = []
    skipped: list[dict] = []
    for cls, subs in grouped.items():
        if valid_classes and cls not in valid_classes:
            skipped.append({"class_name": cls, "reason": "Class not found on school roster", "subjects": subs})
            continue
        doc = {
            "school_id": user["school_id"],
            "class_name": cls,
            "subjects": subs,
            "updated_at": now_iso(),
        }
        existing = await db.class_subjects.find_one({"school_id": user["school_id"], "class_name": cls})
        if existing:
            await db.class_subjects.update_one(
                {"school_id": user["school_id"], "class_name": cls},
                {"$set": doc},
            )
        else:
            doc["created_at"] = now_iso()
            await db.class_subjects.insert_one(doc)
        saved.append(cls)
    return {
        "saved_classes": saved,
        "saved_count": len(saved),
        "skipped": skipped,
        "skipped_count": len(skipped),
        "total_subject_rows": sum(len(v) for v in grouped.values()),
    }
