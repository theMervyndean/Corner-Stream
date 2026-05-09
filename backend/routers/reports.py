"""Reports router — generate digital report card with QR + Debt Lock."""
import os
import io
import base64
import qrcode
from fastapi import APIRouter, Depends, HTTPException
from db import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


def _make_qr_data_url(payload: str) -> str:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


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
        "qr_code": qr_data_url,
        "qr_payload": qr_payload,
        "principal_signature": (school or {}).get("principal_name", "Principal"),
    }
