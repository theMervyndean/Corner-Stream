# Test Credentials — Corner Streams

Demo accounts are seeded automatically by `backend/db.py::seed_demo_data()` on every startup.
The demo passwords are also rewritten on every startup so manual resets do not drift.

| Role         | Email                      | Password    |
|--------------|----------------------------|-------------|
| Super Admin  | super@cornerstreams.com    | Super@123   |
| School Admin | admin@demo.school          | Admin@123   |
| Teacher      | teacher@demo.school        | Teacher@123 |
| Parent       | parent@demo.school         | Parent@123  |
| Student      | adaeze@demo.school         | Student@123 |

Super admin credentials come from `backend/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
