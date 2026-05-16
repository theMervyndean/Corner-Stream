# Corner Streams — Product Requirements Document

## Original problem statement
Corner Streams is a SaaS for Nigerian schools — "Taking away the paper trap." Cloud DB for Student Bio, Academic Engine (CA + Exam, 100-pt), Financial Ledger (Stripe + bank transfers, balances, Debt Lock), Super Admin "God Mode" with kill-switch and password override, dynamic pricing UI, bulk Excel onboarding, Digital Reports with passport, 5-star skills, principal signature & QR verification, PWA / offline-first, plus CBT exams and student logins.

Brand: Deep Navy #002147, Vibrant Green #28A745, Electric Blue #0056B3.


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
