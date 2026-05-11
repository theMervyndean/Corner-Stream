"""User management — bulk uploads, password vault, promote/demote."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from io import BytesIO
import re
import openpyxl
from db import get_db, hash_password, new_id, now_iso
from auth_utils import require_roles, get_current_user
from audit_log import (
    log_event,
    EVENT_TEACHER_ADDED, EVENT_PARENT_ADDED, EVENT_BULK_TEACHERS,
    EVENT_BULK_STUDENTS, EVENT_STUDENT_ADDED,
)
from password_vault import encrypt_password, decrypt_password, generate_password

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class UserCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = Field(pattern="^(teacher|parent)$")
    username: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_]{3,30}$")
    assigned_class: Optional[str] = None
    assigned_classes: Optional[List[str]] = None
    school_role: Optional[str] = None


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    assigned_class: Optional[str] = None
    assigned_classes: Optional[List[str]] = None
    school_role: Optional[str] = None
    password: Optional[str] = None
    username: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_]{3,30}$")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _can_admin(user: dict) -> bool:
    return user.get("role") == "school_admin" or bool(user.get("is_admin"))


async def _school_handle(db, school_id: str) -> str:
    """Derive a stable handle from the school name for username generation."""
    sch = await db.schools.find_one({"id": school_id}, {"_id": 0, "name": 1, "email": 1})
    base = ""
    if sch and sch.get("email") and "@" in sch["email"]:
        base = sch["email"].split("@", 1)[1].split(".", 1)[0]
    if not base and sch:
        base = re.sub(r"[^a-z0-9]+", "", (sch.get("name") or "school").lower())[:12]
    return base or "school"


async def _unique_username(db, base: str) -> str:
    """Return a username that doesn't collide with existing users."""
    base = re.sub(r"[^a-z0-9_.]+", "", base.lower()) or "user"
    candidate = base
    n = 1
    while await db.users.find_one({"$or": [{"username": candidate}, {"email": candidate}]}):
        n += 1
        candidate = f"{base}{n}"
        if n > 999:
            candidate = f"{base}.{new_id()[:6]}"
            break
    return candidate


def _read_xlsx(file_contents: bytes):
    try:
        wb = openpyxl.load_workbook(BytesIO(file_contents), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel: {e}")
    # Prefer a sheet called "Data", else the first sheet.
    ws = wb["Data"] if "Data" in wb.sheetnames else wb.active
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="Excel file is empty")
    headers = [str(h or "").strip().lower().replace(" ", "_") for h in rows[0]]
    return headers, rows


def _row_is_blank(record: dict) -> bool:
    for v in record.values():
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        return False
    return True


# ---------------------------------------------------------------------------
# Listing & manual create / delete (existing behaviour kept)
# ---------------------------------------------------------------------------
@router.get("")
async def list_users(role: Optional[str] = None, user: dict = Depends(require_roles("school_admin", "super_admin"))):
    db = get_db()
    q = {"school_id": user["school_id"]} if user["role"] == "school_admin" else {}
    if role:
        q["role"] = role
    rows = await db.users.find(q, {"_id": 0, "password_hash": 0, "auto_password_encrypted": 0}).to_list(2000)
    return {"users": rows}


@router.post("")
async def create_user(payload: UserCreateIn, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id(), "email": email,
        "password_hash": hash_password(payload.password),
        "auto_password_encrypted": encrypt_password(payload.password),
        "password_changed_by_user": False,
        "name": payload.name, "role": payload.role,
        "school_id": user["school_id"], "created_at": now_iso(),
        "created_by": user.get("id"),
    }
    if payload.username:
        un = payload.username.lower().strip()
        if await db.users.find_one({"username": un}):
            raise HTTPException(status_code=400, detail="Username already taken")
        doc["username"] = un
    if payload.role == "teacher":
        if payload.assigned_classes:
            doc["assigned_classes"] = payload.assigned_classes
        elif payload.assigned_class:
            doc["assigned_classes"] = [payload.assigned_class]
            doc["assigned_class"] = payload.assigned_class
        if payload.school_role:
            doc["school_role"] = payload.school_role
    await db.users.insert_one(doc)
    out = {k: v for k, v in doc.items() if k not in ("_id", "password_hash", "auto_password_encrypted")}
    await log_event(
        school_id=user["school_id"],
        event_type=EVENT_TEACHER_ADDED if payload.role == "teacher" else EVENT_PARENT_ADDED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"{payload.role.capitalize()} added: {out['name']} ({email})",
        details={"user_id": out["id"], "email": email, "role": payload.role,
                 "assigned_class": out.get("assigned_class")},
    )
    return {"user": out}


@router.put("/{user_id}")
async def update_user(user_id: str, payload: UserUpdateIn, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    update = {}
    if payload.name: update["name"] = payload.name
    if payload.assigned_class is not None: update["assigned_class"] = payload.assigned_class
    if payload.assigned_classes is not None: update["assigned_classes"] = payload.assigned_classes
    if payload.school_role is not None: update["school_role"] = payload.school_role
    if payload.password:
        update["password_hash"] = hash_password(payload.password)
        update["auto_password_encrypted"] = encrypt_password(payload.password)
        update["password_changed_by_user"] = False
    if payload.username:
        un = payload.username.lower().strip()
        clash = await db.users.find_one({"username": un, "id": {"$ne": user_id}})
        if clash: raise HTTPException(status_code=400, detail="Username already taken")
        update["username"] = un
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = now_iso()
    await db.users.update_one({"id": user_id}, {"$set": update})
    return {"ok": True}


@router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot delete super admin")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    # Guard: cannot delete the last school_admin
    if target.get("role") == "school_admin":
        remaining = await db.users.count_documents({"school_id": user["school_id"], "role": "school_admin", "id": {"$ne": user_id}})
        if remaining == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last school admin — promote someone else first")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Password vault — reveal, reset
# ---------------------------------------------------------------------------
@router.get("/{user_id}/reveal-password")
async def reveal_password(user_id: str, user: dict = Depends(require_roles("school_admin"))):
    """Show the original auto-generated password if the user has never changed it."""
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot reveal super admin password")
    changed = bool(target.get("password_changed_by_user"))
    if changed:
        raise HTTPException(status_code=410, detail="User has set their own password — use Reset to generate a new one")
    plain = decrypt_password(target.get("auto_password_encrypted"))
    if not plain:
        raise HTTPException(status_code=410, detail="No stored password to reveal — use Reset to generate a new one")
    await log_event(
        school_id=user["school_id"], event_type="password_revealed",
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Revealed password for {target.get('name')} ({target.get('email')})",
        details={"target_user_id": user_id, "target_email": target.get("email")},
    )
    return {"email": target["email"], "username": target.get("username"),
            "name": target["name"], "role": target["role"], "password": plain}


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, user: dict = Depends(require_roles("school_admin"))):
    """Generate a new auto password for this user, return it once (it stays admin-viewable until user changes it)."""
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot reset super admin password")
    new_pw = generate_password(10)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": hash_password(new_pw),
            "auto_password_encrypted": encrypt_password(new_pw),
            "password_changed_by_user": False,
            "updated_at": now_iso(),
        }},
    )
    await log_event(
        school_id=user["school_id"], event_type="password_reset",
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Reset password for {target.get('name')} ({target.get('email')})",
        details={"target_user_id": user_id, "target_email": target.get("email")},
    )
    return {"email": target["email"], "username": target.get("username"),
            "name": target["name"], "role": target["role"], "password": new_pw}


# ---------------------------------------------------------------------------
# Promote / demote (admin powers, keeps primary role)
# ---------------------------------------------------------------------------
@router.post("/{user_id}/promote")
async def promote_to_admin(user_id: str, user: dict = Depends(require_roles("school_admin"))):
    """Grant admin powers to a teacher/parent (they keep their primary role)."""
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") not in ("teacher", "parent"):
        raise HTTPException(status_code=400, detail="Only teachers or parents can be promoted to admin")
    if target.get("is_admin"):
        raise HTTPException(status_code=400, detail="User already has admin powers")
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": True, "promoted_at": now_iso(), "promoted_by": user.get("id")}})
    await log_event(
        school_id=user["school_id"], event_type="user_promoted_admin",
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Promoted {target.get('name')} ({target.get('email')}) to admin while keeping {target.get('role')} role",
        details={"target_user_id": user_id, "target_email": target.get("email"), "primary_role": target.get("role")},
    )
    return {"ok": True}


@router.post("/{user_id}/demote")
async def demote_from_admin(user_id: str, user: dict = Depends(require_roles("school_admin"))):
    """Revoke admin powers (only affects is_admin flag; primary role unchanged)."""
    db = get_db()
    target = await db.users.find_one({"id": user_id, "school_id": user["school_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    if not target.get("is_admin"):
        raise HTTPException(status_code=400, detail="User does not have admin powers")
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": False, "demoted_at": now_iso()}})
    await log_event(
        school_id=user["school_id"], event_type="user_demoted_admin",
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Revoked admin powers from {target.get('name')} ({target.get('email')})",
        details={"target_user_id": user_id, "target_email": target.get("email")},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bulk uploads — teachers / parents / students
# ---------------------------------------------------------------------------
@router.post("/bulk-teachers")
async def bulk_teachers(file: UploadFile = File(...), user: dict = Depends(require_roles("school_admin"))):
    """Bulk-upload teachers. Required: name, email. Optional: password (auto-generated if blank),
    phone, assigned_class, subject_specialty. Returns created credentials so admin can distribute."""
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")
    headers, rows = _read_xlsx(await file.read())
    required = ["name", "email"]
    for r in required:
        if r not in headers:
            raise HTTPException(status_code=400, detail=f"Missing required column: {r}")

    db = get_db()
    created: List[dict] = []
    skipped: List[dict] = []

    for i, row in enumerate(rows[1:], start=2):
        if not row:
            continue
        record = dict(zip(headers, row))
        if _row_is_blank(record):
            continue
        try:
            email = str(record.get("email") or "").strip().lower()
            name = str(record.get("name") or "").strip()
            if not email or "@" not in email or not name:
                skipped.append({"row": i, "reason": "Missing or invalid name/email"})
                continue
            if await db.users.find_one({"email": email}):
                skipped.append({"row": i, "reason": f"Email {email} already exists"})
                continue
            pw_raw = str(record.get("password") or "").strip()
            password = pw_raw if pw_raw else generate_password(10)
            doc = {
                "id": new_id(), "email": email, "name": name,
                "password_hash": hash_password(password),
                "auto_password_encrypted": encrypt_password(password),
                "password_changed_by_user": False,
                "role": "teacher", "school_id": user["school_id"],
                "phone": str(record.get("phone") or "").strip() or None,
                "subject_specialty": str(record.get("subject_specialty") or "").strip() or None,
                "created_at": now_iso(),
                "created_by": user.get("id"),
            }
            assigned = str(record.get("assigned_class") or "").strip()
            if assigned:
                doc["assigned_class"] = assigned
                doc["assigned_classes"] = [assigned]
            await db.users.insert_one(doc)
            created.append({
                "name": name, "email": email, "password": password,
                "role": "teacher", "assigned_class": assigned or None,
            })
        except Exception as e:
            skipped.append({"row": i, "reason": str(e)})

    await log_event(
        school_id=user["school_id"], event_type=EVENT_BULK_TEACHERS,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Bulk upload — {len(created)} teachers added, {len(skipped)} skipped",
        details={"filename": file.filename, "inserted_count": len(created),
                 "error_count": len(skipped), "teacher_names": [t["name"] for t in created[:20]]},
    )
    return {"created": created, "skipped": skipped, "role": "teacher"}


@router.post("/bulk-parents")
async def bulk_parents(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Bulk-upload parents. Required: parent_name, parent_email, student_name, student_class.
    Optional: parent_phone, password (auto-generated if blank).
    Teachers can only upload for their assigned_class(es). Students not on roster are skipped.
    Admin (or promoted-admin) can upload for any class."""
    is_admin = _can_admin(user)
    if user.get("role") != "teacher" and not is_admin:
        raise HTTPException(status_code=403, detail="Only school admins or class teachers can upload parents")

    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")
    headers, rows = _read_xlsx(await file.read())
    required = ["parent_name", "parent_email", "student_name", "student_class"]
    for r in required:
        if r not in headers:
            raise HTTPException(status_code=400, detail=f"Missing required column: {r}")

    db = get_db()
    school_id = user["school_id"]
    # Teacher's allowed classes
    allowed_classes: Optional[set[str]] = None
    if user.get("role") == "teacher" and not is_admin:
        cls = []
        if user.get("assigned_classes"):
            cls.extend(user["assigned_classes"])
        elif user.get("assigned_class"):
            cls.append(user["assigned_class"])
        allowed_classes = set(c.strip() for c in cls if c)
        if not allowed_classes:
            raise HTTPException(status_code=400, detail="You don't have any assigned classes — ask your admin to assign one first")

    created: List[dict] = []
    skipped: List[dict] = []

    for i, row in enumerate(rows[1:], start=2):
        if not row:
            continue
        record = dict(zip(headers, row))
        if _row_is_blank(record):
            continue
        try:
            p_name = str(record.get("parent_name") or "").strip()
            p_email = str(record.get("parent_email") or "").strip().lower()
            s_name = str(record.get("student_name") or "").strip()
            s_class = str(record.get("student_class") or "").strip()
            if not p_name or "@" not in p_email or not s_name or not s_class:
                skipped.append({"row": i, "reason": "Missing parent_name / parent_email / student_name / student_class"})
                continue
            if allowed_classes is not None and s_class not in allowed_classes:
                skipped.append({"row": i, "reason": f"Class '{s_class}' is not in your assigned class list"})
                continue
            # Strict student lookup
            student = await db.students.find_one({
                "school_id": school_id,
                "name": {"$regex": f"^{re.escape(s_name)}$", "$options": "i"},
                "class_name": s_class,
            })
            if not student:
                skipped.append({"row": i, "reason": f"Student '{s_name}' in '{s_class}' not found on roster"})
                continue
            # If a user already exists with this email, just link the student to them
            existing = await db.users.find_one({"email": p_email})
            if existing:
                if existing.get("role") != "parent":
                    skipped.append({"row": i, "reason": f"Email {p_email} already used by a {existing.get('role')} account"})
                    continue
                # Just link student to existing parent
                await db.students.update_one({"id": student["id"]}, {"$set": {"parent_email": p_email, "parent_name": p_name, "updated_at": now_iso()}})
                skipped.append({"row": i, "reason": f"Parent {p_email} already exists — linked to {student['name']}"})
                continue
            pw_raw = str(record.get("password") or "").strip()
            password = pw_raw if pw_raw else generate_password(10)
            doc = {
                "id": new_id(), "email": p_email, "name": p_name,
                "password_hash": hash_password(password),
                "auto_password_encrypted": encrypt_password(password),
                "password_changed_by_user": False,
                "role": "parent", "school_id": school_id,
                "phone": str(record.get("parent_phone") or "").strip() or None,
                "created_at": now_iso(),
                "created_by": user.get("id"),
            }
            await db.users.insert_one(doc)
            # Link student
            await db.students.update_one(
                {"id": student["id"]},
                {"$set": {"parent_email": p_email, "parent_name": p_name, "updated_at": now_iso()}},
            )
            created.append({
                "name": p_name, "email": p_email, "password": password,
                "role": "parent", "student_name": student["name"], "student_class": student["class_name"],
            })
        except Exception as e:
            skipped.append({"row": i, "reason": str(e)})

    await log_event(
        school_id=school_id, event_type=EVENT_PARENT_ADDED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Bulk parent upload — {len(created)} added, {len(skipped)} skipped",
        details={"filename": file.filename, "inserted_count": len(created),
                 "error_count": len(skipped), "by_role": user.get("role")},
    )
    # Teachers don't get the actual passwords — admin distributes them.
    if user.get("role") == "teacher" and not is_admin:
        teacher_safe = [{
            "name": c["name"], "email": c["email"], "student_name": c["student_name"],
            "student_class": c["student_class"], "password": "[hidden — ask admin]",
        } for c in created]
        return {"created": teacher_safe, "skipped": skipped, "role": "parent",
                "note": "Passwords are visible only to the school admin"}
    return {"created": created, "skipped": skipped, "role": "parent"}


@router.post("/bulk-students")
async def bulk_students(file: UploadFile = File(...), with_login: bool = True, user: dict = Depends(require_roles("school_admin"))):
    """Bulk-upload students. Required: name, class_name. Optional: age, gender, parent_name,
    parent_email, parent_phone, balance_due.
    If with_login is true (default), auto-generates a student login (username + password)."""
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")
    headers, rows = _read_xlsx(await file.read())
    required = ["name", "class_name"]
    for r in required:
        if r not in headers:
            raise HTTPException(status_code=400, detail=f"Missing required column: {r}")

    db = get_db()
    school_id = user["school_id"]
    school = await db.schools.find_one({"id": school_id}, {"_id": 0, "classes": 1})
    school_classes = list((school or {}).get("classes") or [])
    new_classes_added: List[str] = []
    handle = await _school_handle(db, school_id)

    created: List[dict] = []
    skipped: List[dict] = []

    for i, row in enumerate(rows[1:], start=2):
        if not row:
            continue
        record = dict(zip(headers, row))
        if _row_is_blank(record):
            continue
        try:
            name = str(record.get("name") or "").strip()
            class_name = str(record.get("class_name") or "").strip()
            if not name or not class_name:
                skipped.append({"row": i, "reason": "Missing name or class_name"})
                continue
            doc = {
                "id": new_id(), "school_id": school_id,
                "name": name,
                "age": int(record.get("age") or 0) or None,
                "gender": str(record.get("gender") or "").strip() or None,
                "class_name": class_name,
                "parent_name": str(record.get("parent_name") or "").strip() or None,
                "parent_email": (str(record.get("parent_email")).strip().lower() if record.get("parent_email") else None),
                "parent_phone": str(record.get("parent_phone") or "").strip() or None,
                "passport_url": "",
                "balance_due": float(record.get("balance_due") or 0),
                "created_at": now_iso(),
            }
            if class_name not in school_classes:
                school_classes.append(class_name)
                new_classes_added.append(class_name)
            await db.students.insert_one(doc)

            entry = {
                "name": name, "class_name": class_name,
                "role": "student", "username": None, "password": None,
            }
            if with_login:
                # Generate username: firstname.lastname → fallback to handle.firstname
                slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")
                base = f"{slug}.{handle}" if slug else f"student.{handle}"
                username = await _unique_username(db, base)
                password = generate_password(10)
                login_email = f"{username}@{handle}.school"
                # Make sure synthetic email doesn't collide
                ce = 1
                while await db.users.find_one({"email": login_email}):
                    ce += 1
                    login_email = f"{username}{ce}@{handle}.school"
                await db.users.insert_one({
                    "id": new_id(),
                    "email": login_email,
                    "username": username,
                    "password_hash": hash_password(password),
                    "auto_password_encrypted": encrypt_password(password),
                    "password_changed_by_user": False,
                    "name": name, "role": "student",
                    "school_id": school_id, "student_id": doc["id"],
                    "created_at": now_iso(),
                    "created_by": user.get("id"),
                })
                entry.update({"username": username, "password": password, "email": login_email})
            created.append(entry)
        except Exception as e:
            skipped.append({"row": i, "reason": str(e)})

    if new_classes_added:
        await db.schools.update_one(
            {"id": school_id},
            {"$set": {"classes": school_classes, "updated_at": now_iso()}},
        )
    await log_event(
        school_id=school_id, event_type=EVENT_BULK_STUDENTS,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Bulk upload — {len(created)} students added, {len(skipped)} skipped",
        details={"filename": file.filename, "inserted_count": len(created),
                 "error_count": len(skipped), "new_classes_added": new_classes_added,
                 "with_login": bool(with_login)},
    )
    return {"created": created, "skipped": skipped, "role": "student",
            "new_classes_added": new_classes_added}
