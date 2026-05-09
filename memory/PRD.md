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
