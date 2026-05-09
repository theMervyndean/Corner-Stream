"""Corner Streams Phase-2 — student role, subjects, CBT exams."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://digital-results-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("super@cornerstreams.com", "Super@123")
ADMIN = ("admin@demo.school", "Admin@123")
TEACHER = ("teacher@demo.school", "Teacher@123")
PARENT = ("parent@demo.school", "Parent@123")
STUDENT = ("adaeze@demo.school", "Student@123")
DEMO_SCHOOL_ID = "demo-school-001"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s, r.json()


# ---------- Student role login + me ----------
class TestStudentLogin:
    def test_student_login_returns_role_student(self):
        _, body = _login(*STUDENT)
        assert body["user"]["role"] == "student"
        assert body["user"]["email"] == STUDENT[0]
        # /students/me proves student_id is wired through JWT

    def test_students_me_returns_adaeze(self):
        s, _ = _login(*STUDENT)
        r = s.get(f"{API}/students/me", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["student"]["name"] == "Adaeze Okafor"
        assert r.json()["student"]["class_name"] == "JSS 1"

    def test_register_student_role_blocked(self):
        # /auth/register only allows school_admin|teacher|parent
        r = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_stu_{int(time.time())}@example.com",
            "password": "Test@1234", "name": "T",
            "role": "student", "school_id": DEMO_SCHOOL_ID,
        }, timeout=15)
        assert r.status_code in (400, 422), r.text


# ---------- Subjects ----------
class TestSubjects:
    def test_jss1_has_six_subjects(self):
        s, _ = _login(*ADMIN)
        r = s.get(f"{API}/subjects?class_name=JSS%201", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()["class_subjects"]
        assert len(rows) >= 1
        target = next((x for x in rows if x["class_name"] == "JSS 1"), None)
        assert target and len(target["subjects"]) == 6

    def test_admin_can_upsert_and_delete_subjects(self):
        s, _ = _login(*ADMIN)
        cls = f"TEST CLASS {int(time.time())}"
        r = s.put(f"{API}/subjects",
                  json={"class_name": cls, "subjects": ["Math", "English", "Science"]}, timeout=15)
        assert r.status_code == 200, r.text
        # verify GET returns it
        r2 = s.get(f"{API}/subjects?class_name={cls.replace(' ', '%20')}", timeout=15)
        assert r2.status_code == 200
        target = next((x for x in r2.json()["class_subjects"] if x["class_name"] == cls), None)
        assert target and target["subjects"] == ["Math", "English", "Science"]
        # update
        r3 = s.put(f"{API}/subjects",
                   json={"class_name": cls, "subjects": ["Math", "Civic"]}, timeout=15)
        assert r3.status_code == 200
        r4 = s.get(f"{API}/subjects?class_name={cls.replace(' ', '%20')}", timeout=15)
        target = next((x for x in r4.json()["class_subjects"] if x["class_name"] == cls), None)
        assert target["subjects"] == ["Math", "Civic"]
        # delete
        r5 = s.delete(f"{API}/subjects/{cls.replace(' ', '%20')}", timeout=15)
        assert r5.status_code == 200
        r6 = s.delete(f"{API}/subjects/{cls.replace(' ', '%20')}", timeout=15)
        assert r6.status_code == 404


# ---------- Student login provisioning + passport ----------
class TestStudentProvisioning:
    def test_admin_provisions_student_login_and_passport(self):
        s, _ = _login(*ADMIN)
        # create a fresh student
        suffix = int(time.time())
        cs = s.post(f"{API}/students", json={
            "name": f"TEST Stu {suffix}", "age": 11, "gender": "Male",
            "class_name": "JSS 1", "balance_due": 0,
        }, timeout=15)
        assert cs.status_code == 200, cs.text
        sid = cs.json()["student"]["id"]
        try:
            email = f"test_stu_{suffix}@demo.school"
            pw = "Stu@12345"
            rl = s.post(f"{API}/students/{sid}/login", json={"email": email, "password": pw}, timeout=15)
            assert rl.status_code == 200, rl.text
            # listing must show login_email
            r2 = s.get(f"{API}/students", timeout=15)
            row = next(x for x in r2.json()["students"] if x["id"] == sid)
            assert row.get("login_email") == email
            # student can log in
            r3 = requests.post(f"{API}/auth/login",
                               json={"email": email, "password": pw}, timeout=15)
            assert r3.status_code == 200
            assert r3.json()["user"]["role"] == "student"
            # NOTE: login response currently does NOT include student_id (minor)
            # but JWT carries it — verify via /students/me
            tok = r3.json()["token"]
            me = requests.get(f"{API}/students/me",
                              headers={"Authorization": f"Bearer {tok}"}, timeout=15)
            assert me.status_code == 200
            assert me.json()["student"]["id"] == sid

            # passport upload
            data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
            rp = s.put(f"{API}/students/{sid}/passport", json={"passport_url": data_url}, timeout=15)
            assert rp.status_code == 200, rp.text
            # report includes passport
            rr = s.get(f"{API}/reports/{sid}?term=1st%20Term", timeout=15)
            assert rr.status_code == 200, rr.text
            assert rr.json().get("student", {}).get("passport_url") == data_url
        finally:
            s.delete(f"{API}/students/{sid}", timeout=15)


# ---------- CBT Flow (full E2E with fresh exam) ----------
@pytest.fixture(scope="class")
def cbt_context():
    """Create a fresh teacher-owned CBT exam, fresh student + login,
    return all needed handles. Cleanup after class."""
    admin, _ = _login(*ADMIN)
    teacher, _ = _login(*TEACHER)
    suffix = int(time.time())

    # New student in JSS 1
    cs = admin.post(f"{API}/students", json={
        "name": f"TEST CBTStu {suffix}", "age": 12, "gender": "Female",
        "class_name": "JSS 1", "balance_due": 0,
    }, timeout=15)
    assert cs.status_code == 200
    sid = cs.json()["student"]["id"]

    email = f"TEST_cbtstu_{suffix}@demo.school"
    pw = "CbtStu@123"
    rl = admin.post(f"{API}/students/{sid}/login",
                    json={"email": email, "password": pw}, timeout=15)
    assert rl.status_code == 200, rl.text

    student_sess, _ = _login(email, pw)

    # Different student (Adaeze) for forbidden test
    other_sess, _ = _login(*STUDENT)

    # Teacher creates exam
    exam_payload = {
        "title": f"TEST Exam {suffix}",
        "class_name": "JSS 1",
        "subject": "Mathematics",
        "term": "2nd Term",
        "year": "2025/2026",
        "duration_min": 10,
        "questions": [
            {"question": f"Q{i+1}: 2+{i}=?", "options": ["1", "2", str(2+i), "999"], "correct_idx": 2}
            for i in range(5)
        ],
    }
    rc = teacher.post(f"{API}/cbt/exams", json=exam_payload, timeout=15)
    assert rc.status_code == 200, rc.text
    exam = rc.json()["exam"]
    exam_id = exam["id"]

    yield {
        "admin": admin, "teacher": teacher, "student": student_sess,
        "other_student": other_sess, "exam_id": exam_id, "sid": sid,
        "email": email, "pw": pw, "subject": "Mathematics",
        "term": "2nd Term", "year": "2025/2026",
    }

    # cleanup
    teacher.delete(f"{API}/cbt/exams/{exam_id}", timeout=15)
    admin.delete(f"{API}/students/{sid}", timeout=15)


class TestCBT:
    def test_unpublished_exam_hidden_from_student(self, cbt_context):
        ctx = cbt_context
        r = ctx["student"].get(f"{API}/cbt/exams", timeout=15)
        assert r.status_code == 200
        assert all(e["id"] != ctx["exam_id"] for e in r.json()["exams"])

    def test_publish_then_student_sees_stripped(self, cbt_context):
        ctx = cbt_context
        r = ctx["teacher"].put(f"{API}/cbt/exams/{ctx['exam_id']}",
                               json={"published": True}, timeout=15)
        assert r.status_code == 200
        r2 = ctx["student"].get(f"{API}/cbt/exams", timeout=15)
        exams = r2.json()["exams"]
        e = next((x for x in exams if x["id"] == ctx["exam_id"]), None)
        assert e is not None, "Published exam not visible to student"
        # questions should have been stripped (replaced by question_count)
        assert "questions" not in e
        assert e.get("question_count") == 5

    def test_start_attempt(self, cbt_context):
        ctx = cbt_context
        r = ctx["student"].post(f"{API}/cbt/exams/{ctx['exam_id']}/start", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        ctx["attempt_id"] = body["attempt"]["id"]
        # exam must NOT contain correct_idx
        for q in body["exam"]["questions"]:
            assert "correct_idx" not in q

    def test_other_student_cannot_submit_someone_elses_attempt(self, cbt_context):
        ctx = cbt_context
        attempt_id = ctx["attempt_id"]
        r = ctx["other_student"].post(f"{API}/cbt/attempts/{attempt_id}/submit",
                                      json={"answers": [2, 2, 2, 2, 2]}, timeout=15)
        assert r.status_code == 403, r.text

    def test_submit_autograde_and_autofill_score(self, cbt_context):
        ctx = cbt_context
        # Pre-seed CA-only score via teacher (ca_score=20, exam_score=0) to verify CA preserved
        teacher = ctx["teacher"]
        seed = teacher.post(f"{API}/scores/batch", json={"items": [{
            "student_id": ctx["sid"], "term": ctx["term"], "year": ctx["year"],
            "subject": ctx["subject"], "ca_score": 20, "exam_score": 0,
        }]}, timeout=15)
        assert seed.status_code == 200, seed.text

        # Submit 4/5 correct (correct_idx=2; answer 4 with 2's, last with 0 => 4 correct)
        r = ctx["student"].post(f"{API}/cbt/attempts/{ctx['attempt_id']}/submit",
                                json={"answers": [2, 2, 2, 2, 0]}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["attempt"]["raw_score"] == 4
        assert body["attempt"]["total_qs"] == 5
        assert body["attempt"]["score_pct"] == 80.0

        # Verify score auto-filled: exam_score = round(80/100*60)=48, CA preserved as 20 → total 68
        # Read back via teacher batch GET? Use scores listing endpoint
        # Check via reports endpoint as admin (bypasses debt-lock)
        admin = ctx["admin"]
        rr = admin.get(f"{API}/reports/{ctx['sid']}?term=2nd%20Term", timeout=15)
        assert rr.status_code == 200, rr.text
        scores = rr.json().get("scores", [])
        target = next((x for x in scores if x["subject"] == ctx["subject"]), None)
        assert target is not None, f"No score row found: {scores}"
        assert target["ca_score"] == 20, f"CA not preserved: {target}"
        assert target["exam_score"] == 48, f"Wrong exam_score: {target}"
        assert target["total"] == 68
        assert target.get("source") == "cbt"

    def test_repeated_submit_returns_400(self, cbt_context):
        ctx = cbt_context
        r = ctx["student"].post(f"{API}/cbt/attempts/{ctx['attempt_id']}/submit",
                                json={"answers": [2, 2, 2, 2, 2]}, timeout=15)
        assert r.status_code == 400, r.text

    def test_teacher_attempts_listing_has_student_name(self, cbt_context):
        ctx = cbt_context
        r = ctx["teacher"].get(f"{API}/cbt/exams/{ctx['exam_id']}/attempts", timeout=15)
        assert r.status_code == 200, r.text
        attempts = r.json()["attempts"]
        assert len(attempts) >= 1
        a = attempts[0]
        assert a.get("student_name", "").startswith("TEST CBTStu")
        assert a.get("class_name") == "JSS 1"


# ---------- PWA ----------
class TestPWA:
    def test_manifest_reachable(self):
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m.get("theme_color") == "#002147"
        assert m.get("start_url") == "/"

    def test_service_worker_reachable(self):
        r = requests.get(f"{BASE_URL}/sw.js", timeout=15)
        assert r.status_code == 200
        assert "self" in r.text or "addEventListener" in r.text
