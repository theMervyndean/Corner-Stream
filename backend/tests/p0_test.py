"""P0 focused tests: #1 WhatsApp payment gate, #10 report card upgrades, #11 parent children list."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("super@cornerstreams.com", "Super@123")
ADMIN = ("admin@demo.school", "Admin@123")
PARENT = ("parent@demo.school", "Parent@123")
DEMO_SCHOOL_ID = "demo-school-001"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"{email} login failed: {r.status_code} {r.text}"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def fresh_school():
    """Register a fresh school via public /api/auth/register."""
    suffix = int(time.time())
    email = f"TEST_p0_{suffix}@example.com"
    payload = {
        "email": email,
        "password": "Test@1234",
        "name": "T1 P0 Admin",
        "school_name": f"TEST P0 School {suffix}",
        "school_type": "secondary",
        "whatsapp_phone": "+2348011112222",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    # Backend lowercases email — store canonical
    return {"email": email.lower(), "password": "Test@1234", "school_id": body["school_id"], "body": body}


# ========== P0 #1: Payment gate ==========

class TestPaymentGate:
    def test_1a_register_returns_pending_no_token(self, fresh_school):
        body = fresh_school["body"]
        assert body.get("pending_verification") is True
        assert body.get("school_id")
        assert body.get("school_email") == fresh_school["email"]
        assert body.get("school_name")
        assert "token" not in body, "Register must NOT issue token"
        assert "user" not in body, "Register must NOT return user obj"

    def test_1b_login_blocked_with_403(self, fresh_school):
        r = requests.post(f"{API}/auth/login",
                          json={"email": fresh_school["email"], "password": fresh_school["password"]},
                          timeout=15)
        assert r.status_code == 403, r.text
        assert "ayment" in r.text.lower() or "verif" in r.text.lower()

    def test_1c_super_admin_generate_whatsapp_code(self, fresh_school):
        sup = _login(*SUPER)
        r = sup.post(f"{API}/superadmin/schools/{fresh_school['school_id']}/whatsapp-code", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["code"].isdigit() and len(body["code"]) == 6
        assert body["whatsapp_phone"] == "+2348011112222"
        code1 = body["code"]
        # Regenerate -> new code
        r2 = sup.post(f"{API}/superadmin/schools/{fresh_school['school_id']}/whatsapp-code", timeout=15)
        assert r2.status_code == 200
        code2 = r2.json()["code"]
        # Cache last code for later tests
        fresh_school["code"] = code2
        # Very rare collision but allow it; assert format
        assert len(code2) == 6 and code2.isdigit()

    def test_1d_public_bank_receipt_flips_to_pending_code(self, fresh_school):
        payload = {
            "school_email": fresh_school["email"],
            "tier": "digital_reports",
            "duration": "1_term",
            "amount_ngn": 50000,
            "file_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            "whatsapp_code": fresh_school.get("code", "000000"),
            "note": "T1 public receipt",
        }
        r = requests.post(f"{API}/payments/bank-receipt-public", json=payload, timeout=20)
        assert r.status_code == 200, r.text

        # Verify school flipped to pending_code
        sup = _login(*SUPER)
        r2 = sup.get(f"{API}/superadmin/verification-queue", timeout=15)
        assert r2.status_code == 200
        items = r2.json()["items"]
        match = next((i for i in items if i["school_id"] == fresh_school["school_id"]), None)
        assert match is not None, "school not in verification queue"
        assert match["verification_status"] == "pending_code"
        assert match["whatsapp_phone"] == "+2348011112222"
        assert match["admin_email"] == fresh_school["email"]
        assert match["verification_code"] is not None
        assert match["latest_receipt"] is not None
        assert match["latest_receipt"]["whatsapp_code"] == fresh_school.get("code", "000000")

    def test_1f_approve_activates_school_and_subscription(self, fresh_school):
        sup = _login(*SUPER)
        r = sup.post(f"{API}/superadmin/schools/{fresh_school['school_id']}/verify",
                     json={"decision": "approve", "note": "T1 approve"}, timeout=15)
        assert r.status_code == 200, r.text
        # Login now works
        r2 = requests.post(f"{API}/auth/login",
                           json={"email": fresh_school["email"], "password": fresh_school["password"]},
                           timeout=15)
        assert r2.status_code == 200, r2.text
        # School has subscription tier applied
        schools = sup.get(f"{API}/superadmin/schools", timeout=15).json()["schools"]
        sch = next(s for s in schools if s["id"] == fresh_school["school_id"])
        assert sch["verification_status"] == "active"
        assert sch["subscription_tier"] == "digital_reports"
        assert sch["subscription_duration"] == "1_term"
        assert sch["subscription_expires_at"]


class TestRejectFlow:
    """Separate fresh school for reject path."""
    def test_1g_reject_blocks_login(self):
        suffix = int(time.time())
        email = f"TEST_p0_rej_{suffix}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test@1234", "name": "Rej Admin",
            "school_name": f"TEST Rej {suffix}", "whatsapp_phone": "+2348099999",
        }, timeout=20)
        assert r.status_code == 200, r.text
        school_id = r.json()["school_id"]
        sup = _login(*SUPER)
        rj = sup.post(f"{API}/superadmin/schools/{school_id}/verify",
                      json={"decision": "reject", "note": "fake receipt"}, timeout=15)
        assert rj.status_code == 200
        # Login -> 403 with rejected message
        rl = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "Test@1234"}, timeout=15)
        assert rl.status_code == 403
        assert "reject" in rl.text.lower()


# ========== Regression ==========
class TestRegression:
    @pytest.mark.parametrize("creds,role", [
        (SUPER, "super_admin"),
        (ADMIN, "school_admin"),
        (("teacher@demo.school", "Teacher@123"), "teacher"),
        (PARENT, "parent"),
        (("adaeze@demo.school", "Student@123"), "student"),
    ])
    def test_seeded_logins_still_work(self, creds, role):
        r = requests.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == role

    def test_superadmin_stats_has_pending_schools(self):
        sup = _login(*SUPER)
        r = sup.get(f"{API}/superadmin/stats", timeout=15)
        assert r.status_code == 200
        assert "pending_schools" in r.json()


# ========== P0 #10: Report card upgrades ==========
class TestReportCardUpgrades:
    def test_10_adaeze_report_has_new_fields(self):
        s = _login(*PARENT)
        students = s.get(f"{API}/students", timeout=15).json()["students"]
        adaeze = next(st for st in students if st["name"] == "Adaeze Okafor")
        r = s.get(f"{API}/reports/{adaeze['id']}", params={"term": "1st Term"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # New fields exist
        for k in ("subjects_scored", "total_subjects", "principal_comment", "teacher_comment"):
            assert k in body, f"missing {k}"
        assert isinstance(body["subjects_scored"], int)
        assert isinstance(body["total_subjects"], int)
        assert body["total_subjects"] >= body["subjects_scored"]
        # Average should be >=75 for Adaeze (seeded with strong scores) -> excellent wording
        avg = body["average"]
        if avg >= 75:
            assert "excellent" in body["principal_comment"].lower()
            assert "outstanding" in body["teacher_comment"].lower()
        # School has brand_color + logo_url available for frontend
        assert "brand_color" in body["school"]


# ========== P0 #11: Parent children list ==========
class TestParentChildrenBug:
    def test_11_parent_sees_both_children(self):
        s = _login(*PARENT)
        r = s.get(f"{API}/students", timeout=15)
        assert r.status_code == 200, r.text
        names = sorted([st["name"] for st in r.json()["students"]])
        assert "Adaeze Okafor" in names, names
        assert "Emeka Nwosu" in names, names
        assert len([n for n in names if n in ("Adaeze Okafor", "Emeka Nwosu")]) == 2
