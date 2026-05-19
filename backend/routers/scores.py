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
    # Per-column CA scores. When provided, ca_score is derived as sum(ca_scores).
    # When not provided, ca_score is used as-is (legacy single-column behaviour).
    ca_scores: Optional[List[int]] = None
    ca_score: int = Field(ge=0, le=100)
    exam_score: int = Field(ge=0, le=100)


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
    # Cache schools we've already looked up this batch (most batches are one school)
    school_cache: dict = {}

    async def _get_school(school_id: str) -> dict:
        if school_id not in school_cache:
            school_cache[school_id] = await db.schools.find_one(
                {"id": school_id}, {"_id": 0, "ca_weights": 1, "ca_max": 1, "exam_max": 1},
            ) or {}
        return school_cache[school_id]

    for item in batch.items:
        student = await db.students.find_one({"id": item.student_id}, {"_id": 0})
        if not student:
            continue
        if user["role"] != "super_admin" and student["school_id"] != user.get("school_id"):
            continue
        if is_scoped_teacher(user) and student.get("class_name") not in teacher_assigned_classes(user):
            continue

        # Resolve school's assessment structure for per-column validation
        school = await _get_school(student["school_id"])
        ca_weights = school.get("ca_weights") or []
        exam_max_cfg = int(school.get("exam_max") or 0)

        # Validate per-column CA scores when supplied
        ca_scores = item.ca_scores
        if ca_scores is not None:
            if ca_weights and len(ca_scores) != len(ca_weights):
                raise HTTPException(
                    status_code=400,
                    detail=f"ca_scores length ({len(ca_scores)}) does not match school's CA columns ({len(ca_weights)})",
                )
            try:
                ca_scores = [int(v) for v in ca_scores]
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="ca_scores must be integers")
            if any(v < 0 for v in ca_scores):
                raise HTTPException(status_code=400, detail="ca_scores cannot be negative")
            if ca_weights:
                for i, v in enumerate(ca_scores):
                    if v > ca_weights[i]:
                        raise HTTPException(
                            status_code=400,
                            detail=f"CA{i + 1} score {v} exceeds maximum {ca_weights[i]}",
                        )
            ca_total = sum(ca_scores)
        else:
            ca_total = item.ca_score

        # Validate exam against school config
        if exam_max_cfg and item.exam_score > exam_max_cfg:
            raise HTTPException(
                status_code=400,
                detail=f"Exam score {item.exam_score} exceeds maximum {exam_max_cfg}",
            )

        total = ca_total + item.exam_score
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
            "ca_score": ca_total,
            "exam_score": item.exam_score,
            "total": total,
            "grade": grade,
            "teacher_id": user["id"],
            "updated_at": now_iso(),
        }
        if ca_scores is not None:
            doc["ca_scores"] = ca_scores
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
