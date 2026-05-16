"""Scores router — CA + Exam entry, skill ratings."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from db import get_db, new_id, now_iso, _calc_grade
from auth_utils import get_current_user, require_roles, teacher_assigned_classes, is_scoped_teacher

router = APIRouter(prefix="/scores", tags=["scores"])


def _block_if_outside_teacher_classes(user: dict, student: dict):
    """Raise 403 if a scoped teacher tries to touch a student outside their classes."""
    if not is_scoped_teacher(user):
        return
    classes = teacher_assigned_classes(user)
    if student.get("class_name") not in classes:
        raise HTTPException(status_code=403, detail="Student not in your assigned classes")


class ScoreIn(BaseModel):
    student_id: str
    term: str  # "1st Term" | "2nd Term" | "3rd Term"
    year: str
    subject: str
    ca_score: int = Field(ge=0, le=40)
    exam_score: int = Field(ge=0, le=60)


class ScoreBatch(BaseModel):
    items: List[ScoreIn]


class SkillIn(BaseModel):
    student_id: str
    term: str
    year: str
    skill_name: str
    rating: int = Field(ge=1, le=5)


@router.get("")
async def list_scores(student_id: str, term: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = get_db()
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if user["role"] != "super_admin" and student["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    _block_if_outside_teacher_classes(user, student)
    q = {"student_id": student_id}
    if term:
        q["term"] = term
    scores = await db.scores.find(q, {"_id": 0}).to_list(1000)
    skills = await db.skill_ratings.find(q, {"_id": 0}).to_list(1000)
    return {"scores": scores, "skill_ratings": skills}


@router.post("/batch")
async def upsert_scores(batch: ScoreBatch, user: dict = Depends(require_roles("teacher", "school_admin", "super_admin"))):
    db = get_db()
    saved = []
    for item in batch.items:
        student = await db.students.find_one({"id": item.student_id}, {"_id": 0})
        if not student:
            continue
        if user["role"] != "super_admin" and student["school_id"] != user.get("school_id"):
            continue
        if is_scoped_teacher(user) and student.get("class_name") not in teacher_assigned_classes(user):
            continue
        total = item.ca_score + item.exam_score
        grade = _calc_grade(total)
        existing = await db.scores.find_one({
            "student_id": item.student_id, "term": item.term,
            "year": item.year, "subject": item.subject,
        })
        doc = {
            "student_id": item.student_id,
            "school_id": student["school_id"],
            "term": item.term,
            "year": item.year,
            "subject": item.subject,
            "ca_score": item.ca_score,
            "exam_score": item.exam_score,
            "total": total,
            "grade": grade,
            "teacher_id": user["id"],
            "updated_at": now_iso(),
        }
        if existing:
            await db.scores.update_one({"id": existing["id"]}, {"$set": doc})
            doc["id"] = existing["id"]
        else:
            doc["id"] = new_id()
            doc["created_at"] = now_iso()
            await db.scores.insert_one(doc)
        doc.pop("_id", None)
        saved.append(doc)
    return {"saved": saved}


@router.post("/skills")
async def upsert_skill(payload: SkillIn, user: dict = Depends(require_roles("teacher", "school_admin", "super_admin"))):
    db = get_db()
    student = await db.students.find_one({"id": payload.student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if user["role"] != "super_admin" and student["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    _block_if_outside_teacher_classes(user, student)
    existing = await db.skill_ratings.find_one({
        "student_id": payload.student_id, "term": payload.term,
        "year": payload.year, "skill_name": payload.skill_name,
    })
    doc = {
        "student_id": payload.student_id,
        "school_id": student["school_id"],
        "term": payload.term,
        "year": payload.year,
        "skill_name": payload.skill_name,
        "rating": payload.rating,
        "teacher_id": user["id"],
        "updated_at": now_iso(),
    }
    if existing:
        await db.skill_ratings.update_one({"id": existing["id"]}, {"$set": doc})
        doc["id"] = existing["id"]
    else:
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        await db.skill_ratings.insert_one(doc)
    doc.pop("_id", None)
    return {"skill": doc}
