"""Analytics router — aggregated dashboards for admins."""
from fastapi import APIRouter, Depends
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from db import get_db
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _months_back(n: int):
    today = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    out = []
    for i in range(n, -1, -1):
        d = today - timedelta(days=30 * i)
        out.append(d.strftime("%Y-%m"))
    return out


@router.get("/super")
async def super_analytics(user: dict = Depends(require_roles("super_admin"))):
    """Global analytics for super admin."""
    db = get_db()
    months = _months_back(5)

    # Schools added per month
    schools = await db.schools.find({}, {"_id": 0, "created_at": 1, "subscription_tier": 1, "kill_switch": 1}).to_list(2000)
    growth = {m: 0 for m in months}
    for s in schools:
        m = (s.get("created_at") or "")[:7]
        if m in growth:
            growth[m] += 1
    growth_series = [{"month": m, "schools": growth[m]} for m in months]

    # Tier distribution
    tiers = defaultdict(int)
    for s in schools:
        tiers[s.get("subscription_tier") or "unsubscribed"] += 1
    tier_series = [{"tier": k, "count": v} for k, v in tiers.items()]

    # Leads funnel
    leads_total = await db.leads.count_documents({})
    leads_open = await db.leads.count_documents({"resolved": False})
    leads_resolved = leads_total - leads_open

    # Receipt status
    receipts_pending = await db.bank_receipts.count_documents({"status": "pending"})
    receipts_approved = await db.bank_receipts.count_documents({"status": "approved"})
    receipts_rejected = await db.bank_receipts.count_documents({"status": "rejected"})

    # Payment volume (sum amounts paid)
    paid_txns = await db.payment_transactions.find({"payment_status": "paid"}, {"_id": 0, "amount": 1, "currency": 1}).to_list(2000)
    payment_total_usd = round(sum(t.get("amount", 0) for t in paid_txns), 2)

    return {
        "growth_series": growth_series,
        "tier_series": tier_series,
        "leads": {"total": leads_total, "open": leads_open, "resolved": leads_resolved},
        "receipts": {"pending": receipts_pending, "approved": receipts_approved, "rejected": receipts_rejected},
        "payments": {"total_usd": payment_total_usd, "count": len(paid_txns)},
        "active_schools": sum(1 for s in schools if not s.get("kill_switch")),
        "killed_schools": sum(1 for s in schools if s.get("kill_switch")),
    }


@router.get("/school")
async def school_analytics(user: dict = Depends(require_roles("school_admin", "super_admin"))):
    """Per-school analytics for school admin."""
    db = get_db()
    school_id = user["school_id"]
    students = await db.students.find({"school_id": school_id}, {"_id": 0}).to_list(5000)

    by_class = defaultdict(int)
    by_gender = defaultdict(int)
    debt_buckets = {"Clear": 0, "1–10k": 0, "10–50k": 0, "50k+": 0}
    for s in students:
        by_class[s.get("class_name") or "Unassigned"] += 1
        by_gender[s.get("gender") or "Unspecified"] += 1
        bal = float(s.get("balance_due") or 0)
        if bal == 0:
            debt_buckets["Clear"] += 1
        elif bal <= 10000:
            debt_buckets["1–10k"] += 1
        elif bal <= 50000:
            debt_buckets["10–50k"] += 1
        else:
            debt_buckets["50k+"] += 1

    # CBT activity over last 5 months
    months = _months_back(4)
    cbt_attempts = await db.cbt_attempts.find({"school_id": school_id, "completed_at": {"$ne": None}}, {"_id": 0}).to_list(5000)
    cbt_by_month = {m: 0 for m in months}
    for a in cbt_attempts:
        m = (a.get("completed_at") or "")[:7]
        if m in cbt_by_month:
            cbt_by_month[m] += 1
    cbt_series = [{"month": m, "attempts": cbt_by_month[m]} for m in months]

    # Average CBT score
    scores = [a.get("score_pct", 0) for a in cbt_attempts if a.get("score_pct") is not None]
    avg_cbt = round(sum(scores) / len(scores), 2) if scores else 0

    # Subject average across school (current academic year)
    score_docs = await db.scores.find({"school_id": school_id}, {"_id": 0}).to_list(20000)
    subj_buckets = defaultdict(list)
    for sc in score_docs:
        subj_buckets[sc.get("subject")].append(sc.get("total", 0))
    subj_series = [
        {"subject": s, "average": round(sum(v) / len(v), 2)}
        for s, v in subj_buckets.items()
    ]

    return {
        "students_total": len(students),
        "by_class": [{"class": k, "count": v} for k, v in by_class.items()],
        "by_gender": [{"gender": k, "count": v} for k, v in by_gender.items()],
        "debt_buckets": [{"bucket": k, "count": v} for k, v in debt_buckets.items()],
        "cbt_series": cbt_series,
        "cbt_avg_pct": avg_cbt,
        "cbt_total_attempts": len(cbt_attempts),
        "subject_averages": subj_series,
    }


@router.get("/student/{student_id}")
async def student_progress(student_id: str, year: str = "2025/2026", user: dict = Depends(get_current_user)):
    """Per-student term progression (used by parent + student dashboards)."""
    db = get_db()
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student:
        return {"series": [], "subject_radar": []}
    if user["role"] == "parent" and student.get("parent_email") != user["email"]:
        return {"series": [], "subject_radar": []}
    if user["role"] == "student" and user.get("student_id") != student_id:
        return {"series": [], "subject_radar": []}
    if user["role"] not in ("super_admin", "parent", "student") and student["school_id"] != user.get("school_id"):
        return {"series": [], "subject_radar": []}

    terms = ["1st Term", "2nd Term", "3rd Term"]
    series = []
    for t in terms:
        scores = await db.scores.find({"student_id": student_id, "term": t, "year": year}, {"_id": 0}).to_list(200)
        if scores:
            avg = round(sum(s["total"] for s in scores) / len(scores), 2)
        else:
            avg = 0
        series.append({"term": t.replace(" Term", ""), "average": avg})

    # Latest term subject snapshot for radar
    latest_scores = []
    for t in reversed(terms):
        rows = await db.scores.find({"student_id": student_id, "term": t, "year": year}, {"_id": 0}).to_list(200)
        if rows:
            latest_scores = rows
            break
    radar = [{"subject": r["subject"], "score": r["total"]} for r in latest_scores]

    return {"series": series, "subject_radar": radar}
