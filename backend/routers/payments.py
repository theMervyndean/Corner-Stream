"""Payments router — Stripe checkout + bank-transfer receipt upload."""
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)
from db import get_db, new_id, now_iso
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/payments", tags=["payments"])

# Server-defined pricing (NGN). Charged in USD using fixed conversion for test.
PRICING_NGN = {
    "cbt_essentials": {"1_term": 40000, "2_terms": 70000, "full_session": 110000},
    "digital_reports": {"1_term": 50000, "2_terms": 90000, "full_session": 140000},
    "financial_ledger": {"1_term": 40000, "2_terms": 70000, "full_session": 110000},
    "unified_enterprise": {"full_session": 200000},
}
NGN_PER_USD = 1500  # fixed test conversion


def _amount_usd(tier: str, duration: str) -> float:
    if tier not in PRICING_NGN:
        raise HTTPException(status_code=400, detail=f"Unknown tier: {tier}")
    if duration not in PRICING_NGN[tier]:
        raise HTTPException(status_code=400, detail=f"Invalid duration for tier {tier}")
    ngn = PRICING_NGN[tier][duration]
    return round(ngn / NGN_PER_USD, 2)


def _duration_days(duration: str) -> int:
    return {"1_term": 90, "2_terms": 180, "full_session": 270}.get(duration, 90)


class CheckoutInit(BaseModel):
    tier: str
    duration: str
    origin_url: str


@router.get("/pricing")
async def get_pricing():
    return {"pricing_ngn": PRICING_NGN, "ngn_per_usd": NGN_PER_USD}


@router.post("/checkout")
async def create_checkout(payload: CheckoutInit, http_request: Request, user: dict = Depends(require_roles("school_admin"))):
    amount_usd = _amount_usd(payload.tier, payload.duration)
    api_key = os.environ["STRIPE_API_KEY"]
    host_url = str(http_request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

    success_url = f"{payload.origin_url.rstrip('/')}/checkout/return?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{payload.origin_url.rstrip('/')}/dashboard/school"
    metadata = {
        "tier": payload.tier,
        "duration": payload.duration,
        "school_id": user.get("school_id") or "",
        "user_id": user["id"],
        "user_email": user["email"],
    }
    req = CheckoutSessionRequest(
        amount=amount_usd, currency="usd",
        success_url=success_url, cancel_url=cancel_url, metadata=metadata,
    )
    session = await stripe_checkout.create_checkout_session(req)

    db = get_db()
    await db.payment_transactions.insert_one({
        "id": new_id(),
        "session_id": session.session_id,
        "amount": amount_usd,
        "currency": "usd",
        "metadata": metadata,
        "payment_status": "initiated",
        "status": "open",
        "school_id": user.get("school_id"),
        "tier": payload.tier,
        "duration": payload.duration,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id, "amount_usd": amount_usd}


@router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    api_key = os.environ["STRIPE_API_KEY"]
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    status = await stripe_checkout.get_checkout_status(session_id)

    update = {
        "status": status.status,
        "payment_status": status.payment_status,
        "updated_at": now_iso(),
    }
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})

    # If paid AND not yet applied, activate subscription
    if status.payment_status == "paid" and not txn.get("applied"):
        meta = txn.get("metadata", {})
        school_id = meta.get("school_id")
        tier = meta.get("tier")
        duration = meta.get("duration")
        if school_id:
            expires = (datetime.now(timezone.utc) + timedelta(days=_duration_days(duration))).isoformat()
            await db.schools.update_one({"id": school_id}, {"$set": {
                "subscription_tier": tier,
                "subscription_duration": duration,
                "subscription_expires_at": expires,
                "kill_switch": False,
            }})
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"applied": True}})

    return {
        "session_id": session_id,
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


class BankReceiptIn(BaseModel):
    tier: str
    duration: str
    amount_ngn: float
    file_data_url: str
    note: Optional[str] = ""


@router.post("/bank-receipt")
async def upload_bank_receipt(payload: BankReceiptIn, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    doc = {
        "id": new_id(),
        "school_id": user["school_id"],
        "submitted_by": user["email"],
        "tier": payload.tier,
        "duration": payload.duration,
        "amount_ngn": payload.amount_ngn,
        "file_data_url": payload.file_data_url,
        "note": payload.note or "",
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.bank_receipts.insert_one(doc)
    doc.pop("_id", None)
    # Don't return huge data URL in list responses; keep here for confirmation
    return {"receipt": {k: v for k, v in doc.items() if k != "file_data_url"}}


@router.get("/bank-receipts")
async def list_bank_receipts(user: dict = Depends(get_current_user)):
    db = get_db()
    if user["role"] == "super_admin":
        q = {}
    elif user["role"] == "school_admin":
        q = {"school_id": user["school_id"]}
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    receipts = await db.bank_receipts.find(q, {"_id": 0, "file_data_url": 0}).sort("created_at", -1).to_list(500)
    return {"receipts": receipts}


@router.get("/bank-receipts/{receipt_id}")
async def get_bank_receipt(receipt_id: str, user: dict = Depends(require_roles("super_admin", "school_admin"))):
    db = get_db()
    q = {"id": receipt_id}
    if user["role"] == "school_admin":
        q["school_id"] = user["school_id"]
    receipt = await db.bank_receipts.find_one(q, {"_id": 0})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return {"receipt": receipt}


class ReceiptDecision(BaseModel):
    decision: str  # "approve" or "reject"
    note: Optional[str] = ""


@router.post("/bank-receipts/{receipt_id}/decision")
async def decide_receipt(receipt_id: str, payload: ReceiptDecision, user: dict = Depends(require_roles("super_admin"))):
    if payload.decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve|reject")
    db = get_db()
    receipt = await db.bank_receipts.find_one({"id": receipt_id})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    new_status = "approved" if payload.decision == "approve" else "rejected"
    await db.bank_receipts.update_one({"id": receipt_id}, {"$set": {
        "status": new_status,
        "decided_by": user["email"],
        "decision_note": payload.note,
        "updated_at": now_iso(),
    }})
    if new_status == "approved":
        expires = (datetime.now(timezone.utc) + timedelta(days=_duration_days(receipt["duration"]))).isoformat()
        await db.schools.update_one({"id": receipt["school_id"]}, {"$set": {
            "subscription_tier": receipt["tier"],
            "subscription_duration": receipt["duration"],
            "subscription_expires_at": expires,
            "kill_switch": False,
        }})
    return {"ok": True, "status": new_status}
