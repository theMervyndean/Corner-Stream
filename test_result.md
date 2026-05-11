#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Phase A (Tenant Security) + Phase B (Multi-class roster + School-type) + Phase C (CBT True/False & image questions)
  added to Corner Streams MVP. WhatsApp messaging (Phase E) deferred to next session.

backend:
  - task: "Phase A — Tenant security audit & cross-tenant isolation"
    implemented: true
    working: true
    file: "backend/routers/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Removed public /auth/schools-public (was unused & leaked school list). All existing routers already scope by user.school_id; manually verified: cross-tenant GET /scores, /reports, /students returns 403. Need formal pen-test pass."
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL PHASE A TESTS PASSED (8/8):
          • /auth/schools-public removed (404) ✓
          • Cross-tenant student isolation: School-A admin cannot see School-B or Sunrise students ✓
          • Cross-tenant scores: School-A admin gets 403 when accessing School-B/Sunrise student scores ✓
          • Cross-tenant reports: School-A admin gets 403 when accessing School-B/Sunrise student reports ✓
          • Cross-tenant annual reports: School-A admin gets 403 for Sunrise annual reports ✓
          • Cross-tenant student update: School-A admin gets 404 when trying to update Sunrise student ✓
          • Cross-tenant CBT exams: School-A admin gets 403 when accessing Sunrise CBT exams ✓
          • Cross-tenant users: School-A admin can only see School-A users ✓
          
          Tenant isolation is FULLY FUNCTIONAL. All routers properly scope by school_id.

  - task: "Phase B — School type (primary/secondary/mixed) on registration + class roster"
    implemented: true
    working: true
    file: "backend/db.py, backend/routers/auth.py, backend/routers/schools.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Added DEFAULT_CLASSES_BY_TYPE in db.py:
          - primary: Nursery 1-2, Primary 1-6
          - secondary: JSS 1-3, SS 1-3
          - mixed: all of above
          /auth/register now accepts school_type (default 'secondary') and auto-seeds school.classes.
          /schools/me returns school_type + classes. /schools/me PUT accepts both for editing.
          /schools/me/classes POST adds a custom class name (e.g., 'JSS 1 Crystal').
          /schools/me/classes/{name} DELETE removes (blocked if students assigned, can't remove last class).
          Demo school backfilled to secondary type on startup.
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL PHASE B TESTS PASSED (11/11):
          • Primary school classes: Correct classes (Nursery 1-2, Primary 1-6) ✓
          • Secondary school classes: Correct classes (JSS 1-3, SS 1-3) ✓
          • Mixed school classes: Both primary and secondary classes (14 total) ✓
          • Default school type: Defaults to 'secondary' when not specified ✓
          • Add custom class: Successfully adds custom class names ✓
          • Add duplicate class: Rejects duplicate class names (400) ✓
          • Add empty class: Rejects empty/whitespace class names (400) ✓
          • Delete class (no students): Successfully deletes unused classes ✓
          • Delete class (with students): Blocks deletion when students assigned (400) ✓
          • Delete last class: Prevents deletion of last remaining class (400) ✓
          • Update school classes: PUT /schools/me successfully updates classes ✓
          
          School type and class roster management is FULLY FUNCTIONAL.

  - task: "Phase C — CBT True/False (Primary only) + image questions"
    implemented: true
    working: true
    file: "backend/routers/cbt.py, backend/db.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          MCQ class replaced with Question(type='mcq'|'true_false', image_url=optional base64).
          For true_false: options auto-set to ['True','False'], correct_idx 0=True, 1=False.
          Server-side validation: any true_false question rejected if school_type not in (primary, mixed) → returns 400.
          _strip_correct now includes type + image_url so students see them.
          Existing exam questions backfilled to type='mcq' on startup.
          Manual test: hacker (primary school) can create T/F; sunrise (secondary) gets 400 'True/False only for Primary or Mixed schools.'
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL PHASE C TESTS PASSED (11/11):
          • Primary true/false questions: Successfully creates T/F questions with images ✓
          • Secondary true/false rejected: Secondary schools get 400 with correct error message ✓
          • Secondary MCQ still works: Secondary schools can still create MCQ exams ✓
          • Student sees type and image: Students see type & image_url but not correct_idx ✓
          • Mixed school true/false: Mixed schools can create T/F questions ✓
          • Update exam with true/false: Primary schools can update exams with mixed MCQ+T/F ✓
          • Secondary update rejected: Secondary schools cannot update to include T/F (400) ✓
          • Backward compatibility: Existing exams have type='mcq' backfilled ✓
          • Student takes T/F exam: Students can start, take, and submit T/F exams ✓
          • Image URL preservation: Base64 image URLs correctly preserved throughout ✓
          • Options auto-set: T/F questions automatically get ['True','False'] options ✓
          
          CBT True/False and image questions are FULLY FUNCTIONAL.

frontend:
  - task: "Frontend — Multi-class school registration, custom classes, CBT TF+image"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Register.jsx, frontend/src/pages/SchoolAdminDashboard.jsx, frontend/src/pages/TeacherDashboard.jsx, frontend/src/pages/CBTTake.jsx, frontend/src/pages/CBTReview.jsx, backend/routers/students.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Frontend implementation complete:
          1. Register page: school_type selector (Primary / Secondary / Mixed) with descriptive copy
          2. SchoolAdminDashboard: new "Classes" tab — list classes, add custom (e.g., 'JSS 1 Crystal'), remove (blocked if students assigned, blocked if last)
          3. School profile shows school_type badge
          4. Student-add / Subject-add / Teacher-add dialogs use a Select dropdown bound to school.classes (no more free-text class)
          5. TeacherDashboard CBT builder: per-question type toggle (MCQ / True-False), T/F disabled for Secondary, image attach (base64 ≤800KB) with preview + remove
          6. CBTTake: renders image; T/F shows as 2 large buttons; MCQ retains A-D layout
          7. CBTReview: shows attached image and T/F badge
          8. Bulk Excel upload auto-expands the school's class roster with any new class_name encountered
          
          Screenshot verified: Register school-type selector; Classes tab with 7 classes (incl. 'JSS 1 Crystal'); Teacher CBT builder with T/F greyed for secondary + image attach button.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Phase A — Tenant security audit & cross-tenant isolation"
    - "Phase B — School type (primary/secondary/mixed) on registration + class roster"
    - "Phase C — CBT True/False (Primary only) + image questions"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
      Phase A+B+C backend complete. Please run a focused test on these three areas only:
      1. Tenant isolation pen-tests:
         - Register two new schools (School-A primary, School-B secondary)
         - Verify School-A admin cannot read School-B's students/scores/reports/CBT/users (all should 403 or empty)
         - Verify /auth/schools-public no longer exists (should 404)
      2. Multi-class roster:
         - Register primary school → /schools/me returns classes containing 'Nursery 1', 'Primary 1' etc.
         - Register secondary school → /schools/me returns classes containing 'JSS 1', 'SS 1' etc.
         - POST /schools/me/classes with name 'JSS 1 Crystal' appends
         - DELETE /schools/me/classes/{name} works when no students assigned; returns 400 when students assigned
         - DELETE on last class returns 400
      3. CBT enhancements:
         - Primary school admin creates exam with true_false + image_url question → 200 OK; question returned with type='true_false', options=['True','False'], image_url preserved
         - Secondary school admin attempts true_false → 400 with the exact 'Primary or Mixed schools' message
         - Student in primary school takes the TF+image exam → submitted answers auto-graded correctly; review endpoint exposes image_url + type
         - Existing demo school exams still work (backward compat — questions auto-typed 'mcq')

      Demo creds:
        super@cornerstreams.com / Super@123
        admin@demo.school / Admin@123 (Sunrise — secondary)
        adaeze@demo.school / Student@123 (JSS 1)
    -agent: "testing"
    -message: |
      ✅ PHASE A+B+C BACKEND TESTING COMPLETE — ALL 30 TESTS PASSED
      
      Comprehensive test suite executed with 100% pass rate:
      • Phase A (Tenant Security): 8/8 tests passed
      • Phase B (School Type & Classes): 11/11 tests passed
      • Phase C (CBT True/False & Images): 11/11 tests passed
      
      Test file: /app/backend_test_phases_abc.py
      
      All three phases are production-ready. No critical or major issues found.
      Backend implementation is solid and meets all requirements.