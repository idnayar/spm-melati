from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ['JWT_SECRET']
NOID = {"_id": 0}
WIB = timezone(timedelta(hours=7))
MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
          "Agustus", "September", "Oktober", "November", "Desember"]
STATUS_LABEL = {"draf": "Draf", "diajukan": "Diajukan", "perlu_perbaikan": "Perlu perbaikan", "disetujui": "Disetujui"}
ROLE_LABEL = {"admin": "Admin", "pj": "PJ", "kepala": "Kepala Puskesmas"}


def now():
    return datetime.now(timezone.utc)


def now_iso():
    return now().isoformat()


def new_id():
    return uuid.uuid4().hex


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def create_token(uid: str) -> str:
    return jwt.encode({"sub": uid, "type": "access", "exp": now() + timedelta(hours=12)}, JWT_SECRET, algorithm="HS256")


async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Belum masuk")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesi berakhir, silakan masuk kembali")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "Pengguna tidak ditemukan")
    return user


def require(*roles):
    async def dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Akses ditolak untuk peran Anda")
        return user
    return dep


async def log_activity(user, action, entity, entity_id=None, detail=""):
    await db.activity_logs.insert_one({
        "id": new_id(), "user_id": user["id"] if user else None,
        "user_name": user["name"] if user else "Sistem", "action": action,
        "entity": entity, "entity_id": entity_id, "detail": detail, "created_at": now_iso()})


async def notify(user_id, title, message, link="", kind="info"):
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "title": title, "message": message,
        "link": link, "kind": kind, "read": False, "created_at": now_iso()})


async def notify_role(role, title, message, link="", kind="info"):
    async for u in db.users.find({"role": role, "active": {"$ne": False}}, {"id": 1, "_id": 0}):
        await notify(u["id"], title, message, link, kind)


async def get_program(pid):
    p = await db.programs.find_one({"id": pid}, NOID)
    if not p:
        raise HTTPException(404, "SPM/Program tidak ditemukan")
    return p


def can_edit_program(user, program) -> bool:
    return user["role"] == "admin" or (user["role"] == "pj" and program.get("pj_user_id") == user["id"])


async def get_settings():
    s = await db.settings.find_one({"key": "reminder"}, NOID)
    if not s:
        s = {"key": "reminder", "deadline_day": 5, "days_before": 3, "email_enabled": False,
             "send_hour": 8, "late_days": [1, 3, 7], "end_of_month": True}
        await db.settings.insert_one(dict(s))
    return s
