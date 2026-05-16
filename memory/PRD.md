# Corner Streams — Product Requirements Document

## Original problem statement
Corner Streams is a SaaS for Nigerian schools — "Taking away the paper trap." Cloud DB for Student Bio, Academic Engine (CA + Exam, 100-pt), Financial Ledger (Stripe + bank transfers, balances, Debt Lock), Super Admin "God Mode" with kill-switch and password override, dynamic pricing UI, bulk Excel onboarding, Digital Reports with passport, 5-star skills, principal signature & QR verification, PWA / offline-first, plus CBT exams and student logins.

Brand: Deep Navy #002147, Vibrant Green #28A745, Electric Blue #0056B3.



## Latest session (Feb 2026 — Teacher Scoping + Exam Approval Workflow)
Streamlined pass: enforced server-side scoping for teachers and shipped a 3-state CBT approval workflow with one-click admin approval.

### Backend
**`auth_utils.py`** — Added shared helpers:
- `teacher_assigned_classes(user)` returns the list of class names a teacher is assigned to (handles both `assigned_classes` array and legacy `assigned_class` single value).
- `is_scoped_teacher(user)` returns `True` only when role == "teacher" AND `is_admin` is falsy (promoted teachers bypass scoping).

**`routers/students.py`** — `_scope_filter()` now adds `{class_name: {$in: assigned_classes}}` when `is_scoped_teacher`. Teachers with no assignment see zero students. `list_students` validates any requested `class_name` is in the allowed set before returning.

**`routers/scores.py`** — Added `_block_if_outside_teacher_classes()` helper. Applied in `list_scores` (raises 403), `upsert_scores` (silently skips ineligible rows in a batch), and `upsert_skill` (raises 403).

**`routers/cbt.py`** — Approval workflow:
- New `status` field with three values: `draft / pending_review / published`. New exams stamped `draft`.
- `_resolve_status(exam)` reads legacy docs safely: explicit `status` wins, else `published:true → "published"`, else `"draft"`. Zero data migration needed.
- `_decorate_status(exam)` attaches the resolved status to every API response.
- `update_exam` translates the legacy `published` flag into a status change:
  - Scoped teacher + `published:true` → `status="pending_review"`, `published=false`, stamps `submitted_for_review_at` + `submitted_by`.
  - Admin/super_admin + `published:true` → direct publish (`status="published"`).
  - Any role + `published:false` → `status="draft"`.
- **New endpoint** `POST /cbt/exams/{exam_id}/approve` (school_admin/super_admin) — one-click: atomically sets `status="published"`, `published=true`, `approved_at`, `approved_by`, and emits `EVENT_EXAM_PUBLISHED` audit event.
- `start_attempt` now gates on `_resolve_status(exam) == "published"` instead of the raw `published` flag.
- `delete_exam` and `update_exam` now block scoped teachers from touching exams in classes they aren't assigned to.
- `list_exams` accepts optional `?status=` filter (post-decoration so legacy rows match) and applies teacher class scoping when applicable.

### Frontend
**`TeacherDashboard.jsx`** — CBT table:
- Status column now shows three badges: `Draft` (slate) / `Pending review` (amber) / `Published` (green).
- Action button label changes contextually: `Submit for review` (when draft) / `Withdraw` (when pending) / `Unpublish` (when published).
- `togglePublish` toast now reads back the new `status` and displays the appropriate message.

**`SchoolAdminDashboard.jsx`** — Overview tab:
- New `CBT exam approvals` card next to Quick Actions.
- Shows amber `{N} pending` badge or slate `0 pending`.
- Lists up to 6 pending exams (title, class, subject, term, Qs) with a green `Approve & publish` button each. Spillover footer for more than 6.
- `approveExam()` calls `POST /cbt/exams/{id}/approve` and refreshes.
- `refresh()` fetches `/cbt/exams?status=pending_review` in parallel with the rest.

### Verified end-to-end (curl chain, 9 steps)
1. Teacher login → token ✅
2. `GET /students` → only JSS 1 students returned (4 rows, no leakage) ✅
3. `GET /cbt/exams` → only JSS 1 exams, all with resolved `status` field ✅
4. Teacher creates exam → starts as `draft` ✅
5. Teacher PUT `published:true` → backend flips to `status=pending_review`, `published=false` ✅
6. Student `POST /cbt/exams/{id}/start` → HTTP 404 ✅ (correctly blocked)
7. Admin `GET /cbt/exams?status=pending_review` → 1 result ✅
8. Admin `POST /cbt/exams/{id}/approve` → `status=published, published=true` ✅
9. Student `POST /cbt/exams/{id}/start` → HTTP 200 ✅

Screenshot confirmed: admin overview shows `1 pending` badge + the pending exam with `Approve & publish` button.

### Files touched
- `backend/auth_utils.py` (helpers)
- `backend/routers/students.py` (scoped filter)
- `backend/routers/scores.py` (per-student gate)
- `backend/routers/cbt.py` (status field + workflow + approve endpoint)
- `frontend/src/pages/TeacherDashboard.jsx` (badge + dynamic button label)
- `frontend/src/pages/SchoolAdminDashboard.jsx` (pending-approvals card)

### Still backlog
- Broadsheet endpoint + frontend (Tier 2 — deferred this pass)
- Class-teacher comments storage + UI
- Pagination on teacher CBT table
- Paystack / WhatsApp / Email (blocked on user-supplied keys)



## Latest session (Feb 2026 — TeacherDashboard Tier 1 scaffold)
Replicated the SuperAdmin / SchoolAdmin shell architecture for the Teacher portal and laid the foundation for role-based class-teacher features.

### Backend additions (`/app/backend/routers/users.py`, `/app/backend/routers/auth.py`)
- Extended `UserCreateIn` & `UserUpdateIn`: added `assigned_subjects: Optional[List[str]]` and `is_class_teacher: Optional[bool]`.
- `create_user` and `update_user` now persist these fields when present.
- `_user_public()` in `auth.py` returns `assigned_subjects` and `is_class_teacher` so the frontend gating logic works.

### Frontend (`/app/frontend/src/pages/TeacherDashboard.jsx`)
- Full shell rewrite to match SchoolAdmin: pinned left sidebar (`cs-bg-navy`, `lg:w-64 xl:w-72`, only inner nav scrolls), fixed in-page header below the global Navbar, mobile drawer with hamburger.
- Top-right identity card shows avatar + name + "Teacher · Class teacher" (when applicable).
- Sidebar nav: **Overview** / **Scores Panel** / **CBT Results** / **My Class Reports** (4th tab gated by `user.is_class_teacher === true` OR legacy `assigned_classes.length > 0`).
- Logout grouped inside the sidebar nav (red-tinted button, `data-testid="teacher-sidebar-logout"`).
- **Overview**: 4 KPI tiles (my class students, assigned classes, exams created, published exams) + Quick Actions card + Parents bulk-upload card (class-teacher only, moved here per user choice).
- **Scores Panel**: unchanged behaviour — class filter, term, year, roster, academic scores & skills tabs, save endpoint.
- **CBT Results**: unchanged exam library + builder dialog + attempts dialog.
- **My Class Reports**: stub placeholder for Tier 2 (broadsheet + per-student report cards + class-teacher comment).
- Animations: each tab wrapped in `cs-pane-fade` for smooth tab transitions.

### Verified via screenshot
Logged in as `teacher@demo.school` / `Teacher@123` → Overview / Scores Panel / My Class Reports all render correctly with fixed sidebar+header, KPI tiles populated (4 students · JSS 1 · 1 exam · 1 published), Tier 2 reports stub visible because demo teacher has `assigned_classes: ["JSS 1"]`. Lint clean.

### Tier 2 backlog (next)
- Class-teacher broadsheet endpoint + UI (per-class CA/Exam/Total/Avg table)
- Per-student report card preview from teacher side
- Attendance summary + class-teacher comment workflow
- Teacher scoping on `/students` and `/scores` (only return rows for assigned classes)
- Exam approval workflow: teacher submit → pending_review → admin approve → published


## Latest session (May 2026 — SuperAdmin shell refresh)
Pulled latest code from GitHub branch `corner-streams` (the auto-saved branch). All 7 SuperAdmin shell tasks done:
1. **Pinned sidebar** — `fixed left-0 top-14 bottom-0` with `flex flex-col h-full`; only the inner `<nav>` scrolls.
2. **PC widening** — sidebar `lg:w-64 xl:w-72`; main content `lg:ml-64 xl:ml-72 lg:px-10 xl:px-12 max-w-[1800px]`.
3. **Logout at sidebar bottom** — new red-tinted button anchored beneath Password override (`data-testid="sidebar-logout"`).
4. **Top header user identity** — slim card top-right of main showing avatar + name + "Super Admin" (`super-header-user`, `super-header-username`, `super-header-userrole`).
5. **Client-side pagination** — `PAGE_SIZE=12` cards per page on Schools, Users, Receipts. Filter changes auto-reset to page 1. Prev/Next with "Page X of Y" + "Showing A–B of N" (testids `schools-pager`, `users-pager`, `receipts-pager`).
6. **Smooth animations** — `transition-all duration-300` on sidebar; new `cs-pane-fade` CSS class wraps `paneBody` and reuses existing `tabFade` keyframe for fade-up on tab switch.
7. **Support Access** — new amber "Support" button on each school card (`support-access-{id}`) opens a confirmation dialog with audit-warning. On confirm, calls new endpoint `POST /api/superadmin/schools/{id}/impersonate` which issues a school_admin JWT and logs `EVENT_SUPPORT_ACCESS` to audit_log. Original super token saved to `localStorage.cs_super_token_backup`, new token to `cs_token`, then hard-redirect to `/dashboard/school`.

### Backend additions
- `backend/audit_log.py`: new `EVENT_SUPPORT_ACCESS = "support_access_impersonation"` constant.
- `backend/routers/superadmin.py`: new `POST /superadmin/schools/{school_id}/impersonate` endpoint (super_admin only, 404 if no school_admin user exists for school).

### Files touched
- `frontend/src/pages/SuperAdmin.jsx` — full shell rewrite via targeted edits, lints clean
- `frontend/src/index.css` — added `.cs-pane-fade` class
- `backend/audit_log.py` — new EVENT constant
- `backend/routers/superadmin.py` — impersonation endpoint

### Verified via screenshot
Login as `super@cornerstreams.com` → all 3 panes render, sidebar logout visible, header user card visible, Support Access dialog opens with warning. Lint clean. `/api/health` returns 200.


## Latest session (Feb 2026 — migration + P0 #1, #10, #11)
Project codebase was migrated from the `corner_streams` branch of `github.com/theMervyndean/Corner-Stream` into a new Emergent workspace (previous URL was `school-admin-hub-62...`, this workspace is `branding-hub-47...`). All routers, pages, PRD, design_guidelines, demo data and tests restored.

### Done this session
- ✅ **Migration** — full repo cloned, deps installed, supervisor running, all 5 demo logins working.
- ✅ **P0 #1 — WhatsApp-verified payment gate**:
  - `RegisterIn.whatsapp_phone` added; stored on school doc.
  - Register endpoint returns `pending_verification: true` and does NOT auto-login.
  - Login already blocks `verification_status="pending_payment"`/`"rejected"` schools (existing).
  - `PublicBankReceiptIn.whatsapp_code` added; receipt upload flips school to `"pending_code"`.
  - New super-admin endpoints: `GET /superadmin/verification-queue`, `POST /superadmin/schools/{id}/whatsapp-code`, `POST /superadmin/schools/{id}/verify`.
  - Approve cascades to: school active + receipt approved + subscription tier/duration/expiry set.
  - Frontend new page `/pending` with bank-details box, tier selector, WhatsApp deep-link, receipt upload + 6-digit code input.
  - SuperAdmin dashboard new "Verification queue" tab with badge count, generate-code dialog with WhatsApp deep-link, approve/reject buttons, code-match indicator.
- ✅ **P0 #10 — Report card upgrades**:
  - Reports endpoint now returns `subjects_scored`, `total_subjects`, `principal_comment`, `teacher_comment` (auto-remarks from average).
  - ReportCard.jsx fully restyled to use `school.brand_color` (border-top stripe, table header, comment boxes, accents) and `school.logo_url` (top-left logo box).
  - Per-subject "Remark" column added (Excellent/Very Good/etc. by grade).
  - "Subjects scored: X of Y" surfaced in student bio panel.
  - Principal + class teacher comment boxes with brand-tinted backgrounds.
- ✅ **P0 #11 — Parent portal children list**:
  - `/api/students` parent filter now uses case-insensitive regex on `parent_email` (defensive against case/whitespace drift when school admin creates parent accounts).

### Verified end-to-end (curl)
- Fresh register → login blocked → super admin generates code → school posts public receipt with code → queue shows match → approve → login succeeds → school_admin role.
- Demo school backfilled with `brand_color="#002147"` and `whatsapp_phone`.
- Reports endpoint returns new fields with correct auto-remarks for avg=86.5%.
- Parent (`parent@demo.school`) sees 2 children (Adaeze + Emeka).

## P0 backlog remaining (after this session)
2. Pagination on every table (>10–15 rows)
3. Navbar dropdown must open under avatar (not far-left)
4. 2FA confirmation modal + Pause/Restrict/Archive instead of hard-delete
5. Dual-role landing cards for promoted teachers
6. Teacher scoping — only see students they teach (class × subject pairs)
7. Fix "All Classes" / "Term" filter buttons (error)
8. Activity tab on School Admin (render /api/audit)
9. Per-school receipt history visible to school admin
12. "Test School" sandbox button on landing for sales conversion
13. OG + Twitter meta tags in index.html; Corner Streams email in footer
14. Auto-email receipts to thecornerstreams@gmail.com (BLOCKED on Resend/SendGrid key)

## Tech notes
- Backend uses `MONGO_URL` + `DB_NAME` from `.env` (preserved). Added: `JWT_SECRET`, `ADMIN_EMAIL=super@cornerstreams.com`, `ADMIN_PASSWORD=Super@123`, `FRONTEND_URL`.
- Stripe webhook still wired but `STRIPE_API_KEY` not present in env — checkout flow will fail by design; bank-transfer + WhatsApp flow is the primary path.
- Demo credentials: see `/app/memory/test_credentials.md`.
