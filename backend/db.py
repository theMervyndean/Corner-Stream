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


async def seed_demo_data():
    """Seed super admin + a demo school with admin/teacher/parent + students."""
    db = get_db()

    # Super admin
    super_email = os.environ["ADMIN_EMAIL"]
    super_pw = os.environ["ADMIN_PASSWORD"]
    existing_super = await db.users.find_one({"email": super_email})
    if not existing_super:
        await db.users.insert_one({
            "id": new_id(),
            "email": super_email,
            "password_hash": hash_password(super_pw),
            "name": "Super Admin",
            "role": "super_admin",
            "school_id": None,
            "created_at": now_iso(),
        })

    # Demo school
    demo_school_id = "demo-school-001"
    existing_school = await db.schools.find_one({"id": demo_school_id})
    if not existing_school:
        await db.schools.insert_one({
            "id": demo_school_id,
            "name": "Sunrise Academy",
            "principal_name": "Mrs. Adaeze Okonkwo",
            "address": "12 Ahmadu Bello Way, Ikeja, Lagos",
            "phone": "+2348012345678",
            "kill_switch": False,
            "subscription_tier": "digital_reports",
            "subscription_duration": "full_session",
            "subscription_expires_at": (datetime.now(timezone.utc) + timedelta(days=270)).isoformat(),
            "created_at": now_iso(),
        })

    # School admin
    if not await db.users.find_one({"email": "admin@demo.school"}):
        await db.users.insert_one({
            "id": new_id(),
            "email": "admin@demo.school",
            "password_hash": hash_password("Admin@123"),
            "name": "Chinedu Eze",
            "role": "school_admin",
            "school_id": demo_school_id,
            "created_at": now_iso(),
        })

    # Teacher
    teacher_user = await db.users.find_one({"email": "teacher@demo.school"})
    if not teacher_user:
        teacher_id = new_id()
        await db.users.insert_one({
            "id": teacher_id,
            "email": "teacher@demo.school",
            "password_hash": hash_password("Teacher@123"),
            "name": "Mr. Bayo Adeyemi",
            "role": "teacher",
            "school_id": demo_school_id,
            "assigned_class": "JSS 1",
            "created_at": now_iso(),
        })
    else:
        teacher_id = teacher_user["id"]

    # Parent
    parent_user = await db.users.find_one({"email": "parent@demo.school"})
    if not parent_user:
        parent_id = new_id()
        await db.users.insert_one({
            "id": parent_id,
            "email": "parent@demo.school",
            "password_hash": hash_password("Parent@123"),
            "name": "Mr. Tunde Okafor",
            "role": "parent",
            "school_id": demo_school_id,
            "created_at": now_iso(),
        })
    else:
        parent_id = parent_user["id"]

    # Demo students
    demo_students = [
        {"name": "Adaeze Okafor", "age": 12, "gender": "Female", "class_name": "JSS 1", "parent_email": "parent@demo.school", "balance_due": 0},
        {"name": "Emeka Nwosu", "age": 13, "gender": "Male", "class_name": "JSS 1", "parent_email": "parent@demo.school", "balance_due": 25000},
        {"name": "Fatima Bello", "age": 12, "gender": "Female", "class_name": "JSS 1", "parent_email": None, "balance_due": 0},
        {"name": "Chukwudi Eze", "age": 13, "gender": "Male", "class_name": "JSS 1", "parent_email": None, "balance_due": 15000},
    ]
    for s in demo_students:
        existing = await db.students.find_one({"school_id": demo_school_id, "name": s["name"]})
        if not existing:
            await db.students.insert_one({
                "id": new_id(),
                "school_id": demo_school_id,
                "name": s["name"],
                "age": s["age"],
                "gender": s["gender"],
                "class_name": s["class_name"],
                "passport_url": "",
                "parent_email": s["parent_email"],
                "balance_due": s["balance_due"],
                "created_at": now_iso(),
            })

    # Demo scores for Adaeze Okafor (the parent's child)
    adaeze = await db.students.find_one({"school_id": demo_school_id, "name": "Adaeze Okafor"})
    if adaeze:
        existing_scores = await db.scores.count_documents({"student_id": adaeze["id"], "term": "1st Term"})
        if existing_scores == 0:
            subjects = [
                ("Mathematics", 28, 55), ("English Language", 30, 60),
                ("Basic Science", 27, 58), ("Social Studies", 25, 50),
                ("Civic Education", 29, 62), ("Computer Studies", 30, 65),
            ]
            for subj, ca, exam in subjects:
                total = ca + exam
                grade = _calc_grade(total)
                await db.scores.insert_one({
                    "id": new_id(),
                    "student_id": adaeze["id"],
                    "school_id": demo_school_id,
                    "term": "1st Term",
                    "year": "2025/2026",
                    "subject": subj,
                    "ca_score": ca,
                    "exam_score": exam,
                    "total": total,
                    "grade": grade,
                    "teacher_id": teacher_id,
                    "created_at": now_iso(),
                })
            skills = [
                ("Punctuality", 5), ("Attentiveness", 4), ("Neatness", 5),
                ("Honesty", 5), ("Sportsmanship", 4), ("Leadership", 4),
            ]
            for name, rating in skills:
                await db.skill_ratings.insert_one({
                    "id": new_id(),
                    "student_id": adaeze["id"],
                    "school_id": demo_school_id,
                    "term": "1st Term",
                    "year": "2025/2026",
                    "skill_name": name,
                    "rating": rating,
                    "teacher_id": teacher_id,
                    "created_at": now_iso(),
                })


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
