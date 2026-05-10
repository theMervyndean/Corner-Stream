"""Schools router — school info and subscription status."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_db, now_iso
from auth_utils import get_current_user, require_roles

router = APIRouter(prefix="/schools", tags=["schools"])


class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    principal_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    motto: Optional[str] = None
    logo_url: Optional[str] = None
    founded_year: Optional[str] = None
    website: Optional[str] = None


@router.get("/me")
async def my_school(user: dict = Depends(get_current_user)):
    if not user.get("school_id"):
        raise HTTPException(status_code=404, detail="No school associated")
    db = get_db()
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    return {"school": school}


@router.put("/me")
async def update_my_school(payload: SchoolUpdate, user: dict = Depends(require_roles("school_admin"))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.schools.update_one({"id": user["school_id"]}, {"$set": update})
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    return {"school": school}
