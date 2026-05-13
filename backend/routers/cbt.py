"""CBT (Computer-Based Testing) router — MCQ + True/False exams + attempts + auto-grade."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Literal
from db import get_db, new_id, now_iso, _calc_grade, allows_true_false
from auth_utils import get_current_user, require_roles
from audit_log import log_event, EVENT_EXAM_CREATED, EVENT_EXAM_PUBLISHED, EVENT_ATTEMPT_SUBMITTED

router = APIRouter(prefix="/cbt", tags=["cbt"])


# ---------- Models ----------
class Question(BaseModel):
    """Supports two types:
    - 'mcq': 2-6 options, correct_idx 0..n-1
    - 'true_false': options auto-set to ['True','False']; correct_idx 0 (True) or 1 (False)
    Optional image_url (base64 data URL) attached to the question."""
    type: Literal["mcq", "true_false"] = "mcq"
    question: str = Field(min_length=1)
    options: Optional[List[str]] = None
    correct_idx: int = Field(ge=0)
    image_url: Optional[str] = ""

    @model_validator(mode="after")
    def _check(self):
        if self.type == "true_false":
            # Normalize options for true_false
            self.options = ["True", "False"]
            if self.correct_idx not in (0, 1):
                raise ValueError("true_false correct_idx must be 0 (True) or 1 (False)")
        else:  # mcq
            opts = self.options or []
            if len(opts) < 2 or len(opts) > 6:
                raise ValueError("MCQ must have between 2 and 6 options")
            if self.correct_idx >= len(opts):
                raise ValueError("correct_idx out of range")
            self.options = opts
        return self


# Back-compat alias for any legacy imports
MCQ = Question


class ExamIn(BaseModel):
    title: str
    class_name: str
    subject: str
    term: str
    year: str
    duration_min: int = Field(ge=1, le=240)
    questions: List[Question]


class ExamUpdate(BaseModel):
    title: Optional[str] = None
    duration_min: Optional[int] = None
    questions: Optional[List[Question]] = None
    published: Optional[bool] = None


class SubmitIn(BaseModel):
    answers: List[int]  # selected option index per question; -1 = unanswered


# ---------- Helpers ----------
def _strip_correct(exam: dict) -> dict:
    out = {**exam}
    out["questions"] = [
        {
            "question": q["question"],
            "options": q.get("options") or (["True", "False"] if q.get("type") == "true_false" else []),
            "type": q.get("type", "mcq"),
            "image_url": q.get("image_url", ""),
        }
        for q in exam.get("questions", [])
    ]
    return out


async def _enforce_question_type_rules(db, school_id: str, questions: list):
    """Block true_false unless the school is Primary or Mixed."""
    has_tf = any((q.get("type") if isinstance(q, dict) else q.type) == "true_false" for q in questions)
    if not has_tf:
        return
    school = await db.schools.find_one({"id": school_id}, {"_id": 0, "school_type": 1})
    if not school or not allows_true_false(school.get("school_type")):
        raise HTTPException(
            status_code=400,
            detail="True/False questions are only available for Primary or Mixed schools.",
        )


async def _student_record_for_user(db, user: dict) -> Optional[dict]:
    if user.get("role") != "student":
        return None
    sid = user.get("student_id")
    if not sid:
        return None
    return await db.students.find_one({"id": sid}, {"_id": 0})


async def _upsert_score_from_cbt(db, student: dict, exam: dict, percent: float, teacher_id: Optional[str]):
    """Convert CBT percent to /60 exam column and upsert into scores collection."""
    exam_score = round((percent / 100) * 60)
    # Find existing CA to preserve, else default 0
    existing = await db.scores.find_one({
        "student_id": student["id"], "term": exam["term"],
        "year": exam["year"], "subject": exam["subject"],
    })
    ca = existing["ca_score"] if existing else 0
    total = ca + exam_score
    grade = _calc_grade(total)
    doc = {
        "student_id": student["id"],
        "school_id": student["school_id"],
        "term": exam["term"],
        "year": exam["year"],
        "subject": exam["subject"],
        "ca_score": ca,
        "exam_score": exam_score,
        "total": total,
        "grade": grade,
        "teacher_id": teacher_id or exam.get("created_by"),
        "source": "cbt",
        "updated_at": now_iso(),
    }
    if existing:
        await db.scores.update_one({"id": existing["id"]}, {"$set": doc})
    else:
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        await db.scores.insert_one(doc)


# ---------- Exam CRUD (teacher/school_admin) ----------
@router.post("/exams")
async def create_exam(payload: ExamIn, user: dict = Depends(require_roles("teacher", "school_admin", "super_admin"))):
    db = get_db()
    # Enforce true_false rule against the school's type
    school_id = user["school_id"]
    await _enforce_question_type_rules(db, school_id, payload.questions)
    doc = {
        "id": new_id(),
        "school_id": school_id,
        "title": payload.title,
        "class_name": payload.class_name,
        "subject": payload.subject,
        "term": payload.term,
        "year": payload.year,
        "duration_min": payload.duration_min,
        "questions": [q.model_dump() for q in payload.questions],
        "published": False,
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.cbt_exams.insert_one(doc)
    doc.pop("_id", None)
    await log_event(
        school_id=school_id, event_type=EVENT_EXAM_CREATED,
        actor_id=user.get("id"), actor_name=user.get("name"), actor_role=user.get("role"),
        summary=f"Exam created: {doc['title']} ({doc['class_name']} · {doc['subject']})",
        details={"exam_id": doc["id"], "title": doc["title"], "class_name": doc["class_name"],
                 "subject": doc["subject"], "questions_count": len(doc["questions"])},
    )
    return {"exam": doc}


@router.get("/exams")
async def list_exams(class_name: Optional[str] = None, subject: Optional[str] = None,
                     term: Optional[str] = None, published_only: bool = False,
                     user: dict = Depends(get_current_user)):
    db = get_db()
    if user["role"] == "super_admin":
        q = {}
    else:
        q = {"school_id": user.get("school_id")}
    if user["role"] == "student":
        student = await _student_record_for_user(db, user)
        if not student:
            return {"exams": []}
        q["class_name"] = student["class_name"]
        q["published"] = True
    else:
        if class_name:
            q["class_name"] = class_name
        if subject:
            q["subject"] = subject
        if term:
            q["term"] = term
        if published_only:
            q["published"] = True
    exams = await db.cbt_exams.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # For students: strip correct_idx; also append attempt status
    if user["role"] == "student":
        student = await _student_record_for_user(db, user)
        attempts = await db.cbt_attempts.find({"student_id": student["id"]}, {"_id": 0}).to_list(500)
        attempt_by_exam = {a["exam_id"]: a for a in attempts}
        out = []
        for e in exams:
            stripped = _strip_correct(e)
            stripped["question_count"] = len(e.get("questions", []))
            del stripped["questions"]
            att = attempt_by_exam.get(e["id"])
            if att:
                stripped["attempt"] = {
                    "id": att["id"],
                    "completed_at": att.get("completed_at"),
                    "score_pct": att.get("score_pct"),
                    "raw_score": att.get("raw_score"),
                    "total_qs": att.get("total_qs"),
                }
            out.append(stripped)
        return {"exams": out}
    # Teachers/admins get full data
    return {"exams": exams}


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    exam = await db.cbt_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if user["role"] != "super_admin" and exam["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if user["role"] == "student":
        return {"exam": _strip_correct(exam)}
    return {"exam": exam}


@router.put("/exams/{exam_id}")
async def update_exam(exam_id: str, payload: ExamUpdate,
                      user: dict = Depends(require_roles("teacher", "school_admin", "super_admin"))):
    db = get_db()
    exam = await db.cbt_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if user["role"] != "super_admin" and exam["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "questions" in update:
        # Re-validate true/false rule against school type
        await _enforce_question_type_rules(db, exam["school_id"], update["questions"])
        update["questions"] = [q if isinstance(q, dict) else q.model_dump() for q in update["questions"]]
    update["updated_at"] = now_iso()
    await db.cbt_exams.update_one({"id": exam_id}, {"$set": update})
    return {"exam": {**exam, **update}}


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, user: dict = Depends(require_roles("teacher", "school_admin", "super_admin"))):
    db = get_db()
    exam = await db.cbt_exams.find_one({"id": exam_id})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if user["role"] != "super_admin" and exam["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.cbt_exams.delete_one({"id": exam_id})
    await db.cbt_attempts.delete_many({"exam_id": exam_id})
    return {"ok": True}


# ---------- Student attempt flow ----------
@router.post("/exams/{exam_id}/start")
async def start_attempt(exam_id: str, user: dict = Depends(require_roles("student"))):
    db = get_db()
    exam = await db.cbt_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam or not exam.get("published"):
        raise HTTPException(status_code=404, detail="Exam not available")
    student = await _student_record_for_user(db, user)
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found")
    if student["class_name"] != exam["class_name"] or student["school_id"] != exam["school_id"]:
        raise HTTPException(status_code=403, detail="Exam not available for your class")

    # Check existing attempt — if completed, refuse retake; if in-progress, return existing
    existing = await db.cbt_attempts.find_one({"exam_id": exam_id, "student_id": student["id"]}, {"_id": 0})
    if existing and existing.get("completed_at"):
        raise HTTPException(status_code=400, detail="You have already completed this exam")
    if existing:
        return {"attempt": existing, "exam": _strip_correct(exam)}

    attempt = {
        "id": new_id(),
        "exam_id": exam_id,
        "student_id": student["id"],
        "school_id": student["school_id"],
        "started_at": now_iso(),
        "completed_at": None,
        "answers": [],
    }
    await db.cbt_attempts.insert_one(attempt)
    attempt.pop("_id", None)
    return {"attempt": attempt, "exam": _strip_correct(exam)}


@router.post("/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, payload: SubmitIn, user: dict = Depends(require_roles("student"))):
    db = get_db()
    attempt = await db.cbt_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    student = await _student_record_for_user(db, user)
    if not student or attempt["student_id"] != student["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if attempt.get("completed_at"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    exam = await db.cbt_exams.find_one({"id": attempt["exam_id"]}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam disappeared")

    questions = exam["questions"]
    answers = list(payload.answers)
    # Pad / truncate answers to exam length
    while len(answers) < len(questions):
        answers.append(-1)
    answers = answers[: len(questions)]

    raw_score = sum(1 for i, q in enumerate(questions) if answers[i] == q["correct_idx"])
    total_qs = len(questions)
    pct = round((raw_score / total_qs) * 100, 2) if total_qs else 0

    update = {
        "answers": answers,
        "completed_at": now_iso(),
        "raw_score": raw_score,
        "total_qs": total_qs,
        "score_pct": pct,
    }
    await db.cbt_attempts.update_one({"id": attempt_id}, {"$set": update})

    # Auto-fill exam score
    await _upsert_score_from_cbt(db, student, exam, pct, exam.get("created_by"))

    # Audit log attempt
    await log_event(
        school_id=student["school_id"], event_type=EVENT_ATTEMPT_SUBMITTED,
        actor_id=user.get("id"), actor_name=student["name"], actor_role="student",
        summary=f"{student['name']} took {exam['title']} — scored {pct}%",
        details={"exam_id": exam["id"], "exam_title": exam["title"], "student_id": student["id"],
                 "student_name": student["name"], "class_name": student.get("class_name"),
                 "subject": exam["subject"], "raw_score": raw_score, "total_qs": total_qs, "score_pct": pct},
    )

    return {"attempt": {**attempt, **update}, "review": {
        "questions": questions, "answers": answers, "raw_score": raw_score, "total_qs": total_qs, "score_pct": pct,
    }}


@router.get("/attempts/me")
async def my_attempts(user: dict = Depends(require_roles("student"))):
    db = get_db()
    student = await _student_record_for_user(db, user)
    if not student:
        return {"attempts": []}
    attempts = await db.cbt_attempts.find({"student_id": student["id"]}, {"_id": 0}).sort("started_at", -1).to_list(200)
    return {"attempts": attempts}


@router.get("/exams/{exam_id}/attempts")
async def list_exam_attempts(exam_id: str, user: dict = Depends(require_roles("teacher", "school_admin", "super_admin"))):
    db = get_db()
    exam = await db.cbt_exams.find_one({"id": exam_id})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if user["role"] != "super_admin" and exam["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    attempts = await db.cbt_attempts.find({"exam_id": exam_id}, {"_id": 0}).to_list(500)
    # Attach student names
    sids = list({a["student_id"] for a in attempts})
    students = {s["id"]: s for s in await db.students.find({"id": {"$in": sids}}, {"_id": 0}).to_list(500)}
    for a in attempts:
        s = students.get(a["student_id"])
        if s:
            a["student_name"] = s["name"]
            a["class_name"] = s["class_name"]
    return {"attempts": attempts}
