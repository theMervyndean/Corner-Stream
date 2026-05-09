# Corner Streams — Product Requirements Document

## Original problem statement
Corner Streams is a SaaS for Nigerian schools — "Taking away the paper trap." Cloud DB for Student Bio, Academic Engine (CA + Exam, 100-pt), Financial Ledger (Stripe + bank transfers, balances, Debt Lock), Super Admin "God Mode" with kill-switch and password override, dynamic pricing UI with 1/2/3 Term toggle, bulk Excel onboarding, Digital Reports with passport, 5-star skills, principal signature & QR verification, contact-us routing to thecornerstreams@gmail.com, PWA / offline-first.

Brand: Deep Navy #002147, Vibrant Green #28A745, Electric Blue #0056B3. Visuals must depict Nigerian/African students/teachers/parents.

## User personas
- **Super Admin** — Corner Streams operator with global control (kill-switch, password override, leads, receipt verification).
- **School Admin** — principal/owner who registers a school, onboards students, pays for tier, monitors balances.
- **Teacher** — enters CA + Exam scores and 5-star skill ratings per term/year.
- **Parent** — views child's digital report card and fee balance; locked out by Debt Lock when balance > 0.

## Core requirements (static)
- 4 roles with JWT custom auth, all routes /api prefixed, MongoDB string IDs (no ObjectId in responses).
- Pricing tiers (NGN): CBT Essentials 40k/70k/110k · Digital Reports 50k/90k/140k · Financial Ledger 40k/70k/110k · Unified Enterprise (Full Session only, 200k).
- Stripe checkout (test, sk_test_emergent), NGN→USD at fixed 1500. Bank-transfer receipt upload + super-admin verify queue.
- Digital report card: passport, CA(40)+Exam(60)→Total/Grade, skill ratings, principal signature (script font), QR code.
- Debt Lock: parent-only; blocks Result Checker if balance_due > 0.
- Kill-switch: blocks school-side login (3 roles) but allows super_admin.

## Phase-1 implemented (Feb 2026)
- ✅ Backend FastAPI with modular routers (auth, schools, students, scores, reports, leads, payments, superadmin, /api/webhook/stripe).
- ✅ MongoDB indexes + idempotent demo-data seeding (Sunrise Academy + 4 students, 1 with debt).
- ✅ JWT auth (httpOnly cookie + Bearer header support).
- ✅ Bulk Excel upload (.xlsx via openpyxl, columns: name, age, gender, class_name, parent_email, balance_due).
- ✅ Score & skill batch upserts; auto grade A–F from total.
- ✅ Digital Report Card endpoint with QR code (data URL) + Debt Lock branch.
- ✅ Stripe checkout via emergentintegrations + bypass for library metadata bug (direct stripe SDK fallback).
- ✅ Bank receipt upload + super-admin approve/reject; auto-activates subscription on approval.
- ✅ Super Admin: kill-switch toggle, password override, leads list/resolve, global stats.
- ✅ React frontend with Outfit + IBM Plex Sans typography, Caveat for principal signature.
- ✅ Landing page (hero, features, pricing toggle 1T/2T/Full, testimonials, contact form).
- ✅ Login / Register (school_admin → creates school; teacher/parent → picks existing).
- ✅ School Admin Dashboard: students CRUD + .xlsx upload, subscription tab (Stripe + bank receipt), receipts queue.
- ✅ Teacher Dashboard: roster, term/year picker, CA/Exam table, 5-star skill ratings.
- ✅ Parent Portal: children cards with debt-lock banner, Result Checker button.
- ✅ Report Card page: print-ready, QR, principal script signature.
- ✅ Super Admin Console: schools table with kill-switch Switch, receipts approve/reject, leads, password override dialog.
- ✅ Checkout return page with status polling (8 attempts) + subscription auto-activation on paid.
- ✅ All 30/30 backend pytest tests passing.

## Demo accounts (seeded)
| Role | Email | Password |
|---|---|---|
| Super admin | super@cornerstreams.com | Super@123 |
| School admin | admin@demo.school | Admin@123 |
| Teacher | teacher@demo.school | Teacher@123 |
| Parent | parent@demo.school | Parent@123 |

## Backlog (P0/P1/P2)

### P0 — important next-up
- Live email-out for Contact Us form → thecornerstreams@gmail.com (Resend or SendGrid).
- Passport photo upload for students (currently empty placeholder).
- Real PWA manifest + service worker for offline shell.

### P1 — significant features
- CBT Essentials engine (full computer-based test taking with offline cache).
- Per-class promotion logic at end of session (3rd Term aggregate).
- Multi-school / multi-admin roles per school.
- Stripe webhook secret verification + production NGN multi-currency support.
- Annual session report (combined 1st/2nd/3rd term) + cumulative average.

### P2 — nice-to-have
- Per-student notes / teacher comments on reports.
- Subscription auto-renewal reminders.
- Email/SMS notifications when balance is cleared (auto-Debt-Lock release).
- Mobile-app-style installable PWA polish.
- Audit log of super-admin actions.
