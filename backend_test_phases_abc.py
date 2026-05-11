"""Corner Streams — Phase A+B+C backend integration tests."""
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://school-admin-hub-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Demo credentials
SUPER = ("super@cornerstreams.com", "Super@123")
ADMIN_SUNRISE = ("admin@demo.school", "Admin@123")  # Sunrise Academy - secondary
STUDENT_SUNRISE = ("adaeze@demo.school", "Student@123")  # JSS 1 student
DEMO_SCHOOL_ID = "demo-school-001"

# Test school credentials (will be created)
SCHOOL_A_EMAIL = f"schoola_admin_{int(time.time())}@test.com"
SCHOOL_A_PASSWORD = "SchoolA@123"
SCHOOL_B_EMAIL = f"schoolb_admin_{int(time.time())}@test.com"
SCHOOL_B_PASSWORD = "SchoolB@123"

# Global storage for test data
test_data = {
    "school_a_id": None,
    "school_a_admin_token": None,
    "school_b_id": None,
    "school_b_admin_token": None,
    "school_a_student_id": None,
    "school_b_student_id": None,
    "sunrise_student_id": None,
    "sunrise_exam_id": None,
    "primary_school_id": None,
    "primary_admin_token": None,
    "primary_student_id": None,
    "primary_student_email": None,
    "primary_student_password": None,
}


def _login(email: str, password: str) -> tuple[requests.Session, str]:
    """Login and return session + token."""
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s, token


def _register_school(email: str, password: str, school_name: str, school_type: str) -> tuple[str, str]:
    """Register a new school and return (school_id, token)."""
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": password,
        "name": f"{school_name} Admin",
        "school_name": school_name,
        "school_type": school_type,
        "principal_name": f"Principal of {school_name}",
        "school_phone": "+2348012345678",
        "school_address": "Test Address",
    }, timeout=20)
    assert r.status_code == 200, f"Registration failed: {r.status_code} {r.text}"
    data = r.json()
    return data["user"]["school_id"], data["token"]


# ========================================
# PHASE A: TENANT SECURITY & CROSS-TENANT ISOLATION
# ========================================

def test_phase_a_setup():
    """Setup: Register two new schools (School-A primary, School-B secondary)."""
    print("\n=== PHASE A SETUP ===")
    
    # Register School-A (primary)
    school_a_id, token_a = _register_school(
        SCHOOL_A_EMAIL, SCHOOL_A_PASSWORD, "School-A Primary", "primary"
    )
    test_data["school_a_id"] = school_a_id
    test_data["school_a_admin_token"] = token_a
    print(f"✓ School-A registered: {school_a_id}")
    
    # Register School-B (secondary)
    school_b_id, token_b = _register_school(
        SCHOOL_B_EMAIL, SCHOOL_B_PASSWORD, "School-B Secondary", "secondary"
    )
    test_data["school_b_id"] = school_b_id
    test_data["school_b_admin_token"] = token_b
    print(f"✓ School-B registered: {school_b_id}")
    
    # Create a student in School-A
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {token_a}", "Content-Type": "application/json"})
    r = s_a.post(f"{API}/students", json={
        "name": "Alice Primary",
        "age": 8,
        "gender": "Female",
        "class_name": "Primary 1",
        "balance_due": 0,
    }, timeout=15)
    assert r.status_code == 200, f"Failed to create School-A student: {r.text}"
    test_data["school_a_student_id"] = r.json()["student"]["id"]
    print(f"✓ School-A student created: {test_data['school_a_student_id']}")
    
    # Create a student in School-B
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {token_b}", "Content-Type": "application/json"})
    r = s_b.post(f"{API}/students", json={
        "name": "Bob Secondary",
        "age": 13,
        "gender": "Male",
        "class_name": "JSS 1",
        "balance_due": 0,
    }, timeout=15)
    assert r.status_code == 200, f"Failed to create School-B student: {r.text}"
    test_data["school_b_student_id"] = r.json()["student"]["id"]
    print(f"✓ School-B student created: {test_data['school_b_student_id']}")
    
    # Get Sunrise (demo school) student ID
    s_sunrise, _ = _login(*ADMIN_SUNRISE)
    r = s_sunrise.get(f"{API}/students", timeout=15)
    assert r.status_code == 200
    students = r.json()["students"]
    adaeze = next((s for s in students if s["name"] == "Adaeze Okafor"), None)
    assert adaeze, "Adaeze not found in Sunrise"
    test_data["sunrise_student_id"] = adaeze["id"]
    print(f"✓ Sunrise student ID: {test_data['sunrise_student_id']}")
    
    # Get Sunrise CBT exam ID
    r = s_sunrise.get(f"{API}/cbt/exams", timeout=15)
    assert r.status_code == 200
    exams = r.json()["exams"]
    if exams:
        test_data["sunrise_exam_id"] = exams[0]["id"]
        print(f"✓ Sunrise exam ID: {test_data['sunrise_exam_id']}")


def test_phase_a_schools_public_removed():
    """Verify /auth/schools-public is removed (should 404)."""
    print("\n=== TEST: /auth/schools-public removed ===")
    r = requests.get(f"{API}/auth/schools-public", timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
    print("✓ /auth/schools-public returns 404 (removed)")


def test_phase_a_cross_tenant_students():
    """School-A admin cannot see School-B students."""
    print("\n=== TEST: Cross-tenant student isolation ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    # School-A admin lists students
    r = s_a.get(f"{API}/students", timeout=15)
    assert r.status_code == 200
    students = r.json()["students"]
    student_ids = [s["id"] for s in students]
    
    # Should NOT see School-B student
    assert test_data["school_b_student_id"] not in student_ids, "School-A can see School-B student!"
    # Should NOT see Sunrise student
    assert test_data["sunrise_student_id"] not in student_ids, "School-A can see Sunrise student!"
    # Should ONLY see School-A student
    assert test_data["school_a_student_id"] in student_ids, "School-A cannot see its own student!"
    print("✓ School-A admin can only see School-A students")


def test_phase_a_cross_tenant_scores():
    """School-A admin cannot access School-B or Sunrise student scores."""
    print("\n=== TEST: Cross-tenant scores isolation ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    # Try to access Sunrise student scores
    r = s_a.get(f"{API}/scores?student_id={test_data['sunrise_student_id']}", timeout=15)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    print("✓ School-A admin cannot access Sunrise student scores (403)")
    
    # Try to access School-B student scores
    r = s_a.get(f"{API}/scores?student_id={test_data['school_b_student_id']}", timeout=15)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    print("✓ School-A admin cannot access School-B student scores (403)")


def test_phase_a_cross_tenant_reports():
    """School-A admin cannot access School-B or Sunrise student reports."""
    print("\n=== TEST: Cross-tenant reports isolation ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    # Try to access Sunrise student report
    r = s_a.get(f"{API}/reports/{test_data['sunrise_student_id']}", timeout=15)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    print("✓ School-A admin cannot access Sunrise student report (403)")


def test_phase_a_cross_tenant_annual_reports():
    """School-A admin cannot access Sunrise student annual report."""
    print("\n=== TEST: Cross-tenant annual reports isolation ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    r = s_a.get(f"{API}/reports/annual/{test_data['sunrise_student_id']}?year=2025/2026", timeout=15)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    print("✓ School-A admin cannot access Sunrise annual report (403)")


def test_phase_a_cross_tenant_student_update():
    """School-A admin cannot update Sunrise student."""
    print("\n=== TEST: Cross-tenant student update isolation ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    r = s_a.put(f"{API}/students/{test_data['sunrise_student_id']}", json={
        "name": "Hacked Name"
    }, timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
    print("✓ School-A admin cannot update Sunrise student (404)")


def test_phase_a_cross_tenant_cbt_exams():
    """School-A admin cannot access Sunrise CBT exams."""
    print("\n=== TEST: Cross-tenant CBT exam isolation ===")
    if not test_data["sunrise_exam_id"]:
        print("⊘ Skipped (no Sunrise exam)")
        return
    
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    r = s_a.get(f"{API}/cbt/exams/{test_data['sunrise_exam_id']}", timeout=15)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    print("✓ School-A admin cannot access Sunrise CBT exam (403)")


def test_phase_a_cross_tenant_users():
    """School-A admin can only see School-A users."""
    print("\n=== TEST: Cross-tenant users isolation ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    r = s_a.get(f"{API}/users", timeout=15)
    assert r.status_code == 200
    users = r.json()["users"]
    school_ids = [u.get("school_id") for u in users]
    
    # All users should belong to School-A
    for sid in school_ids:
        if sid:  # skip super_admin (school_id=None)
            assert sid == test_data["school_a_id"], f"School-A admin sees user from school {sid}!"
    print("✓ School-A admin can only see School-A users")


# ========================================
# PHASE B: SCHOOL TYPE & MULTI-CLASS ROSTER
# ========================================

def test_phase_b_primary_school_classes():
    """Primary school registration returns correct classes."""
    print("\n=== TEST: Primary school classes ===")
    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {test_data['school_a_admin_token']}", "Content-Type": "application/json"})
    
    r = s_a.get(f"{API}/schools/me", timeout=15)
    assert r.status_code == 200
    school = r.json()["school"]
    
    assert school["school_type"] == "primary", f"Expected primary, got {school['school_type']}"
    classes = school["classes"]
    
    # Check for primary classes
    assert "Nursery 1" in classes, "Missing Nursery 1"
    assert "Nursery 2" in classes, "Missing Nursery 2"
    assert "Primary 1" in classes, "Missing Primary 1"
    assert "Primary 6" in classes, "Missing Primary 6"
    
    # Should NOT have secondary classes
    assert "JSS 1" not in classes, "Primary school has JSS 1!"
    assert "SS 1" not in classes, "Primary school has SS 1!"
    
    print(f"✓ Primary school has correct classes: {len(classes)} classes")


def test_phase_b_secondary_school_classes():
    """Secondary school registration returns correct classes."""
    print("\n=== TEST: Secondary school classes ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    r = s_b.get(f"{API}/schools/me", timeout=15)
    assert r.status_code == 200
    school = r.json()["school"]
    
    assert school["school_type"] == "secondary", f"Expected secondary, got {school['school_type']}"
    classes = school["classes"]
    
    # Check for secondary classes
    assert "JSS 1" in classes, "Missing JSS 1"
    assert "JSS 3" in classes, "Missing JSS 3"
    assert "SS 1" in classes, "Missing SS 1"
    assert "SS 3" in classes, "Missing SS 3"
    
    # Should NOT have primary classes
    assert "Nursery 1" not in classes, "Secondary school has Nursery 1!"
    assert "Primary 1" not in classes, "Secondary school has Primary 1!"
    
    print(f"✓ Secondary school has correct classes: {len(classes)} classes")


def test_phase_b_mixed_school_classes():
    """Mixed school registration returns both primary and secondary classes."""
    print("\n=== TEST: Mixed school classes ===")
    
    # Register a mixed school
    email = f"mixed_admin_{int(time.time())}@test.com"
    school_id, token = _register_school(email, "Mixed@123", "Mixed School", "mixed")
    
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    
    r = s.get(f"{API}/schools/me", timeout=15)
    assert r.status_code == 200
    school = r.json()["school"]
    
    assert school["school_type"] == "mixed", f"Expected mixed, got {school['school_type']}"
    classes = school["classes"]
    
    # Should have BOTH primary and secondary classes
    assert "Nursery 1" in classes, "Missing Nursery 1"
    assert "Primary 6" in classes, "Missing Primary 6"
    assert "JSS 1" in classes, "Missing JSS 1"
    assert "SS 3" in classes, "Missing SS 3"
    
    print(f"✓ Mixed school has both primary and secondary classes: {len(classes)} classes")


def test_phase_b_default_school_type():
    """Registration without school_type defaults to secondary."""
    print("\n=== TEST: Default school type ===")
    
    email = f"default_admin_{int(time.time())}@test.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": "Default@123",
        "name": "Default Admin",
        "school_name": "Default School",
        # No school_type specified
    }, timeout=20)
    assert r.status_code == 200
    token = r.json()["token"]
    
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    
    r = s.get(f"{API}/schools/me", timeout=15)
    assert r.status_code == 200
    school = r.json()["school"]
    
    assert school["school_type"] == "secondary", f"Expected secondary default, got {school['school_type']}"
    print("✓ Default school type is secondary")


def test_phase_b_add_custom_class():
    """Add a custom class name."""
    print("\n=== TEST: Add custom class ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    custom_class = f"JSS 1 Crystal {int(time.time())}"
    r = s_b.post(f"{API}/schools/me/classes", json={
        "class_name": custom_class
    }, timeout=15)
    assert r.status_code == 200, f"Failed to add custom class: {r.text}"
    classes = r.json()["classes"]
    assert custom_class in classes, f"Custom class not in list: {classes}"
    print(f"✓ Custom class added: {custom_class}")


def test_phase_b_add_duplicate_class():
    """Adding duplicate class name should fail."""
    print("\n=== TEST: Add duplicate class ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    r = s_b.post(f"{API}/schools/me/classes", json={
        "class_name": "JSS 1"  # Already exists
    }, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    print("✓ Duplicate class rejected (400)")


def test_phase_b_add_empty_class():
    """Adding empty class name should fail."""
    print("\n=== TEST: Add empty class ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    r = s_b.post(f"{API}/schools/me/classes", json={
        "class_name": "   "  # Empty/whitespace
    }, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    print("✓ Empty class name rejected (400)")


def test_phase_b_delete_class_no_students():
    """Delete a class with no students assigned."""
    print("\n=== TEST: Delete class (no students) ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    # Add a temporary class
    temp_class = f"Temp Class {int(time.time())}"
    r = s_b.post(f"{API}/schools/me/classes", json={"class_name": temp_class}, timeout=15)
    assert r.status_code == 200
    
    # Delete it
    r = s_b.delete(f"{API}/schools/me/classes/{temp_class}", timeout=15)
    assert r.status_code == 200, f"Failed to delete class: {r.text}"
    classes = r.json()["classes"]
    assert temp_class not in classes, f"Class still in list: {classes}"
    print(f"✓ Class deleted: {temp_class}")


def test_phase_b_delete_class_with_students():
    """Cannot delete a class with students assigned."""
    print("\n=== TEST: Delete class (with students) ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    # JSS 1 has a student (Bob Secondary)
    r = s_b.delete(f"{API}/schools/me/classes/JSS 1", timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "student" in r.text.lower(), "Error message should mention students"
    print("✓ Cannot delete class with students (400)")


def test_phase_b_delete_last_class():
    """Cannot delete the last remaining class."""
    print("\n=== TEST: Delete last class ===")
    
    # Create a new school with only one class
    email = f"oneclass_admin_{int(time.time())}@test.com"
    school_id, token = _register_school(email, "OneClass@123", "One Class School", "secondary")
    
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    
    # Get current classes
    r = s.get(f"{API}/schools/me", timeout=15)
    classes = r.json()["school"]["classes"]
    
    # Delete all but one
    for cls in classes[:-1]:
        s.delete(f"{API}/schools/me/classes/{cls}", timeout=15)
    
    # Try to delete the last one
    last_class = classes[-1]
    r = s.delete(f"{API}/schools/me/classes/{last_class}", timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "last class" in r.text.lower(), "Error message should mention last class"
    print("✓ Cannot delete last class (400)")


def test_phase_b_update_school_classes():
    """Update school classes via PUT /schools/me."""
    print("\n=== TEST: Update school classes ===")
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {test_data['school_b_admin_token']}", "Content-Type": "application/json"})
    
    # Get current classes
    r = s_b.get(f"{API}/schools/me", timeout=15)
    original_classes = r.json()["school"]["classes"]
    
    # Update with custom classes
    new_classes = ["Custom 1", "Custom 2", "Custom 3"]
    r = s_b.put(f"{API}/schools/me", json={"classes": new_classes}, timeout=15)
    assert r.status_code == 200, f"Failed to update classes: {r.text}"
    
    # Verify
    r = s_b.get(f"{API}/schools/me", timeout=15)
    classes = r.json()["school"]["classes"]
    assert classes == new_classes, f"Classes not updated: {classes}"
    print(f"✓ School classes updated: {new_classes}")
    
    # Restore original classes
    s_b.put(f"{API}/schools/me", json={"classes": original_classes}, timeout=15)


# ========================================
# PHASE C: CBT TRUE/FALSE & IMAGE QUESTIONS
# ========================================

def test_phase_c_setup_primary_school():
    """Setup: Create a primary school with student for CBT testing."""
    print("\n=== PHASE C SETUP ===")
    
    # Register primary school
    email = f"primary_cbt_{int(time.time())}@test.com"
    school_id, token = _register_school(email, "Primary@123", "Primary CBT School", "primary")
    test_data["primary_school_id"] = school_id
    test_data["primary_admin_token"] = token
    print(f"✓ Primary school registered: {school_id}")
    
    # Create a student
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    r = s.post(f"{API}/students", json={
        "name": "Charlie Primary",
        "age": 9,
        "gender": "Male",
        "class_name": "Primary 3",
        "balance_due": 0,
    }, timeout=15)
    assert r.status_code == 200
    student_id = r.json()["student"]["id"]
    test_data["primary_student_id"] = student_id
    print(f"✓ Primary student created: {student_id}")
    
    # Create student login
    student_email = f"charlie_{int(time.time())}@test.com"
    student_password = "Charlie@123"
    r = s.post(f"{API}/students/{student_id}/login", json={
        "email": student_email,
        "password": student_password,
    }, timeout=15)
    assert r.status_code == 200
    test_data["primary_student_email"] = student_email
    test_data["primary_student_password"] = student_password
    print(f"✓ Primary student login created: {student_email}")


def test_phase_c_primary_true_false_question():
    """Primary school admin can create true/false question."""
    print("\n=== TEST: Primary school true/false question ===")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {test_data['primary_admin_token']}", "Content-Type": "application/json"})
    
    # Small base64 image (1x1 transparent PNG)
    image_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    
    r = s.post(f"{API}/cbt/exams", json={
        "title": "Primary True/False Test",
        "class_name": "Primary 3",
        "subject": "Science",
        "term": "1st Term",
        "year": "2025/2026",
        "duration_min": 10,
        "questions": [
            {
                "type": "true_false",
                "question": "The sun rises in the east.",
                "correct_idx": 0,  # True
                "image_url": image_url,
            },
            {
                "type": "true_false",
                "question": "Water boils at 50°C.",
                "correct_idx": 1,  # False
                "image_url": "",
            }
        ]
    }, timeout=15)
    assert r.status_code == 200, f"Failed to create true/false exam: {r.text}"
    
    exam = r.json()["exam"]
    assert len(exam["questions"]) == 2
    
    # Verify first question
    q1 = exam["questions"][0]
    assert q1["type"] == "true_false", f"Expected true_false, got {q1['type']}"
    assert q1["options"] == ["True", "False"], f"Wrong options: {q1['options']}"
    assert q1["correct_idx"] == 0
    assert q1["image_url"] == image_url, "Image URL not preserved"
    
    # Verify second question
    q2 = exam["questions"][1]
    assert q2["type"] == "true_false"
    assert q2["options"] == ["True", "False"]
    assert q2["correct_idx"] == 1
    
    print("✓ Primary school can create true/false questions with images")
    
    # Store exam ID for later tests
    test_data["primary_tf_exam_id"] = exam["id"]
    
    # Publish the exam so students can take it
    r = s.put(f"{API}/cbt/exams/{exam['id']}", json={"published": True}, timeout=15)
    assert r.status_code == 200, f"Failed to publish exam: {r.text}"


def test_phase_c_secondary_true_false_rejected():
    """Secondary school admin cannot create true/false question."""
    print("\n=== TEST: Secondary school true/false rejected ===")
    s_sunrise, _ = _login(*ADMIN_SUNRISE)
    
    r = s_sunrise.post(f"{API}/cbt/exams", json={
        "title": "Secondary True/False Test",
        "class_name": "JSS 1",
        "subject": "Mathematics",
        "term": "1st Term",
        "year": "2025/2026",
        "duration_min": 10,
        "questions": [
            {
                "type": "true_false",
                "question": "2 + 2 = 4",
                "correct_idx": 0,
            }
        ]
    }, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "Primary or Mixed" in r.text, f"Wrong error message: {r.text}"
    print("✓ Secondary school cannot create true/false questions (400)")


def test_phase_c_secondary_mcq_still_works():
    """Secondary school admin can still create MCQ exams."""
    print("\n=== TEST: Secondary school MCQ still works ===")
    s_sunrise, _ = _login(*ADMIN_SUNRISE)
    
    r = s_sunrise.post(f"{API}/cbt/exams", json={
        "title": "Secondary MCQ Test",
        "class_name": "JSS 1",
        "subject": "English",
        "term": "1st Term",
        "year": "2025/2026",
        "duration_min": 15,
        "questions": [
            {
                "type": "mcq",
                "question": "What is the capital of Nigeria?",
                "options": ["Lagos", "Abuja", "Kano", "Ibadan"],
                "correct_idx": 1,
            }
        ]
    }, timeout=15)
    assert r.status_code == 200, f"Failed to create MCQ exam: {r.text}"
    
    exam = r.json()["exam"]
    q = exam["questions"][0]
    assert q["type"] == "mcq", f"Expected mcq, got {q['type']}"
    print("✓ Secondary school can create MCQ exams")


def test_phase_c_student_sees_type_and_image():
    """Student can see question type and image_url (but not correct_idx)."""
    print("\n=== TEST: Student sees type and image ===")
    
    if not test_data.get("primary_tf_exam_id"):
        print("⊘ Skipped (no primary TF exam)")
        return
    
    s_student, _ = _login(test_data["primary_student_email"], test_data["primary_student_password"])
    
    # Get exam as student
    r = s_student.get(f"{API}/cbt/exams/{test_data['primary_tf_exam_id']}", timeout=15)
    assert r.status_code == 200, f"Student cannot access exam: {r.text}"
    
    exam = r.json()["exam"]
    questions = exam["questions"]
    
    # Verify correct_idx is stripped
    for q in questions:
        assert "correct_idx" not in q, "correct_idx exposed to student!"
        assert "type" in q, "type missing for student"
        assert "image_url" in q, "image_url missing for student"
    
    # Verify first question has image
    q1 = questions[0]
    assert q1["type"] == "true_false"
    assert q1["image_url"].startswith("data:image/png;base64,"), "Image URL not preserved for student"
    
    print("✓ Student sees type and image_url (correct_idx stripped)")


def test_phase_c_mixed_school_true_false():
    """Mixed school can create true/false questions."""
    print("\n=== TEST: Mixed school true/false ===")
    
    # Register mixed school
    email = f"mixed_cbt_{int(time.time())}@test.com"
    school_id, token = _register_school(email, "Mixed@123", "Mixed CBT School", "mixed")
    
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    
    r = s.post(f"{API}/cbt/exams", json={
        "title": "Mixed True/False Test",
        "class_name": "Primary 5",
        "subject": "Science",
        "term": "1st Term",
        "year": "2025/2026",
        "duration_min": 10,
        "questions": [
            {
                "type": "true_false",
                "question": "Plants need sunlight.",
                "correct_idx": 0,
            }
        ]
    }, timeout=15)
    assert r.status_code == 200, f"Mixed school cannot create true/false: {r.text}"
    print("✓ Mixed school can create true/false questions")


def test_phase_c_update_exam_with_true_false():
    """Update exam with true/false questions (primary only)."""
    print("\n=== TEST: Update exam with true/false ===")
    
    if not test_data.get("primary_tf_exam_id"):
        print("⊘ Skipped (no primary TF exam)")
        return
    
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {test_data['primary_admin_token']}", "Content-Type": "application/json"})
    
    # Update with mixed MCQ + true/false
    r = s.put(f"{API}/cbt/exams/{test_data['primary_tf_exam_id']}", json={
        "questions": [
            {
                "type": "mcq",
                "question": "What color is the sky?",
                "options": ["Red", "Blue", "Green"],
                "correct_idx": 1,
            },
            {
                "type": "true_false",
                "question": "The earth is flat.",
                "correct_idx": 1,  # False
            }
        ]
    }, timeout=15)
    assert r.status_code == 200, f"Failed to update exam: {r.text}"
    print("✓ Primary school can update exam with mixed MCQ + true/false")


def test_phase_c_secondary_update_with_true_false_rejected():
    """Secondary school cannot update exam to include true/false."""
    print("\n=== TEST: Secondary update with true/false rejected ===")
    s_sunrise, _ = _login(*ADMIN_SUNRISE)
    
    # Get an existing Sunrise exam
    r = s_sunrise.get(f"{API}/cbt/exams", timeout=15)
    exams = r.json()["exams"]
    if not exams:
        print("⊘ Skipped (no Sunrise exams)")
        return
    
    exam_id = exams[0]["id"]
    
    # Try to update with true/false
    r = s_sunrise.put(f"{API}/cbt/exams/{exam_id}", json={
        "questions": [
            {
                "type": "true_false",
                "question": "Test question",
                "correct_idx": 0,
            }
        ]
    }, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "Primary or Mixed" in r.text, f"Wrong error message: {r.text}"
    print("✓ Secondary school cannot update exam with true/false (400)")


def test_phase_c_backward_compat_existing_exams():
    """Existing demo exams have type='mcq' backfilled."""
    print("\n=== TEST: Backward compatibility ===")
    s_sunrise, _ = _login(*ADMIN_SUNRISE)
    
    r = s_sunrise.get(f"{API}/cbt/exams", timeout=15)
    exams = r.json()["exams"]
    
    if not exams:
        print("⊘ Skipped (no Sunrise exams)")
        return
    
    # Check first exam
    exam_id = exams[0]["id"]
    r = s_sunrise.get(f"{API}/cbt/exams/{exam_id}", timeout=15)
    exam = r.json()["exam"]
    
    # All questions should have type='mcq' (backfilled)
    for q in exam["questions"]:
        assert "type" in q, "Question missing type field"
        assert q["type"] == "mcq", f"Expected mcq, got {q['type']}"
        assert "image_url" in q, "Question missing image_url field"
    
    print("✓ Existing exams have type='mcq' backfilled")


def test_phase_c_student_takes_tf_exam():
    """Student can take and submit true/false exam."""
    print("\n=== TEST: Student takes true/false exam ===")
    
    if not test_data.get("primary_tf_exam_id"):
        print("⊘ Skipped (no primary TF exam)")
        return
    
    s_student, _ = _login(test_data["primary_student_email"], test_data["primary_student_password"])
    
    # Start attempt
    r = s_student.post(f"{API}/cbt/exams/{test_data['primary_tf_exam_id']}/start", timeout=15)
    assert r.status_code == 200, f"Failed to start exam: {r.text}"
    
    attempt_id = r.json()["attempt"]["id"]
    exam = r.json()["exam"]
    
    # Verify questions have type and image_url
    for q in exam["questions"]:
        assert "type" in q
        assert "image_url" in q
        assert "correct_idx" not in q
    
    # Submit answers (all True)
    r = s_student.post(f"{API}/cbt/attempts/{attempt_id}/submit", json={
        "answers": [0, 0]  # Both True
    }, timeout=15)
    assert r.status_code == 200, f"Failed to submit exam: {r.text}"
    
    result = r.json()
    assert "score_pct" in result["attempt"]
    print(f"✓ Student completed true/false exam (score: {result['attempt']['score_pct']}%)")


# ========================================
# MAIN TEST RUNNER
# ========================================

def run_all_tests():
    """Run all Phase A+B+C tests."""
    print("\n" + "="*60)
    print("CORNER STREAMS — PHASE A+B+C BACKEND TESTS")
    print("="*60)
    
    tests = [
        # Phase A Setup
        ("Phase A Setup", test_phase_a_setup),
        
        # Phase A Tests
        ("Phase A: /auth/schools-public removed", test_phase_a_schools_public_removed),
        ("Phase A: Cross-tenant students", test_phase_a_cross_tenant_students),
        ("Phase A: Cross-tenant scores", test_phase_a_cross_tenant_scores),
        ("Phase A: Cross-tenant reports", test_phase_a_cross_tenant_reports),
        ("Phase A: Cross-tenant annual reports", test_phase_a_cross_tenant_annual_reports),
        ("Phase A: Cross-tenant student update", test_phase_a_cross_tenant_student_update),
        ("Phase A: Cross-tenant CBT exams", test_phase_a_cross_tenant_cbt_exams),
        ("Phase A: Cross-tenant users", test_phase_a_cross_tenant_users),
        
        # Phase B Tests
        ("Phase B: Primary school classes", test_phase_b_primary_school_classes),
        ("Phase B: Secondary school classes", test_phase_b_secondary_school_classes),
        ("Phase B: Mixed school classes", test_phase_b_mixed_school_classes),
        ("Phase B: Default school type", test_phase_b_default_school_type),
        ("Phase B: Add custom class", test_phase_b_add_custom_class),
        ("Phase B: Add duplicate class", test_phase_b_add_duplicate_class),
        ("Phase B: Add empty class", test_phase_b_add_empty_class),
        ("Phase B: Delete class (no students)", test_phase_b_delete_class_no_students),
        ("Phase B: Delete class (with students)", test_phase_b_delete_class_with_students),
        ("Phase B: Delete last class", test_phase_b_delete_last_class),
        ("Phase B: Update school classes", test_phase_b_update_school_classes),
        
        # Phase C Setup
        ("Phase C Setup", test_phase_c_setup_primary_school),
        
        # Phase C Tests
        ("Phase C: Primary true/false question", test_phase_c_primary_true_false_question),
        ("Phase C: Secondary true/false rejected", test_phase_c_secondary_true_false_rejected),
        ("Phase C: Secondary MCQ still works", test_phase_c_secondary_mcq_still_works),
        ("Phase C: Student sees type and image", test_phase_c_student_sees_type_and_image),
        ("Phase C: Mixed school true/false", test_phase_c_mixed_school_true_false),
        ("Phase C: Update exam with true/false", test_phase_c_update_exam_with_true_false),
        ("Phase C: Secondary update with true/false rejected", test_phase_c_secondary_update_with_true_false_rejected),
        ("Phase C: Backward compatibility", test_phase_c_backward_compat_existing_exams),
        ("Phase C: Student takes true/false exam", test_phase_c_student_takes_tf_exam),
    ]
    
    passed = 0
    failed = 0
    errors = []
    
    for name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((name, str(e)))
            print(f"✗ FAILED: {name}")
            print(f"  Error: {e}")
        except Exception as e:
            failed += 1
            errors.append((name, f"Exception: {e}"))
            print(f"✗ ERROR: {name}")
            print(f"  Exception: {e}")
    
    print("\n" + "="*60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("="*60)
    
    if errors:
        print("\nFAILED TESTS:")
        for name, error in errors:
            print(f"  ✗ {name}")
            print(f"    {error}")
    
    return passed, failed


if __name__ == "__main__":
    passed, failed = run_all_tests()
    exit(0 if failed == 0 else 1)
