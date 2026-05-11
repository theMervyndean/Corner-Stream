"""Students router — CRUD + Excel bulk upload + student login provisioning."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from io import BytesIO
import openpyxl
from db import get_db, hash_password, new_id, now_iso
from auth_utils import get_current_user, require_roles
from audit_log import log_event, EVENT_BULK_STUDENTS, EVENT_STUDENT_ADDED

router = APIRouter(prefix="/students", tags=["students"])


class StudentIn(BaseModel):
    name: str
    age: int = Field(ge=2, le=30)
    gender: str
    class_name: str
    passport_url: Optional[str] = ""
    parent_name: Optional[str] = ""
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = ""
    balance_due: float = 0


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    class_name: Optional[str] = None
    passport_url: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
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
    # Attach a "has_login" indicator for school_admin/super_admin
    if user["role"] in ("school_admin", "super_admin"):
        sids = [s["id"] for s in students]
        login_users = await db.users.find({"role": "student", "student_id": {"$in": sids}}, {"_id": 0, "email": 1, "student_id": 1}).to_list(2000)
        login_map = {u["student_id"]: u["email"] for u in login_users}
        for s in students:
            s["login_email"] = login_map.get(s["id"])
    return {"students": students}


@router.get("/me")
async def my_student_record(user: dict = Depends(require_roles("student"))):
    db = get_db()
    sid = user.get("student_id")
    if not sid:
        raise HTTPException(status_code=404, detail="No linked student record")
    student = await db.students.find_one({"id": sid}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"student": student}


@router.post("")
async def create_student(payload: StudentIn, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["school_id"] = user["school_id"]
    doc["created_at"] = now_iso()
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    await log_event(
        school_id=user["school_id"], event_type=EVENT_STUDENT_ADDED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Student added: {doc['name']} ({doc['class_name']})",
        details={"student_id": doc["id"], "name": doc["name"], "class_name": doc["class_name"]},
    )
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
    # Load school's current class roster for validation/auto-expansion
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0, "classes": 1})
    school_classes = list((school or {}).get("classes") or [])
    new_classes_added: List[str] = []

    inserted: List[dict] = []
    errors: List[str] = []
    for i, row in enumerate(rows[1:], start=2):
        record = dict(zip(headers, row))
        try:
            class_name = str(record.get("class_name", "")).strip()
            doc = {
                "id": new_id(),
                "school_id": user["school_id"],
                "name": str(record.get("name", "")).strip(),
                "age": int(record.get("age") or 0),
                "gender": str(record.get("gender", "")).strip(),
                "class_name": class_name,
                "parent_name": str(record.get("parent_name") or "").strip(),
                "parent_email": (str(record.get("parent_email")).strip().lower() if record.get("parent_email") else None),
                "parent_phone": str(record.get("parent_phone") or "").strip(),
                "passport_url": "",
                "balance_due": float(record.get("balance_due") or 0),
                "created_at": now_iso(),
            }
            if not doc["name"] or not doc["class_name"]:
                errors.append(f"Row {i}: missing name or class_name")
                continue
            # Auto-expand class roster if this is a new class name
            if class_name and class_name not in school_classes:
                school_classes.append(class_name)
                new_classes_added.append(class_name)
            await db.students.insert_one(doc)
            doc.pop("_id", None)
            inserted.append(doc)
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    # Persist new classes back to school
    if new_classes_added:
        await db.schools.update_one(
            {"id": user["school_id"]},
            {"$set": {"classes": school_classes, "updated_at": now_iso()}},
        )

    # Audit log this bulk upload
    await log_event(
        school_id=user["school_id"],
        event_type=EVENT_BULK_STUDENTS,
        actor_id=user.get("id"),
        actor_name=user.get("name"),
        actor_role=user.get("role"),
        summary=f"Bulk upload — {len(inserted)} students inserted, {len(errors)} errors",
        details={
            "filename": file.filename,
            "inserted_count": len(inserted),
            "error_count": len(errors),
            "new_classes_added": new_classes_added,
            "student_names": [s["name"] for s in inserted[:20]],  # preview first 20
        },
    )

    return {"inserted": len(inserted), "errors": errors, "students": inserted, "new_classes_added": new_classes_added}



class LoginCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


@router.post("/{student_id}/login")
async def create_student_login(student_id: str, payload: LoginCreateIn, user: dict = Depends(require_roles("school_admin"))):
    """Provision a student login (role=student) linked to this student record."""
    db = get_db()
    student = await db.students.find_one({"id": student_id, "school_id": user["school_id"]})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    # Remove any pre-existing student login for this student (replace flow)
    await db.users.delete_many({"role": "student", "student_id": student_id})
    user_doc = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": student["name"],
        "role": "student",
        "school_id": student["school_id"],
        "student_id": student_id,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    return {"ok": True, "email": email}


class PassportIn(BaseModel):
    passport_url: str  # data URL


@router.put("/{student_id}/passport")
async def upload_passport(student_id: str, payload: PassportIn, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    q = _scope_filter(user)
    q["id"] = student_id
    res = await db.students.update_one(q, {"$set": {"passport_url": payload.passport_url, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"ok": True}
