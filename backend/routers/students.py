"""Students router — CRUD + Excel bulk upload."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
from io import BytesIO
import openpyxl
from db import get_db, new_id, now_iso
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/students", tags=["students"])


class StudentIn(BaseModel):
    name: str
    age: int = Field(ge=2, le=30)
    gender: str
    class_name: str
    passport_url: Optional[str] = ""
    parent_email: Optional[str] = None
    balance_due: float = 0


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    class_name: Optional[str] = None
    passport_url: Optional[str] = None
    parent_email: Optional[str] = None
    balance_due: Optional[float] = None


def _scope_filter(user: dict) -> dict:
    """Limit students by school_id for non-super-admins."""
    if user["role"] == "super_admin":
        return {}
    return {"school_id": user["school_id"]}


@router.get("")
async def list_students(class_name: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = get_db()
    q = _scope_filter(user)
    if class_name:
        q["class_name"] = class_name
    if user["role"] == "parent":
        q["parent_email"] = user["email"]
    students = await db.students.find(q, {"_id": 0}).to_list(2000)
    return {"students": students}


@router.post("")
async def create_student(payload: StudentIn, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["school_id"] = user["school_id"]
    doc["created_at"] = now_iso()
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    return {"student": doc}


@router.put("/{student_id}")
async def update_student(student_id: str, payload: StudentUpdate, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    q = _scope_filter(user)
    q["id"] = student_id
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = now_iso()
    res = await db.students.update_one(q, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    return {"student": student}


@router.delete("/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    q = _scope_filter(user)
    q["id"] = student_id
    res = await db.students.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"ok": True}


@router.post("/bulk-upload")
async def bulk_upload(file: UploadFile = File(...), user: dict = Depends(require_roles("school_admin"))):
    """Upload an .xlsx file. Required headers: name, age, gender, class_name, parent_email (optional)."""
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")
    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(BytesIO(contents), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel: {e}")

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="Excel file is empty")

    headers = [str(h or "").strip().lower().replace(" ", "_") for h in rows[0]]
    required = ["name", "age", "gender", "class_name"]
    for r in required:
        if r not in headers:
            raise HTTPException(status_code=400, detail=f"Missing required column: {r}")

    db = get_db()
    inserted: List[dict] = []
    errors: List[str] = []
    for i, row in enumerate(rows[1:], start=2):
        record = dict(zip(headers, row))
        try:
            doc = {
                "id": new_id(),
                "school_id": user["school_id"],
                "name": str(record.get("name", "")).strip(),
                "age": int(record.get("age") or 0),
                "gender": str(record.get("gender", "")).strip(),
                "class_name": str(record.get("class_name", "")).strip(),
                "parent_email": (str(record.get("parent_email")).strip().lower() if record.get("parent_email") else None),
                "passport_url": "",
                "balance_due": float(record.get("balance_due") or 0),
                "created_at": now_iso(),
            }
            if not doc["name"] or not doc["class_name"]:
                errors.append(f"Row {i}: missing name or class_name")
                continue
            await db.students.insert_one(doc)
            doc.pop("_id", None)
            inserted.append(doc)
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return {"inserted": len(inserted), "errors": errors, "students": inserted}
