"""Corner Streams — main FastAPI app."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os  # noqa: E402
import logging  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI, APIRouter, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from db import ensure_indexes, seed_demo_data, get_client  # noqa: E402
from routers.auth import router as auth_router  # noqa: E402
from routers.schools import router as schools_router  # noqa: E402
from routers.students import router as students_router  # noqa: E402
from routers.scores import router as scores_router  # noqa: E402
from routers.reports import router as reports_router  # noqa: E402
from routers.leads import router as leads_router  # noqa: E402
from routers.payments import router as payments_router  # noqa: E402
from routers.superadmin import router as superadmin_router  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("cornerstreams")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await ensure_indexes()
        await seed_demo_data()
        logger.info("Indexes ensured & demo data seeded")
    except Exception as e:
        logger.exception("Startup error: %s", e)
    yield
    get_client().close()


app = FastAPI(title="Corner Streams API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"app": "Corner Streams", "tagline": "Taking away the paper trap.", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


# Stripe webhook (under /api/webhook/stripe)
@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    from db import get_db, now_iso
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        sc = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url="")
        evt = await sc.handle_webhook(body, sig)
    except Exception as e:
        logger.warning("Webhook verification failed: %s", e)
        return JSONResponse({"received": False}, status_code=400)
    db = get_db()
    if evt.session_id:
        await db.payment_transactions.update_one(
            {"session_id": evt.session_id},
            {"$set": {"payment_status": evt.payment_status, "updated_at": now_iso()}},
        )
    return {"received": True}


api_router.include_router(auth_router)
api_router.include_router(schools_router)
api_router.include_router(students_router)
api_router.include_router(scores_router)
api_router.include_router(reports_router)
api_router.include_router(leads_router)
api_router.include_router(payments_router)
api_router.include_router(superadmin_router)

from routers.subjects import router as subjects_router  # noqa: E402
from routers.cbt import router as cbt_router  # noqa: E402
from routers.users import router as users_router  # noqa: E402
api_router.include_router(subjects_router)
api_router.include_router(cbt_router)
api_router.include_router(users_router)

app.include_router(api_router)

# CORS — allow frontend origin with credentials
_frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000")
_origins = [_frontend, "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
