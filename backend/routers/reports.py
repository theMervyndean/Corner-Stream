"""Reports router — generate digital report card with QR + Debt Lock."""
import os
import io
import base64
import qrcode
from fastapi import APIRouter, Depends, HTTPException
from db import get_db, _calc_grade
from auth_utils import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


def _make_qr_data_url(payload: str) -> str:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


async def _can_view_student(user: dict, student: dict) -> bool:
    if user["role"] == "super_admin":
        return True
    if user["role"] == "parent":
        return student.get("parent_email") == user["email"]
    if user["role"] == "student":
        return user.get("student_id") == student["id"]
    return student["school_id"] == user.get("school_id")


def _debt_locked_for(user: dict, student: dict) -> bool:
    return user["role"] in ("parent", "student") and (student.get("balance_due") or 0) > 0


@router.get("/annual/{student_id}")
async def annual_report(student_id: str, year: str = "2025/2026", user: dict = Depends(get_current_user)):
    """Cumulative 3-term annual report with per-subject averages and session promotion."""
    db = get_db()
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if not await _can_view_student(user, student):
        raise HTTPException(status_code=403, detail="Forbidden")
    if _debt_locked_for(user, student):
        return {
            "debt_locked": True,
            "balance_due": student.get("balance_due", 0),
            "student": {"id": student["id"], "name": student["name"]},
            "message": "Annual result locked. Please clear outstanding balance to access.",
        }

    school = await db.schools.find_one({"id": student["school_id"]}, {"_id": 0})
    terms = ["1st Term", "2nd Term", "3rd Term"]
    by_term = {}
    all_subjects: set[str] = set()
    for term in terms:
        scores = await db.scores.find(
            {"student_id": student_id, "term": term, "year": year}, {"_id": 0},
        ).to_list(200)
        by_term[term] = scores
        for s in scores:
            all_subjects.add(s["subject"])

    subjects_data = []
    for subj in sorted(all_subjects):
        row = {"subject": subj, "terms": {}, "totals": {}}
        for term in terms:
            sc = next((x for x in by_term[term] if x["subject"] == subj), None)
            row["terms"][term] = sc["total"] if sc else None
            row["totals"][term] = sc["total"] if sc else None
        valid = [v for v in row["terms"].values() if v is not None]
        avg = round(sum(valid) / len(valid), 2) if valid else 0
        row["average"] = avg
        row["grade"] = _calc_grade(int(avg))
        subjects_data.append(row)

    averages = [r["average"] for r in subjects_data if r["average"] > 0]
    overall = round(sum(averages) / len(averages), 2) if averages else 0
    promotion = "Promoted to next class" if overall >= 50 else "Repeat current class"

    qr_payload = f"https://verify.cornerstreams.com/annual/{student_id}/{year.replace('/', '-')}"
    qr = _make_qr_data_url(qr_payload)

    # Skills aggregated across the session (average rating per skill)
    skills_docs = await db.skill_ratings.find(
        {"student_id": student_id, "year": year}, {"_id": 0},
    ).to_list(500)
    skills_map: dict[str, list[int]] = {}
    for s in skills_docs:
        skills_map.setdefault(s["skill_name"], []).append(s["rating"])
    skills_avg = [
        {"skill_name": k, "rating": round(sum(v) / len(v))}
        for k, v in skills_map.items()
    ]

    return {
        "debt_locked": False,
        "student": student,
        "school": school,
        "year": year,
        "subjects": subjects_data,
        "skill_ratings": skills_avg,
        "overall_average": overall,
        "promotion_status": promotion,
        "qr_code": qr,
        "qr_payload": qr_payload,
        "principal_signature": (school or {}).get("principal_name", "Principal"),
    }


@router.get("/{student_id}")
async def get_report(student_id: str, term: str = "1st Term", user: dict = Depends(get_current_user)):
    db = get_db()
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Permission scoping
    if user["role"] == "parent":
        if student.get("parent_email") != user["email"]:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif user["role"] != "super_admin" and student["school_id"] != user.get("school_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    school = await db.schools.find_one({"id": student["school_id"]}, {"_id": 0})

    # Debt Lock — applies to parents only
    debt_locked = False
    if user["role"] == "parent" and (student.get("balance_due") or 0) > 0:
        debt_locked = True
        return {
            "debt_locked": True,
            "balance_due": student.get("balance_due", 0),
            "student": {"id": student["id"], "name": student["name"]},
            "message": "Result Checker disabled. Please clear outstanding balance to access the digital report.",
        }

    scores = await db.scores.find({"student_id": student_id, "term": term}, {"_id": 0}).to_list(200)
    skills = await db.skill_ratings.find({"student_id": student_id, "term": term}, {"_id": 0}).to_list(200)

    total_sum = sum(s["total"] for s in scores) if scores else 0
    avg = round(total_sum / len(scores), 2) if scores else 0
    promotion = "Promoted" if avg >= 50 else "On Watch"

    qr_payload = f"https://verify.cornerstreams.com/report/{student_id}/{term.replace(' ', '_')}"
    qr_data_url = _make_qr_data_url(qr_payload)

    year = scores[0]["year"] if scores else "2025/2026"

    # Total subjects for this class (so we can show "Subjects scored: X of Y")
    class_subj_doc = await db.class_subjects.find_one(
        {"school_id": student["school_id"], "class_name": student["class_name"]}, {"_id": 0},
    )
    total_subjects = len((class_subj_doc or {}).get("subjects") or []) or len(scores)

    # Auto-remarks by grade for principal & teacher comments
    if avg >= 75:
        principal_comment = f"{student['name']} has performed excellently this term. Keep aiming higher."
        teacher_comment = "An outstanding result — sets a strong example in class. Maintain this pace."
    elif avg >= 65:
        principal_comment = f"A very good performance from {student['name']}. Continue to put in the work."
        teacher_comment = "Consistently strong work throughout the term. A little more push can take you to the top."
    elif avg >= 55:
        principal_comment = f"{student['name']} has shown good effort. There's room to improve."
        teacher_comment = "Solid work in most subjects. Focus more on the weaker areas next term."
    elif avg >= 45:
        principal_comment = f"{student['name']}'s result is fair. More attention to academics is required."
        teacher_comment = "Capable of much better. Please establish a study routine and seek help early."
    elif avg >= 40:
        principal_comment = f"{student['name']} just managed this term. A serious effort is needed next term."
        teacher_comment = "Below expected standard. Parental support and extra coaching strongly advised."
    else:
        principal_comment = f"{student['name']}'s result is poor. We need parents to partner with us closely."
        teacher_comment = "Significant improvement needed across the board. Please book a meeting with the class teacher."

    return {
        "debt_locked": debt_locked,
        "student": student,
        "school": school,
        "term": term,
        "year": year,
        "scores": scores,
        "skill_ratings": skills,
        "average": avg,
        "promotion_status": promotion,
        "total_subjects": total_subjects,
        "subjects_scored": len(scores),
        "principal_comment": principal_comment,
        "teacher_comment": teacher_comment,
        "qr_code": qr_data_url,
        "qr_payload": qr_payload,
        "principal_signature": (school or {}).get("principal_name", "Principal"),
    }
