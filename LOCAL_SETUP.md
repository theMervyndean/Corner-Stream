# Corner Streams — Local Development Setup

This guide gets Corner Streams running on your laptop (Windows / macOS / Linux) using VS Code.
You'll be able to register a school, log in as super admin, generate codes, and test the full flow.

> **Heads-up**: For testing with a real pilot school, your laptop must stay on and you'll need to expose it via Cloudflare Tunnel or ngrok (covered at the end). For production, deploy from Emergent instead.

---

## 0. Prerequisites — install these once

| Tool | Why | Download |
|---|---|---|
| **VS Code** | Editor | https://code.visualstudio.com |
| **Git** | Pull the code | https://git-scm.com/downloads |
| **Python 3.11+** | Backend runtime | https://www.python.org/downloads/ (✓ "Add to PATH") |
| **Node.js 18+** | Frontend runtime | https://nodejs.org (LTS version) |
| **Yarn** | JS package manager | After Node: `npm install -g yarn` |
| **MongoDB Community** | Database | https://www.mongodb.com/try/download/community |

**Alternative to local MongoDB:** create a **free MongoDB Atlas** cluster — gives you a cloud DB URL you paste into `.env`. https://www.mongodb.com/cloud/atlas/register

Recommended VS Code extensions: **Python** (Microsoft), **ESLint**, **Tailwind CSS IntelliSense**.

---

## 1. Clone the repo

Open a terminal in the folder you want the project in, then run:

```bash
git clone -b corner_streams https://github.com/theMervyndean/Corner-Stream.git
cd Corner-Stream
code .
```

The last command opens the project in VS Code.

---

## 2. Backend setup

Open a VS Code terminal (**Terminal → New Terminal**) and:

```bash
# Move into backend
cd backend

# Create a virtual environment
python3 -m venv venv

# Activate it
# macOS / Linux:
source venv/bin/activate
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows Command Prompt:
.\venv\Scripts\activate.bat

# Install dependencies (takes 2-3 min)
pip install -r requirements.txt
```

### Create `backend/.env`
1. In VS Code, copy `backend/.env.example` to `backend/.env`.
2. Generate a strong JWT secret — run this once and paste the output:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
3. Edit `backend/.env`:
   ```env
   MONGO_URL="mongodb://localhost:27017"
   DB_NAME="corner_streams"
   CORS_ORIGINS="http://localhost:3000"
   JWT_SECRET=PASTE_THE_GENERATED_SECRET_HERE
   ADMIN_EMAIL=super@cornerstreams.com
   ADMIN_PASSWORD=ChooseAStrongPasswordHere
   FRONTEND_URL=http://localhost:3000
   ```

> If using **MongoDB Atlas** instead of local: replace `MONGO_URL` with the Atlas connection string (looks like `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net`).

### Start the backend
Make sure MongoDB is running (Windows: it's usually a service; macOS: `brew services start mongodb-community`).

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

You should see:
```
Indexes ensured & demo data seeded
Application startup complete.
Uvicorn running on http://0.0.0.0:8001
```

Test it: open `http://localhost:8001/api/health` in your browser → should show `{"status":"healthy"}`.

---

## 3. Frontend setup

Open a **second** VS Code terminal (keep the backend one running):

```bash
cd frontend
yarn install   # takes 1-2 min
```

### Create `frontend/.env`
1. Copy `frontend/.env.example` → `frontend/.env`
2. Make sure it contains:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8001
   WDS_SOCKET_PORT=3000
   ENABLE_HEALTH_CHECK=false
   ```

### Start the frontend
```bash
yarn start
```
It should open `http://localhost:3000` automatically. You'll see the Corner Streams landing page.

---

## 4. Sign in & verify

Open `http://localhost:3000` → click **Sign in** → use one of these (seeded automatically on first backend boot):

| Role | Email | Password |
|---|---|---|
| Super Admin | super@cornerstreams.com | (whatever you set in `ADMIN_PASSWORD`) |
| School Admin | admin@demo.school | Admin@123 |
| Teacher | teacher@demo.school | Teacher@123 |
| Parent | parent@demo.school | Parent@123 |
| Student | adaeze@demo.school | Student@123 |

If they all log in, you're ready to onboard a real pilot school.

---

## 5. Run the 4-test sequence with a real school

See the test sequence I sent earlier (new school → new parent → new teacher → new student). Repeat with the **real school's actual data** instead of test values.

### Persisting your data
All school data lives in MongoDB. **Don't delete the `corner_streams` database** in MongoDB Compass between sessions — that would wipe the school. If you change machines, dump and restore the DB:

```bash
# Backup (one command, from anywhere)
mongodump --uri="mongodb://localhost:27017" --db=corner_streams --out=./backup-$(date +%Y%m%d)

# Restore on a new machine
mongorestore --uri="mongodb://localhost:27017" ./backup-20260513/corner_streams
```

---

## 6. Expose to the internet (so a real school can use it)

Two free options. Pick one.

### Option A — Cloudflare Tunnel (recommended; no signup hassle)
```bash
# Install once (macOS: `brew install cloudflared`, Windows: download from cloudflare)
cloudflared tunnel --url http://localhost:3000
```
Cloudflare prints a URL like `https://abc-xyz.trycloudflare.com`. Share that with the school. **Important:** the URL changes every restart — for a stable URL, set up a named tunnel (5-min Cloudflare account flow).

You also need to expose the **backend**:
```bash
cloudflared tunnel --url http://localhost:8001
```
Take that URL and put it in `frontend/.env` as `REACT_APP_BACKEND_URL`, then restart `yarn start`. Otherwise the frontend will try to reach `http://localhost:8001` from the school's phone and fail.

### Option B — ngrok
```bash
ngrok http 3000   # for frontend
ngrok http 8001   # in another terminal for backend
```
Same idea — update `REACT_APP_BACKEND_URL` to the ngrok backend URL.

---

## 7. Keep code in sync with GitHub

Every time you make a local change you want to save:

```bash
git add .
git commit -m "Describe the change in one line"
git push origin corner_streams
```

To pull changes I push from Emergent:
```bash
git pull origin corner_streams
```

If you change `requirements.txt` or `package.json`, re-run `pip install -r requirements.txt` or `yarn install`.

---

## 8. Common pitfalls

| Symptom | Fix |
|---|---|
| `MongoDB connection refused` | Start MongoDB. Windows: Services → "MongoDB". macOS: `brew services start mongodb-community` |
| Backend says `KeyError: 'JWT_SECRET'` | You skipped Step 2's `.env` creation. Backend will not boot without it. |
| Frontend shows network errors in console | `REACT_APP_BACKEND_URL` in `frontend/.env` doesn't match where backend is running. Restart `yarn start` after editing. |
| Login fails for super admin | The first-boot seed already created super admin with the password you set in `.env`. If you change `ADMIN_PASSWORD` later, the seed re-applies it on next backend restart. |
| Frontend won't open at all | Make sure port 3000 isn't taken. `lsof -ti:3000 \| xargs kill` (mac/linux) or `netstat -ano \| findstr :3000` (windows) |
| Tailwind classes don't apply after edit | Stop & restart `yarn start` |

---

## 9. Production deploy

Don't run a real production school off your laptop. When you're ready:
- Easiest: **deploy this Emergent project** — gives you a `*.emergent.host` URL with SSL, runs 24/7. Just tell me "deploy" in the Emergent chat.
- Or: push the GitHub repo to **Render / Railway / Fly.io**. I can walk you through it when you're ready.
