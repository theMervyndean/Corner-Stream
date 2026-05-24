"""Communication Hub — Message schema.

Lightweight, role-aware message records used by the cross-role messaging /
learning-material delivery module. Backed by the `messages` Mongo collection.
"""
from datetime import datetime, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
import uuid


# ─── Domain enums (string literals so the JSON contract stays simple) ────────
TargetRole = Literal["all", "teachers", "students", "parents"]
MessageType = Literal["announcement", "assignment", "material"]
SenderRole = Literal["super_admin", "school_admin", "teacher", "parent", "student"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


class MessageIn(BaseModel):
    """Payload accepted by POST /api/messages."""
    target_role: TargetRole
    target_class: Optional[str] = Field(
        default=None,
        description="Optional class name (e.g. 'JSS 1') to route the message to a single class stream.",
    )
    message_type: MessageType = "announcement"
    content: str = Field(min_length=1, max_length=20000)
    attachment_url: Optional[str] = Field(
        default=None,
        description="Optional attachment (data URL or remote URL). Frontend enforces 25MB cap.",
    )


class Message(BaseModel):
    """Persisted record. ca_score-style schema: every doc carries its own id and
    a `read_by` array that the frontend uses to compute unread badge counts."""
    id: str = Field(default_factory=_new_id)
    sender_id: str
    sender_role: SenderRole
    school_id: Optional[str] = None
    target_role: TargetRole = "all"
    target_class: Optional[str] = None
    message_type: MessageType = "announcement"
    content: str
    attachment_url: Optional[str] = None
    read_by: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now_iso)


def to_doc(msg: Message) -> dict:
    """Serialise a Message instance into a plain Mongo doc (no ObjectId leakage)."""
    return msg.model_dump()
