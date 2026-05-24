"""Messages router — cross-role messaging / learning-material delivery.

Three endpoints:
- POST   /api/messages              (school_admin / teacher only — blast content)
- GET    /api/messages/my-stream    (any authenticated user — scoped to their role + class)
- POST   /api/messages/{id}/read    (any authenticated user — mark read for badge clearing)
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from db import get_db
from auth_utils import get_current_user, require_roles, teacher_assigned_classes, is_scoped_teacher
from models.message import MessageIn, Message, to_doc

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("")
async def create_message(
    payload: MessageIn,
    user: dict = Depends(require_roles("school_admin", "teacher", "super_admin")),
):
    """Admins / teachers broadcast content, assignments or learning materials.

    Scoping rules:
    - super_admin: may target any role; may set target_school_id to privately
      route to a single school, or leave null for a global cross-school broadcast.
    - school_admin: messages stay inside their school; target_school_id is forced
      to None. Their default audience (when not explicitly overridden) is "admin"
      so admin chatter doesn't bleed out to teachers/students/parents.
    - teacher: may only target classes within their assigned_classes list.
    """
    db = get_db()
    role = user.get("role")
    target_school_id = payload.target_school_id
    target_role = payload.target_role

    if role == "super_admin":
        # Optional school targeting — validate the school exists if provided.
        if target_school_id:
            exists = await db.schools.find_one({"id": target_school_id}, {"_id": 0, "id": 1})
            if not exists:
                raise HTTPException(status_code=404, detail="Target school not found")
    elif role == "school_admin":
        # Private invariant: school admins cannot redirect their messages to
        # other schools, and their audience defaults to admin-only.
        target_school_id = None
        if not target_role:
            target_role = "admin"
    elif role == "teacher":
        # Teachers cannot target admins or other schools.
        target_school_id = None
        if target_role == "admin":
            raise HTTPException(status_code=403, detail="Teachers cannot send admin-only messages")
        if is_scoped_teacher(user):
            allowed = set(teacher_assigned_classes(user))
            if payload.target_class and payload.target_class not in allowed:
                raise HTTPException(
                    status_code=403,
                    detail="You can only message classes you are assigned to",
                )
            if not payload.target_class and not allowed:
                raise HTTPException(
                    status_code=403,
                    detail="You have no assigned classes — cannot send messages",
                )

    msg = Message(
        sender_id=user["id"],
        sender_role=role,
        school_id=user.get("school_id"),
        target_role=target_role,
        target_class=payload.target_class,
        target_school_id=target_school_id,
        message_type=payload.message_type,
        content=payload.content,
        attachment_url=payload.attachment_url,
    )
    doc = to_doc(msg)
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    return {"message": doc}


@router.get("/my-stream")
async def my_stream(user: dict = Depends(get_current_user)):
    """Returns messages targeted at the logged-in user's role + (optionally) class.

    Matching contract (a doc is delivered if ALL of):
    - same school as the user (super_admin bypasses)
    - target_role is "all" OR matches the user's role group ("teachers" → teacher etc.)
    - target_class is empty OR matches the user's class (students) / one of the
      user's assigned classes (teachers/parents).
    """
    db = get_db()
    role = user.get("role")
    school_id = user.get("school_id")

    # Map a user's role → the target_role buckets they're allowed to consume.
    role_buckets: List[str] = ["all"]
    if role == "teacher":
        role_buckets.append("teachers")
    elif role == "student":
        role_buckets.append("students")
    elif role == "parent":
        role_buckets.append("parents")
    elif role in ("school_admin", "super_admin"):
        # Admins see admin-only chatter + every role bucket inside their visibility scope.
        role_buckets.extend(["admin", "teachers", "students", "parents"])

    # Determine the user's class(es) for class-stream matching
    user_classes: List[str] = []
    if role == "student":
        # Resolve from the student record
        sid = user.get("student_id")
        if sid:
            st = await db.students.find_one({"id": sid}, {"_id": 0, "class_name": 1})
            if st and st.get("class_name"):
                user_classes = [st["class_name"]]
    elif role == "teacher":
        user_classes = teacher_assigned_classes(user) or []
    elif role == "parent":
        # Parent reads messages targeted at any class their children belong to.
        kids = await db.students.find(
            {"parent_email": user.get("email")}, {"_id": 0, "class_name": 1},
        ).to_list(50)
        user_classes = list({k["class_name"] for k in kids if k.get("class_name")})

    # Mongo query (use $and so we can combine multiple OR clauses safely)
    and_clauses: List[dict] = [{"target_role": {"$in": role_buckets}}]

    # School scoping — non-super-admin users can see:
    #   (a) messages from their own school
    #   (b) super-admin messages targeting their school via target_school_id
    #   (c) super-admin global broadcasts (school_id null AND target_school_id null)
    if role != "super_admin":
        and_clauses.append({
            "$or": [
                {"school_id": school_id},
                {"target_school_id": school_id},
                {"$and": [{"school_id": None}, {"target_school_id": None}]},
            ],
        })

    # target_class scoping
    if user_classes:
        and_clauses.append({
            "$or": [
                {"target_class": None},
                {"target_class": {"$exists": False}},
                {"target_class": {"$in": user_classes}},
            ],
        })
    else:
        # Users with no class context only see school-wide messages (no class-targeted).
        and_clauses.append({
            "$or": [
                {"target_class": None},
                {"target_class": {"$exists": False}},
            ],
        })

    q = {"$and": and_clauses}

    docs = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Decorate each with an `unread` flag for the client badge logic
    me = user["id"]
    for d in docs:
        d["unread"] = me not in (d.get("read_by") or [])
    return {"messages": docs, "unread_count": sum(1 for d in docs if d["unread"])}


@router.post("/{message_id}/read")
async def mark_read(message_id: str, user: dict = Depends(get_current_user)):
    """Append the caller's user id to read_by. Idempotent (uses $addToSet)."""
    db = get_db()
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    # Light scoping — non-super users can only mark messages from their school
    if user.get("role") != "super_admin" and msg.get("school_id") != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.messages.update_one(
        {"id": message_id},
        {"$addToSet": {"read_by": user["id"]}},
    )
    return {"ok": True, "message_id": message_id}
