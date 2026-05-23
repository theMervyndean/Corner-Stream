"""CBT review extension — student can see correct vs their answer post-submission."""
from fastapi import APIRouter, Depends, HTTPException
from db import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/cbt", tags=["cbt-review"])


@router.get("/attempts/{attempt_id}/review")
async def review_attempt(attempt_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    attempt = await db.cbt_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if not attempt.get("completed_at"):
        raise HTTPException(status_code=400, detail="Attempt not yet submitted")

    # Permissions
    if user["role"] == "student" and user.get("student_id") != attempt["student_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user["role"] not in ("super_admin", "student") and attempt.get("school_id") != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    exam = await db.cbt_exams.find_one({"id": attempt["exam_id"]}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    return {
        "exam": {
            "title": exam["title"], "subject": exam["subject"],
            "term": exam["term"], "year": exam["year"],
            "class_name": exam["class_name"], "duration_min": exam["duration_min"],
        },
        "questions": exam["questions"],
        "answers": attempt.get("answers", []),
        "score_pct": attempt.get("score_pct"),
        "raw_score": attempt.get("raw_score"),
        "total_qs": attempt.get("total_qs"),
        "completed_at": attempt.get("completed_at"),
    }
