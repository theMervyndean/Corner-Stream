"""Corner Streams — backend integration tests against public preview URL."""
import os
import io
import time
import requests
import pytest
import openpyxl

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://digital-results-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("super@cornerstreams.com", "Super@123")
ADMIN = ("admin@demo.school", "Admin@123")
TEACHER = ("teacher@demo.school", "Teacher@123")
PARENT = ("parent@demo.school", "Parent@123")
DEMO_SCHOOL_ID = "demo-school-001"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert "Corner Streams" in r.json().get("app", "")


# ---------- Auth ----------
class TestAuth:
    @pytest.mark.parametrize("email,pw,role", [
        (SUPER[0], SUPER[1], "super_admin"),
        (ADMIN[0], ADMIN[1], "school_admin"),
        (TEACHER[0], TEACHER[1], "teacher"),
        (PARENT[0], PARENT[1], "parent"),
    ])
    def test_login_seeded_users(self, email, pw, role):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email
        assert data["user"]["role"] == role
        assert isinstance(data["token"], str) and len(data["token"]) > 20

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": SUPER[0], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_endpoint(self):
        s = _login(*ADMIN)
        r = s.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == ADMIN[0]

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_schools_public(self):
        r = requests.get(f"{API}/auth/schools-public", timeout=15)
        assert r.status_code == 200
        schools = r.json()["schools"]
        assert any(sc["id"] == DEMO_SCHOOL_ID for sc in schools)

    def test_register_school_admin(self):
        email = f"TEST_admin_{int(time.time())}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test@1234", "name": "Test Admin",
            "role": "school_admin", "school_name": f"TEST School {int(time.time())}",
        }, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "school_admin"
        assert r.json()["user"]["school_id"]

    def test_register_parent_existing_school(self):
        email = f"TEST_parent_{int(time.time())}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test@1234", "name": "Test Parent",
            "role": "parent", "school_id": DEMO_SCHOOL_ID,
        }, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["school_id"] == DEMO_SCHOOL_ID


# ---------- Schools / Students ----------
class TestSchoolAndStudents:
    def test_schools_me(self):
        s = _login(*ADMIN)
        r = s.get(f"{API}/schools/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["school"]["id"] == DEMO_SCHOOL_ID

    def test_list_students_school_admin(self):
        s = _login(*ADMIN)
        r = s.get(f"{API}/students", timeout=15)
        assert r.status_code == 200
        names = [st["name"] for st in r.json()["students"]]
        assert "Adaeze Okafor" in names and "Emeka Nwosu" in names

    def test_create_student(self):
        s = _login(*ADMIN)
        payload = {"name": f"TEST Student {int(time.time())}", "age": 11, "gender": "Female",
                   "class_name": "JSS 1", "parent_email": None, "balance_due": 0}
        r = s.post(f"{API}/students", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["student"]["id"]
        # verify GET
        r2 = s.get(f"{API}/students", timeout=15)
        assert any(st["id"] == sid for st in r2.json()["students"])
        # cleanup
        s.delete(f"{API}/students/{sid}", timeout=15)

    def test_parent_sees_only_own_children(self):
        s = _login(*PARENT)
        r = s.get(f"{API}/students", timeout=15)
        assert r.status_code == 200
        names = [st["name"] for st in r.json()["students"]]
        assert set(names) == {"Adaeze Okafor", "Emeka Nwosu"}

    def test_bulk_upload_xlsx(self):
        s = _login(*ADMIN)
        # Build xlsx in memory
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["name", "age", "gender", "class_name", "parent_email", "balance_due"])
        suffix = int(time.time())
        ws.append([f"TEST_Bulk1_{suffix}", 12, "Male", "JSS 1", "", 0])
        ws.append([f"TEST_Bulk2_{suffix}", 13, "Female", "JSS 1", "", 5000])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        # multipart upload - cannot use json content-type
        h = {k: v for k, v in s.headers.items() if k.lower() != "content-type"}
        r = requests.post(f"{API}/students/bulk-upload",
                          files={"file": (f"test_{suffix}.xlsx", buf.getvalue(),
                                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inserted"] == 2
        assert body["errors"] == []


# ---------- Scores & Reports ----------
class TestScoresAndReports:
    def test_teacher_batch_scores_and_skills(self):
        s = _login(*TEACHER)
        r = s.get(f"{API}/students", timeout=15)
        adaeze = next(st for st in r.json()["students"] if st["name"] == "Adaeze Okafor")
        sid = adaeze["id"]
        batch = {"items": [
            {"student_id": sid, "term": "1st Term", "year": "2025/2026",
             "subject": "Mathematics", "ca_score": 30, "exam_score": 55},
        ]}
        r = s.post(f"{API}/scores/batch", json=batch, timeout=15)
        assert r.status_code == 200, r.text
        saved = r.json()["saved"]
        assert len(saved) == 1
        assert saved[0]["total"] == 85
        assert saved[0]["grade"] == "A"

        # Skill rating
        skill = {"student_id": sid, "term": "1st Term", "year": "2025/2026",
                 "skill_name": "Punctuality", "rating": 5}
        r = s.post(f"{API}/scores/skills", json=skill, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["skill"]["rating"] == 5

    def test_report_adaeze_no_debt_as_parent(self):
        s = _login(*PARENT)
        r = s.get(f"{API}/students", timeout=15)
        adaeze = next(st for st in r.json()["students"] if st["name"] == "Adaeze Okafor")
        r = s.get(f"{API}/reports/{adaeze['id']}?term=1st%20Term", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["debt_locked"] is False
        assert body["qr_code"].startswith("data:image/png;base64,")
        assert len(body["scores"]) >= 1
        assert len(body["skill_ratings"]) >= 1

    def test_report_emeka_debt_locked_as_parent(self):
        s = _login(*PARENT)
        r = s.get(f"{API}/students", timeout=15)
        emeka = next(st for st in r.json()["students"] if st["name"] == "Emeka Nwosu")
        r = s.get(f"{API}/reports/{emeka['id']}?term=1st%20Term", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["debt_locked"] is True
        assert body["balance_due"] == 25000

    def test_report_emeka_admin_bypasses_debt_lock(self):
        s = _login(*ADMIN)
        r = s.get(f"{API}/students", timeout=15)
        emeka = next(st for st in r.json()["students"] if st["name"] == "Emeka Nwosu")
        r = s.get(f"{API}/reports/{emeka['id']}?term=1st%20Term", timeout=15)
        assert r.status_code == 200, r.text
        # Admin not parent -> no debt lock
        assert r.json().get("debt_locked") is False


# ---------- Payments ----------
class TestPayments:
    def test_pricing(self):
        r = requests.get(f"{API}/payments/pricing", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ngn_per_usd"] == 1500
        assert "digital_reports" in body["pricing_ngn"]
        assert body["pricing_ngn"]["digital_reports"]["1_term"] == 50000

    def test_checkout_creates_session(self):
        s = _login(*ADMIN)
        payload = {"tier": "digital_reports", "duration": "1_term",
                   "origin_url": BASE_URL}
        r = s.post(f"{API}/payments/checkout", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["url"].startswith("http")
        assert data["session_id"]
        # status check
        r2 = s.get(f"{API}/payments/checkout/status/{data['session_id']}", timeout=30)
        assert r2.status_code == 200, r2.text

    def test_checkout_wrong_role_forbidden(self):
        s = _login(*TEACHER)
        r = s.post(f"{API}/payments/checkout", json={
            "tier": "digital_reports", "duration": "1_term", "origin_url": BASE_URL,
        }, timeout=20)
        assert r.status_code == 403

    def test_bank_receipt_flow(self):
        s = _login(*ADMIN)
        payload = {"tier": "digital_reports", "duration": "1_term", "amount_ngn": 50000,
                   "file_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                   "note": "TEST receipt"}
        r = s.post(f"{API}/payments/bank-receipt", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        rid = r.json()["receipt"]["id"]

        # super admin lists
        sup = _login(*SUPER)
        r2 = sup.get(f"{API}/payments/bank-receipts", timeout=15)
        assert r2.status_code == 200
        assert any(rec["id"] == rid for rec in r2.json()["receipts"])

        # decision approve
        r3 = sup.post(f"{API}/payments/bank-receipts/{rid}/decision",
                       json={"decision": "approve", "note": "ok"}, timeout=15)
        assert r3.status_code == 200, r3.text
        assert r3.json()["status"] == "approved"


# ---------- Super Admin / Leads / Kill Switch ----------
class TestSuperAdmin:
    def test_stats(self):
        s = _login(*SUPER)
        r = s.get(f"{API}/superadmin/stats", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ("schools", "students", "users", "leads"):
            assert k in body
        assert body["schools"] >= 1

    def test_lead_submit_and_list(self):
        # public submit
        r = requests.post(f"{API}/leads", json={
            "name": "TEST Lead", "email": f"TEST_lead_{int(time.time())}@example.com",
            "school_name": "TEST Lead School", "phone": "+234999",
            "message": "Demo inquiry from automated tests",
        }, timeout=15)
        assert r.status_code == 200, r.text
        # super admin list
        s = _login(*SUPER)
        r2 = s.get(f"{API}/leads", timeout=15)
        assert r2.status_code == 200
        assert any(ld["name"] == "TEST Lead" for ld in r2.json()["leads"])

    def test_lead_list_forbidden_for_admin(self):
        s = _login(*ADMIN)
        r = s.get(f"{API}/leads", timeout=15)
        assert r.status_code == 403

    def test_password_override(self):
        sup = _login(*SUPER)
        # override admin password to a known new one
        new_pw = "Override@123!"
        r = sup.post(f"{API}/superadmin/password-override",
                      json={"user_email": ADMIN[0], "new_password": new_pw}, timeout=15)
        assert r.status_code == 200
        # login with new pw works
        r2 = requests.post(f"{API}/auth/login",
                            json={"email": ADMIN[0], "password": new_pw}, timeout=15)
        assert r2.status_code == 200
        # restore original
        r3 = sup.post(f"{API}/superadmin/password-override",
                      json={"user_email": ADMIN[0], "new_password": ADMIN[1]}, timeout=15)
        assert r3.status_code == 200

    def test_kill_switch_blocks_school_users(self):
        sup = _login(*SUPER)
        # turn ON
        r = sup.post(f"{API}/superadmin/schools/{DEMO_SCHOOL_ID}/kill-switch",
                      json={"kill_switch": True}, timeout=15)
        assert r.status_code == 200
        try:
            # admin login should fail with 403
            r1 = requests.post(f"{API}/auth/login",
                                json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=15)
            assert r1.status_code == 403, f"Expected 403 but got {r1.status_code}: {r1.text}"
            # super admin still works
            r2 = requests.post(f"{API}/auth/login",
                                json={"email": SUPER[0], "password": SUPER[1]}, timeout=15)
            assert r2.status_code == 200
        finally:
            # ALWAYS turn OFF
            sup.post(f"{API}/superadmin/schools/{DEMO_SCHOOL_ID}/kill-switch",
                     json={"kill_switch": False}, timeout=15)
        # post-cleanup login works
        r3 = requests.post(f"{API}/auth/login",
                            json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=15)
        assert r3.status_code == 200
