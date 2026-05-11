"""Database client, collection helpers, indexes, and seeding."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

_client: AsyncIOMotorClient | None = None
_db = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client


def get_db():
    global _db
    if _db is None:
        _db = get_client()[os.environ["DB_NAME"]]
    return _db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------- School-type & class roster defaults ----------
SCHOOL_TYPES = ("primary", "secondary", "mixed")

DEFAULT_CLASSES_BY_TYPE = {
    "primary": [
        "Nursery 1", "Nursery 2",
        "Primary 1", "Primary 2", "Primary 3",
        "Primary 4", "Primary 5", "Primary 6",
    ],
    "secondary": [
        "JSS 1", "JSS 2", "JSS 3",
        "SS 1", "SS 2", "SS 3",
    ],
    "mixed": [
        "Nursery 1", "Nursery 2",
        "Primary 1", "Primary 2", "Primary 3",
        "Primary 4", "Primary 5", "Primary 6",
        "JSS 1", "JSS 2", "JSS 3",
        "SS 1", "SS 2", "SS 3",
    ],
}


def default_classes(school_type: str) -> list[str]:
    return list(DEFAULT_CLASSES_BY_TYPE.get(school_type, DEFAULT_CLASSES_BY_TYPE["secondary"]))


def allows_true_false(school_type: str | None) -> bool:
    """True/False CBT questions are only allowed for Primary or Mixed schools."""
    return (school_type or "").lower() in ("primary", "mixed")


def _calc_grade(total: int) -> str:
    if total >= 75:
        return "A"
    if total >= 65:
        return "B"
    if total >= 55:
        return "C"
    if total >= 45:
        return "D"
    if total >= 40:
        return "E"
    return "F"


async def ensure_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.schools.create_index("id", unique=True)
    await db.students.create_index([("school_id", 1), ("class_name", 1)])
    await db.scores.create_index([("student_id", 1), ("term", 1)])
    await db.skill_ratings.create_index([("student_id", 1), ("term", 1)])
    await db.leads.create_index("created_at")
    await db.payment_transactions.create_index("session_id", unique=True)
    await db.bank_receipts.create_index("school_id")
    await db.class_subjects.create_index([("school_id", 1), ("class_name", 1)], unique=True)
    await db.cbt_exams.create_index([("school_id", 1), ("class_name", 1)])
    await db.cbt_attempts.create_index([("exam_id", 1), ("student_id", 1)])


async def seed_demo_data():
    """Seed super admin + demo school with admin/teacher/parent/student + students + subjects + CBT."""
    db = get_db()

    # Super admin
    super_email = os.environ["ADMIN_EMAIL"]
    super_pw = os.environ["ADMIN_PASSWORD"]
    if not await db.users.find_one({"email": super_email}):
        await db.users.insert_one({
            "id": new_id(), "email": super_email,
            "password_hash": hash_password(super_pw),
            "name": "Super Admin", "role": "super_admin",
            "school_id": None, "created_at": now_iso(),
        })

    # Demo school
    demo_school_id = "demo-school-001"
    if not await db.schools.find_one({"id": demo_school_id}):
        await db.schools.insert_one({
            "id": demo_school_id,
            "name": "Sunrise Academy",
            "school_type": "secondary",
            "classes": default_classes("secondary"),
            "principal_name": "Mrs. Adaeze Okonkwo",
            "address": "12 Ahmadu Bello Way, Ikeja, Lagos",
            "phone": "+2348012345678",
            "kill_switch": False,
            "subscription_tier": "unified_enterprise",
            "subscription_duration": "full_session",
            "subscription_expires_at": (datetime.now(timezone.utc) + timedelta(days=270)).isoformat(),
            "created_at": now_iso(),
        })
    else:
        # Backfill school_type and classes for existing demo school
        existing = await db.schools.find_one({"id": demo_school_id})
        updates = {}
        if not existing.get("school_type"):
            updates["school_type"] = "secondary"
        if not existing.get("classes"):
            updates["classes"] = default_classes("secondary")
        if updates:
            await db.schools.update_one({"id": demo_school_id}, {"$set": updates})

    # School admin
    if not await db.users.find_one({"email": "admin@demo.school"}):
        await db.users.insert_one({
            "id": new_id(), "email": "admin@demo.school",
            "password_hash": hash_password("Admin@123"),
            "name": "Chinedu Eze", "role": "school_admin",
            "school_id": demo_school_id, "created_at": now_iso(),
        })

    # Teacher
    teacher_user = await db.users.find_one({"email": "teacher@demo.school"})
    if not teacher_user:
        teacher_id = new_id()
        await db.users.insert_one({
            "id": teacher_id, "email": "teacher@demo.school",
            "password_hash": hash_password("Teacher@123"),
            "name": "Mr. Bayo Adeyemi", "role": "teacher",
            "school_id": demo_school_id, "assigned_class": "JSS 1",
            "created_at": now_iso(),
        })
    else:
        teacher_id = teacher_user["id"]

    # Parent
    if not await db.users.find_one({"email": "parent@demo.school"}):
        await db.users.insert_one({
            "id": new_id(), "email": "parent@demo.school",
            "password_hash": hash_password("Parent@123"),
            "name": "Mr. Tunde Okafor", "role": "parent",
            "school_id": demo_school_id, "created_at": now_iso(),
        })

    # Demo students
    demo_students = [
        {"name": "Adaeze Okafor", "age": 12, "gender": "Female", "class_name": "JSS 1", "parent_email": "parent@demo.school", "balance_due": 0},
        {"name": "Emeka Nwosu", "age": 13, "gender": "Male", "class_name": "JSS 1", "parent_email": "parent@demo.school", "balance_due": 25000},
        {"name": "Fatima Bello", "age": 12, "gender": "Female", "class_name": "JSS 1", "parent_email": None, "balance_due": 0},
        {"name": "Chukwudi Eze", "age": 13, "gender": "Male", "class_name": "JSS 1", "parent_email": None, "balance_due": 15000},
    ]
    for s in demo_students:
        if not await db.students.find_one({"school_id": demo_school_id, "name": s["name"]}):
            await db.students.insert_one({
                "id": new_id(), "school_id": demo_school_id,
                "name": s["name"], "age": s["age"], "gender": s["gender"],
                "class_name": s["class_name"], "passport_url": "",
                "parent_email": s["parent_email"], "balance_due": s["balance_due"],
                "created_at": now_iso(),
            })

    # Subjects per class
    if not await db.class_subjects.find_one({"school_id": demo_school_id, "class_name": "JSS 1"}):
        await db.class_subjects.insert_one({
            "school_id": demo_school_id, "class_name": "JSS 1",
            "subjects": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Civic Education", "Computer Studies"],
            "created_at": now_iso(),
        })

    # Demo scores + skills for Adaeze (1st Term)
    adaeze = await db.students.find_one({"school_id": demo_school_id, "name": "Adaeze Okafor"})
    if adaeze and await db.scores.count_documents({"student_id": adaeze["id"], "term": "1st Term"}) == 0:
        for subj, ca, exam in [
            ("Mathematics", 28, 55), ("English Language", 30, 60),
            ("Basic Science", 27, 58), ("Social Studies", 25, 50),
            ("Civic Education", 29, 62), ("Computer Studies", 30, 65),
        ]:
            total = ca + exam
            await db.scores.insert_one({
                "id": new_id(), "student_id": adaeze["id"], "school_id": demo_school_id,
                "term": "1st Term", "year": "2025/2026", "subject": subj,
                "ca_score": ca, "exam_score": exam, "total": total,
                "grade": _calc_grade(total), "teacher_id": teacher_id,
                "created_at": now_iso(),
            })
        for name, rating in [
            ("Punctuality", 5), ("Attentiveness", 4), ("Neatness", 5),
            ("Honesty", 5), ("Sportsmanship", 4), ("Leadership", 4),
        ]:
            await db.skill_ratings.insert_one({
                "id": new_id(), "student_id": adaeze["id"], "school_id": demo_school_id,
                "term": "1st Term", "year": "2025/2026", "skill_name": name,
                "rating": rating, "teacher_id": teacher_id, "created_at": now_iso(),
            })

    # Provision a student login for Adaeze
    if adaeze and not await db.users.find_one({"email": "adaeze@demo.school"}):
        await db.users.insert_one({
            "id": new_id(), "email": "adaeze@demo.school",
            "password_hash": hash_password("Student@123"),
            "name": "Adaeze Okafor", "role": "student",
            "school_id": demo_school_id, "student_id": adaeze["id"],
            "created_at": now_iso(),
        })

    # Sample CBT exam
    if not await db.cbt_exams.find_one({"school_id": demo_school_id, "subject": "Mathematics", "term": "1st Term"}):
        await db.cbt_exams.insert_one({
            "id": new_id(), "school_id": demo_school_id,
            "title": "JSS 1 Mathematics — Term 1 Test",
            "class_name": "JSS 1", "subject": "Mathematics",
            "term": "1st Term", "year": "2025/2026", "duration_min": 15,
            "questions": [
                {"question": "What is 7 + 8?", "options": ["13", "14", "15", "16"], "correct_idx": 2},
                {"question": "Which of these is an even number?", "options": ["7", "9", "12", "11"], "correct_idx": 2},
                {"question": "½ as a decimal is:", "options": ["0.2", "0.5", "0.25", "1.5"], "correct_idx": 1},
                {"question": "5 × 6 = ?", "options": ["11", "30", "56", "25"], "correct_idx": 1},
                {"question": "If 3x = 9, x equals:", "options": ["1", "2", "3", "6"], "correct_idx": 2},
            ],
            "published": True, "created_by": teacher_id, "created_at": now_iso(),
        })

    # Backfill: any existing school missing school_type/classes gets defaults
    async for sch in db.schools.find({"$or": [{"school_type": {"$exists": False}}, {"classes": {"$exists": False}}]}):
        st = sch.get("school_type") or "secondary"
        await db.schools.update_one(
            {"id": sch["id"]},
            {"$set": {
                "school_type": st,
                "classes": sch.get("classes") or default_classes(st),
            }},
        )

    # Backfill: questions on existing CBT exams without 'type' default to 'mcq'
    async for ex in db.cbt_exams.find({"questions.type": {"$exists": False}}):
        new_qs = []
        for q in ex.get("questions", []):
            if "type" not in q:
                q["type"] = "mcq"
            if "image_url" not in q:
                q["image_url"] = ""
            new_qs.append(q)
        await db.cbt_exams.update_one({"id": ex["id"]}, {"$set": {"questions": new_qs}})
