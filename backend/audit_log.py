"""Audit log helpers — track key events per school (uploads, classes, exams, attempts)."""
from db import get_db, new_id, now_iso


# Canonical event types
EVENT_BULK_STUDENTS = "bulk_students_uploaded"
EVENT_STUDENT_ADDED = "student_added"
EVENT_BULK_TEACHERS = "bulk_teachers_uploaded"
EVENT_TEACHER_ADDED = "teacher_added"
EVENT_PARENT_ADDED = "parent_added"
EVENT_CLASS_ADDED = "class_added"
EVENT_CLASS_REMOVED = "class_removed"
EVENT_EXAM_CREATED = "exam_created"
EVENT_EXAM_PUBLISHED = "exam_published"
EVENT_ATTEMPT_SUBMITTED = "attempt_submitted"
EVENT_SUPPORT_ACCESS = "support_access_impersonation"


async def log_event(
    school_id: str,
    event_type: str,
    actor_id: str | None = None,
    actor_name: str | None = None,
    actor_role: str | None = None,
    summary: str = "",
    details: dict | None = None,
):
    """Insert a single audit-log entry. Fails silently — never blocks the parent operation."""
    if not school_id:
        return
    try:
        db = get_db()
        await db.audit_log.insert_one({
            "id": new_id(),
            "school_id": school_id,
            "event_type": event_type,
            "actor_id": actor_id,
            "actor_name": actor_name or "System",
            "actor_role": actor_role,
            "summary": summary,
            "details": details or {},
            "created_at": now_iso(),
        })
    except Exception:
        # Audit is best-effort — do not break the parent request
        pass
