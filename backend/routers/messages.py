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
    - school_admin / super_admin: may target any role + any class in their school.
    - teacher: may only target classes within their assigned_classes list.
    """
    db = get_db()

    # Teacher class scoping — they cannot blast a class they aren't teaching.
    if user.get("role") == "teacher" and is_scoped_teacher(user):
        allowed = set(teacher_assigned_classes(user))
        if payload.target_class and payload.target_class not in allowed:
            raise HTTPException(
                status_code=403,
                detail="You can only message classes you are assigned to",
            )
        # A scoped teacher with no class assignment cannot blast a school-wide message.
        if not payload.target_class and not allowed:
            raise HTTPException(
                status_code=403,
                detail="You have no assigned classes — cannot send messages",
            )

    msg = Message(
        sender_id=user["id"],
        sender_role=user["role"],
        school_id=user.get("school_id"),
        target_role=payload.target_role,
        target_class=payload.target_class,
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
    # admins read everything in their school — we still match "all" + every bucket
    elif role in ("school_admin", "super_admin"):
        role_buckets.extend(["teachers", "students", "parents"])

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

    # Mongo query
    q: dict = {"target_role": {"$in": role_buckets}}
    if role != "super_admin":
        q["school_id"] = school_id
    # target_class match: either the doc has no class restriction OR it matches one of ours
    q["$or"] = [
        {"target_class": None},
        {"target_class": {"$exists": False}},
        {"target_class": {"$in": user_classes}} if user_classes else {"target_class": "__never__"},
    ]

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
