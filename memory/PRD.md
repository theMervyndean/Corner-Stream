# Corner Streams — Product Requirements Document

_Last updated: Feb 10, 2026_

## Original Problem Statement
Corner Streams is a SaaS for Nigerian schools — **"Taking away the paper trap."**

Cloud spine for Student Bio, Academic Engine (CA + Exam, 100-pt), Financial Ledger (Stripe + bank transfers, balances, Debt Lock), Super Admin "God Mode" with kill-switch and password override, dynamic pricing UI with 1/2/Full-Session toggle, bulk Excel onboarding, Digital Reports with passport, 5-star skills, principal signature & QR verification, contact-us routing to thecornerstreams@gmail.com, PWA / offline-first, plus CBT exams and student logins.

**Brand:** Deep Navy `#002147`, Vibrant Green `#28A745`, Electric Blue `#0056B3`. Visuals depict Nigerian/African students/teachers/parents.

**Founder:** Mervydean Hilary (6 years in the classroom).

---

## User Personas
- **Super Admin** — Corner Streams operator with global control (kill-switch, password override, leads, receipt verification, analytics).
- **School Admin** — principal/owner who registers a school, onboards students, pays for tier, monitors balances, configures subjects per class, provisions teacher/parent/student logins.
- **Teacher** — enters CA (30) + Exam (70) scores and 5-star skill ratings per term/year; creates and publishes CBT MCQ exams.
- **Parent** — views child's digital report card and fee balance; locked out by Debt Lock when `balance_due > 0`.
- **Student** — logs in with admin-provisioned credentials, sees class subjects, takes timed CBT exams, views own term and annual reports.

---

## Core Requirements (static)
- 5 roles with JWT custom auth, all backend routes `/api/*` prefixed, MongoDB string IDs (no ObjectId in JSON responses).
- Pricing tiers (NGN, hard-coded):
  - CBT Essentials   `40k / 70k / 110k` (1 Term / 2 Terms / Full Session)
  - Digital Reports  `50k / 90k / 140k`
  - Financial Ledger `40k / 70k / 110k`
  - Unified Enterprise `200k` (Full Session only)
- Stripe checkout (test, `sk_test_emergent`); NGN→USD at fixed 1500.
- Bank-transfer receipt upload + Super Admin verify queue.
- Digital report card: passport, CA(30)+Exam(70)→Total/Grade, 5-star skills, principal signature (script font), QR seal.
- Debt Lock: parent + student-only; blocks Result Checker if `balance_due > 0`.
- Kill-switch: blocks school-side login (school_admin/teacher/parent/student); Super Admin always allowed.
- CBT MCQ exams: 4 options, auto-graded; CBT score auto-fills the Exam (70-pt) column AND keeps a raw CBT log (`source: 'cbt'` in scores).
- Subjects scoped per class.
- Subdomain routing: `admin.cornerstreams.com` → Super Admin login.

---

## ✅ What's Implemented (as of Feb 10, 2026)

### Auth & Multi-tenant Foundation
- JWT auth (httpOnly cookie + Bearer header)
- 5 roles seeded by `db.py` on backend boot (idempotent)
- Multi-tenant `school_id` scoping on all routers
- Public registration creates **School Admins only**; teachers/parents/students are created from inside the School Admin dashboard

### School Admin Dashboard
- Tabs: Overview · Profile · Users · Students · Subjects · Subscription · Receipts (mobile horizontal-swipe)
- Setup checklist on Overview
- School Profile builder (logo, motto, address, phone, email, principal_name, founded_year, website)
- Users tab: create teachers/parents (assigned_class for teachers)
- Bulk Excel student upload
- Subjects tab: per-class subject management
- Subscription tab: live tier status + Stripe checkout
- Receipts tab: upload bank-transfer slips for Super Admin verification

### Teacher Dashboard
- Score entry (CA 30 + Exam 70 → Total/Grade) per term/year
- 5-star skill ratings (punctuality, neatness, leadership, sports, honesty, participation)
- CBT MCQ builder (4 options, timer, publish toggle)
- Recharts analytics on student averages

### Parent Portal
- View child's term report card (PDF with QR)
- View child's progression (Recharts line chart)
- Annual cumulative session report
- Debt Lock: blocks report view if `balance_due > 0`

### Student Dashboard
- View own subjects per class
- Take published CBT exams (timer + question palette, one-shot attempts)
- View own term + annual reports
- CBT post-submit review screen (correct vs. wrong colouring)
- Welcome Pack (print-ready A4)

### Super Admin "God Mode"
- Kill-switch (blocks school-side logins)
- Password override (reset any user's password)
- Lead pipeline (Contact Us submissions)
- Receipt verification queue
- Global analytics (Recharts)

### Landing Page (public)
- Hero: "Taking away the paper trap" with Nigerian classroom image
- Features grid (6 cards: Bulk Onboarding, Automated Engine, Debt Lock, QR PDFs, God Mode, Offline-First CBT)
- **Samples** section — 3 downloadable jsPDF previews:
  - Term Report Card (CA/Exam, position, 5-star skills, principal's remark, QR)
  - CBT Examination Script (auto-graded MCQs, candidate answers vs. keys, ledger sync)
  - Financial Statement (Stripe+Bank+Cash entries, inflow/outflow, net position, debtors)
- **About Us** — founder photo of Mervydean Hilary + founder story + 3 stat cards
- Pricing (3 tiers × 3 durations toggle)
- Testimonials (teacher, principal, parent)
- Contact form (saves leads to DB; live email-out NOT yet wired)
- Footer with WhatsApp + email

### Marketing / Polish
- BETA badge in Navbar (hidden on smallest screens)
- Favicon, apple-touch-icon, Open Graph meta tags (clean WhatsApp/Twitter previews)
- Mobile responsiveness pass (no horizontal overflow at 390px)
- PWA basics (`manifest.json` + `sw.js`)

---

## 📁 Code Architecture

```
/app/
├── backend/
│   ├── server.py              # FastAPI entry, mounts all routers under /api
│   ├── db.py                  # Motor + demo data seeding (idempotent)
│   ├── auth_utils.py          # JWT + require_roles dependency
│   └── routers/               # auth, users, schools, students, subjects,
│                              # scores, reports, payments, cbt, cbt_review,
│                              # analytics, leads, superadmin
├── frontend/
│   ├── public/                # manifest.json, sw.js, icons
│   └── src/
│       ├── pages/             # Landing, Login, Register, dashboards (5 roles),
│       │                      # CBTTake, CBTReview, ReportCard, AnnualReport,
│       │                      # WelcomePack, CheckoutReturn
│       ├── components/        # Navbar, Logo, Charts/*, PasswordInput, ui/ (shadcn)
│       └── lib/               # api.js, auth.jsx, useReveal.js, samplePdfs.js
└── memory/                    # PRD.md, test_credentials.md
```

---

## 🔜 Pending / Roadmap

### 🟡 P1 — Waiting on user keys / decisions
1. **Stripe → Paystack migration** — Stripe doesn't settle NGN, no Verve cards, no Nigerian bank transfers. Awaiting Paystack public + secret keys from `dashboard.paystack.com → Settings → API Keys`. User has not created Paystack account yet.
2. **WhatsApp Cloud API** — Send reports/receipts to parent phones. Needs Meta credentials: `WHATSAPP_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `BUSINESS_ACCOUNT_ID`, `VERIFY_TOKEN`.
3. **Live email-out for Contact Us** — currently saves to DB only. Recommended: Resend or SendGrid → routes to `thecornerstreams@gmail.com`.
4. **Full regression test** — testing_agent_v3_fork across all 5 dashboards before production deploy.

### 🟢 P2 / Backlog
- Twilio SMS / WhatsApp churn alerts for Super Admin
- Offline CBT cache (service worker + IndexedDB)
- True/False CBT question type (currently MCQ only)
- `school_type` field (primary / secondary / mixed) with auto-seeded class roster
- Audit log infrastructure (~10 event types) + Activity tab in School Admin dashboard
- Excel template download endpoints (students / teachers / cbt-questions)
- Bulk teacher upload endpoint + UI
- Per-student subject overrides (currently per-class only)
- Report card polish: teacher comments, head-teacher comments, class position, attendance, school logo on PDF
- Refactor `SchoolAdminDashboard.jsx` into per-tab components
- Multi-language (Yoruba / Hausa / Igbo)

---

## 🚫 Critical Rules (don't break)
- All backend routes MUST be `/api/*` prefixed (k8s ingress only routes /api → :8001)
- Frontend MUST use `process.env.REACT_APP_BACKEND_URL` (never hard-code)
- Backend MUST use `os.environ.get('MONGO_URL')` + `DB_NAME` (never hard-code)
- Always exclude `{"_id": 0}` from Mongo queries — never return ObjectId
- Use `datetime.now(timezone.utc)`, never `datetime.utcnow()`
- Multi-tenant isolation: every router must filter by `user.school_id`
- Public registration creates School Admins only
- All interactive elements need `data-testid` (kebab-case, descriptive)

---

## 🧪 Demo Accounts (auto-seeded by `db.py`)

| Role | Email | Password |
|---|---|---|
| Super Admin | `super@cornerstreams.com` | `Super@123` |
| School Admin | `admin@demo.school` | `Admin@123` |
| Teacher | `teacher@demo.school` | `Teacher@123` |
| Parent | `parent@demo.school` | `Parent@123` |
| Student | `adaeze@demo.school` | `Student@123` |

Verified working: all return HTTP 200 on `POST /api/auth/login` (Feb 10, 2026).
