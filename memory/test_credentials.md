# Corner Streams — Test Credentials

These accounts are seeded automatically on backend startup.

## Super Admin (God Mode)
- Email: `super@cornerstreams.com` / `Super@123`

## School Admin (Sunrise Academy)
- Email: `admin@demo.school` / `Admin@123`
- Note: this is the "Sunrise Academy" demo school. Students/teachers/parents below are linked to it.

## Teacher
- Email: `teacher@demo.school` / `Teacher@123`
- assigned_class: `JSS 1`

## Parent
- Email: `parent@demo.school` / `Parent@123`
- Children: `Adaeze Okafor` (no debt) + `Emeka Nwosu` (₦25,000 due — Debt Lock)

## Student
- Email: `adaeze@demo.school` / `Student@123`
- class: `JSS 1`
- Has access to seeded JSS 1 Mathematics CBT (5 questions, 15 min, published).

## Phase-3 endpoints
- `POST /api/auth/register` — public; SCHOOL ADMIN ONLY (school_name + principal_name + school_address + school_phone + admin name/email/password).
- `POST /api/users` — school admin creates teachers/parents (role: 'teacher'|'parent', optional assigned_class).
- `GET /api/users?role=...` — list teachers/parents/students for the school.
- `DELETE /api/users/{id}` — school admin removes teacher/parent/student (cannot self-delete).
- `PUT /api/schools/me` — accepts name, principal_name, address, phone, email, motto, logo_url, founded_year, website.
- `GET /api/reports/annual/{student_id}?year=2025/2026` — cumulative 3-term session report with session promotion + QR.

## Subdomain admin entry
- `https://admin.cornerstreams.com` (when deployed) routes directly to super-admin login. Otherwise `/admin` redirects to `/login?admin=1`.
