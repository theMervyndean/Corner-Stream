# Corner Streams — Product Requirements Document

## Original problem statement
Corner Streams is a SaaS for Nigerian schools — "Taking away the paper trap." Cloud DB for Student Bio, Academic Engine (CA + Exam, 100-pt), Financial Ledger (Stripe + bank transfers, balances, Debt Lock), Super Admin "God Mode" with kill-switch and password override, dynamic pricing UI with 1/2/3 Term toggle, bulk Excel onboarding, Digital Reports with passport, 5-star skills, principal signature & QR verification, contact-us routing to thecornerstreams@gmail.com, PWA / offline-first, plus CBT exams and student logins (Phase-2).

Brand: Deep Navy #002147, Vibrant Green #28A745, Electric Blue #0056B3. Visuals must depict Nigerian/African students/teachers/parents.

## User personas
- **Super Admin** — Corner Streams operator with global control (kill-switch, password override, leads, receipt verification).
- **School Admin** — principal/owner who registers a school, onboards students, pays for tier, monitors balances, configures subjects per class, provisions student logins.
- **Teacher** — enters CA + Exam scores and 5-star skill ratings per term/year; creates and publishes CBT MCQ exams.
- **Parent** — views child's digital report card and fee balance; locked out by Debt Lock when balance > 0.
- **Student (Phase-2)** — logs in with admin-provisioned credentials, sees class subjects, takes timed CBT exams, views own term result.

## Core requirements (static)
- 5 roles with JWT custom auth, all routes /api prefixed, MongoDB string IDs (no ObjectId in responses).
- Pricing tiers (NGN): CBT Essentials 40k/70k/110k · Digital Reports 50k/90k/140k · Financial Ledger 40k/70k/110k · Unified Enterprise 200k (Full Session only).
- Stripe checkout (test, sk_test_emergent), NGN→USD at fixed 1500.
- Bank-transfer receipt upload + super-admin verify queue.
- Digital report card: passport, CA(40)+Exam(60)→Total/Grade, skill ratings, principal signature (script font), QR code.
- Debt Lock: parent + student-only; blocks Result Checker if balance_due > 0.
- Kill-switch: blocks school-side login (school_admin/teacher/parent/student) but allows super_admin.
- CBT MCQ exams: 4 options, auto-graded; CBT score auto-fills the Exam (60-pt) column AND keeps raw CBT log (source: 'cbt' in scores doc).
- Subjects scoped per class.

## Phase-1 implemented (Feb 2026)
- ✅ Backend FastAPI with modular routers + MongoDB indexes + idempotent demo data seeding.
- ✅ JWT auth (httpOnly cookie + Bearer header).
- ✅ Bulk Excel student upload, score & skill batch upserts, auto-grade A–F.
- ✅ Digital Report Card endpoint with QR + Debt Lock.
- ✅ Stripe checkout via emergentintegrations + direct stripe SDK fallback for metadata bug.
- ✅ Bank receipt upload + super-admin approve/reject; auto-activates subscription.
- ✅ Super Admin: kill-switch, password override, leads, stats.
- ✅ React frontend with Outfit + IBM Plex Sans typography, brand palette, Nigerian imagery.
- ✅ Landing page (hero, features, pricing toggle 1T/2T/Full, testimonials, contact).
- ✅ Login / Register, all dashboards (school admin / teacher / parent / super admin), Report Card with QR.
- ✅ 30/30 Phase-1 backend tests passing.

## Phase-2 implemented (Feb 2026)
- ✅ **Student role** with login (`/api/auth/login`, `/api/students/me`).
- ✅ **Subject management per class** — `/api/subjects` (GET/PUT/DELETE).
- ✅ **CBT MCQ engine** — `/api/cbt/exams` CRUD, publish/unpublish, attempts start/submit (auto-graded).
- ✅ **CBT auto-fills Exam column** — submit converts % to /60 score, preserves CA, recomputes total/grade, tags `source='cbt'`.
- ✅ **One-shot exam attempts** — repeated submit returns 400; cross-student submit returns 403.
- ✅ **Student dashboard** — passport card, subjects grid, CBT cards (Take exam / Done with %), Result Checker with Debt Lock.
- ✅ **CBT take page** — sticky countdown timer, question palette, option select with brand styling, submit confirm dialog, post-submit results screen.
- ✅ **Teacher dashboard CBT tab** — exam library, dynamic MCQ builder dialog (mark correct option), publish toggle, attempts viewer with student names.
- ✅ **School admin dashboard** — Subjects tab (per-class management), passport thumbnail per student row, "Create login" button per student row.
- ✅ **Passport upload** — base64 data URL stored on student doc; rendered in report card + student dashboard.
- ✅ **PWA** — manifest.json (theme #002147, logo icon, standalone), basic service worker (cache app shell, never cache /api).
- ✅ Demo seed updated: class_subjects for JSS 1, sample published CBT (5 MCQs), student login `adaeze@demo.school` / `Student@123`.
- ✅ 45/45 backend tests passing (30 Phase-1 + 15 Phase-2).
- ⏭️ **Deferred**: offline CBT cache (per your choice — PWA shell only).
- ⏭️ **Deferred**: live email out for Contact Us (per your choice — DB-only).

## Phase-3 implemented (Feb 2026 — addresses user pushback)
- ✅ **Public registration is school-admin only** — teachers/parents/students can no longer self-register; schools build their own personnel from inside the dashboard.
- ✅ **Setup checklist** on the school admin Overview tab — visual progress bar with 7 actionable steps so a fresh school can immediately test every flow.
- ✅ **School Profile builder tab** — logo upload, motto, address, phone, email, founded year, website. Renders on report cards.
- ✅ **Users tab** — school admin creates/deletes teacher and parent logins (`POST /api/users`, `DELETE /api/users/{id}`).
- ✅ **Eye/EyeOff password toggle** on every password input (PasswordInput component).
- ✅ **Scroll-reveal animations** on landing page (Intersection Observer + CSS) + button micro-interactions (`.btn-anim` lift on hover, scale on press).
- ✅ **Subdomain routing** for `admin.cornerstreams.com` — host check forces super-admin entry; `/admin` route as fallback (`/login?admin=1`).
- ✅ **Annual cumulative report** — `GET /api/reports/annual/{student_id}?year=2025/2026` returns 3-term subject matrix, session average, promotion status (Promoted to next class / Repeat current class), aggregated skill ratings, QR. Frontend route: `/report/annual/:studentId`. Buttons added to Parent Portal + Student Dashboard.
- ✅ All 45/45 tests still passing (phase-1 register-parent test updated to assert new 422 behavior).

## Phase-4 implemented (Feb 2026 — autonomous "make it productive" pass)
- ✅ **Recharts wired across all admin sections** (brand colors only — Navy / Green / Electric Blue):
  - **Super Admin** — Analytics tab: school growth area chart (6 months), subscription tier donut, receipts pipeline bar, leads funnel bar, payment volume tile.
  - **School Admin Overview** — students-per-class bar, debt distribution donut, gender split donut, CBT activity area, subject averages bar.
  - **Parent Portal** — per-child term progression line chart (loaded inline below each child card when fees are clear).
  - **Student Dashboard** — personal term progression line + subject snapshot radar chart.
- ✅ **CBT post-submit review** — `GET /api/cbt/attempts/{id}/review` returns full Q&A with correct answers + student picks. Frontend `/cbt/review/:attemptId` page colors correct vs. wrong, surfaced from the take-result screen and as a "Review answers" button on every completed exam card.
- ✅ **Welcome Pack** — `/welcome-pack` route: print-ready A4 onboarding pack with school logo + motto, teacher list, parent portal directory, tear-off student login slips. One-click PDF via browser print.
- ✅ **`/api/analytics/super`, `/api/analytics/school`, `/api/analytics/student/{id}`** — three aggregation endpoints with role-scoped data.
- ✅ All 45/45 backend tests still passing. Frontend lint clean.

## Phase-D1 implemented (May 2026 — User management v2 + bulk onboarding)
- ✅ **Fernet password vault** (`backend/password_vault.py`) — admin-recoverable auto-passwords stored encrypted-at-rest with a key derived from `JWT_SECRET`. Strong 10-char generator avoids visually confusing chars.
- ✅ **`POST /api/auth/change-password`** — every user (teacher / parent / student / admin) can change their own password from their dashboard. Wipes admin-recoverable copy + sets `password_changed_by_user=true`.
- ✅ **`GET /api/users/{id}/reveal-password`** — admin reveals the *original* auto password until user changes it; returns 410 once they've changed it (industry-standard recovery flow).
- ✅ **`POST /api/users/{id}/reset-password`** — admin generates a fresh auto-password (revealed once). Audit-logged.
- ✅ **`POST /api/users/{id}/promote` & `/demote`** — admin grants admin-powers to a teacher/parent (they keep their primary role, gain `is_admin=true` flag). Cannot demote yourself or the primary school_admin. Last-admin deletion blocked.
- ✅ **`auth_utils.require_roles` updated** — `is_admin=true` satisfies any `school_admin`-protected endpoint. `ProtectedRoute` updated to match on the frontend.
- ✅ **Bulk uploads** (admin distributes credentials only — teachers see masked passwords):
  - **`POST /api/users/bulk-teachers`** — admin only. Auto-generates passwords for blank cells.
  - **`POST /api/users/bulk-parents`** — admin OR class teacher. Strict student-on-roster lookup (rows for unknown students skipped). Teachers restricted to their `assigned_classes`; passwords returned masked. Existing parent emails get linked (no duplicate user).
  - **`POST /api/users/bulk-students`** with `with_login=true` (default) — admin only. Auto-creates student record AND a `firstname.lastname.<school-handle>@<handle>.school` login + auto-password. Auto-expands `school.classes` with any new class_name.
- ✅ **Cleaned-up Excel templates** (`/api/templates/{parents,students,teachers,cbt-questions}.xlsx`) — single "Data" sheet with real sample rows only (no blank placeholder rows / stray helper text). Helper text moved to hover-tooltip comments on header cells + a separate "📖 Instructions" sheet.
- ✅ **Frontend components**:
  - `ChangePasswordDialog` — reusable, mounted in Navbar dropdown (works in all dashboards).
  - `BulkUploadDialog` — used by school admin (teachers/students/parents) and class teachers (parents only).
  - `CredentialsModal` — show-once table with per-row reveal + copy-to-clipboard + one-click Excel download.
  - **Navbar** — user dropdown with Dashboard / Admin dashboard (for promoted users) / Change password / Sign out. "ADMIN POWERS" badge for promoted teachers/parents.
  - **SchoolAdminDashboard Users tab** — redesigned with Bulk Teachers/Parents/Students + per-row Reveal / Reset / Promote / Demote / Delete actions and Auto vs User-set password badges.
  - **TeacherDashboard** — new "Parents" tab for class teachers to bulk-onboard parents for their assigned class(es).
- ✅ Seeded demo users now have their original passwords pre-encrypted in the vault — "Reveal" works on every demo account from day one.
- ✅ **55/55 backend tests passing** (25 new Phase-D1 + 30 Phase A/B/C regression).


## Demo accounts (seeded)
| Role | Email | Password |
|---|---|---|
| Super admin | super@cornerstreams.com | Super@123 |
| School admin | admin@demo.school | Admin@123 |
| Teacher | teacher@demo.school | Teacher@123 |
| Parent | parent@demo.school | Parent@123 |
| **Student** | **adaeze@demo.school** | **Student@123** |

## Backlog (P0/P1/P2)

### P0 — important next-up
- Live email-out for Contact Us → thecornerstreams@gmail.com (Resend / SendGrid).
- Offline CBT cache (deferred from Phase-2).
- Multi-class support: more than just JSS 1 (admin already has tools — needs roster expansion).

### P1 — significant features
- CBT question types: True/False, image-based, short-text.
- Per-student subject overrides (currently per-class).
- Annual session report (combined 1st/2nd/3rd term cumulative average).
- Stripe webhook signature verification + production NGN multi-currency support.
- Student attempt review screen (see correct answers after submission).

### P2 — nice-to-have
- Per-student notes / teacher comments on reports.
- Subscription auto-renewal reminders.
- Email/SMS notifications when balance is cleared (auto-Debt-Lock release).
- Audit log of super-admin actions.
- CBT exam randomization / question shuffling.
