import os
import io
import hmac
import logging
import calendar
from typing import List, Optional, Any
from datetime import timedelta
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core import (db, MONTHS, WIB, STATUS_LABEL, now, now_iso, new_id, hash_password, verify_password,
                  create_token, get_current_user, require, log_activity, notify, notify_role, get_program,
                  can_edit_program, get_settings)
from recap import (unit_label, REPORTED, aggregate, by_month_for, build_dataset, completeness, deadline_for, load_reports,
                   period_label, period_months, programs_with_indicators)
import ai
import exports
from emailer import send_email, email_configured, reminder_html
from seed import seed_all

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
app = FastAPI(title="MELATI Program Hub")
api = APIRouter(prefix="/api")
NARR_KEYS = ["kendala", "upaya", "hasil_upaya", "rtl", "dukungan"]


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else ''}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident}, {"_id": 0})
    if att and att.get("count", 0) >= 5 and att.get("until") and att["until"] > now_iso():
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]) or not user.get("active", True):
        cnt = (att or {}).get("count", 0) + 1
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {
            "count": cnt, "until": (now() + timedelta(minutes=15)).isoformat()}}, upsert=True)
        raise HTTPException(401, "Email atau kata sandi salah")
    await db.login_attempts.delete_one({"identifier": ident})
    token = create_token(user["id"])
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    user.pop("password_hash", None)
    await log_activity(user, "masuk", "auth")
    return {"user": user, "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


class PwIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


@api.post("/auth/change-password")
async def change_password(body: PwIn, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.old_password, full["password_hash"]):
        raise HTTPException(400, "Kata sandi lama salah")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_activity(user, "ubah kata sandi", "pengguna", user["id"])
    return {"ok": True}


# ---------- Users ----------
class UserIn(BaseModel):
    name: str
    email: str
    role: str = Field(pattern="^(admin|pj|kepala)$")
    password: Optional[str] = None
    active: bool = True


@api.get("/users")
async def list_users(user=Depends(get_current_user)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)


@api.post("/users")
async def create_user(body: UserIn, user=Depends(require("admin"))):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email sudah terdaftar")
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Kata sandi minimal 6 karakter")
    doc = {"id": new_id(), "name": body.name, "email": email, "role": body.role, "active": body.active,
           "password_hash": hash_password(body.password), "created_at": now_iso()}
    await db.users.insert_one(doc)
    await log_activity(user, "tambah pengguna", "pengguna", doc["id"], f"{body.name} ({body.role})")
    return {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}


@api.put("/users/{uid}")
async def update_user(uid: str, body: UserIn, user=Depends(require("admin"))):
    upd = {"name": body.name, "email": body.email.strip().lower(), "role": body.role, "active": body.active}
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    await db.users.update_one({"id": uid}, {"$set": upd})
    await log_activity(user, "ubah pengguna", "pengguna", uid, body.name)
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@api.delete("/users/{uid}")
async def delete_user(uid: str, user=Depends(require("admin"))):
    if uid == user["id"]:
        raise HTTPException(400, "Tidak dapat menghapus akun sendiri")
    await db.users.delete_one({"id": uid})
    await log_activity(user, "hapus pengguna", "pengguna", uid)
    return {"ok": True}


# ---------- Programs & indicators ----------
class ProgramIn(BaseModel):
    name: str
    code: str = ""
    description: str = ""
    pj_user_id: Optional[str] = None
    labels: List[str] = []
    profile: List[dict] = []
    kind: str = Field("program", pattern="^(spm|program)$")


class IndicatorIn(BaseModel):
    name: str
    unit: str = ""
    target: Optional[float] = None
    sasaran: Optional[float] = None
    method: str = Field("kumulatif", pattern="^(kumulatif|rasio|terakhir)$")
    definition: str = ""
    order: int = 0


@api.get("/programs")
async def list_programs(kind: Optional[str] = None, user=Depends(get_current_user)):
    return await programs_with_indicators(None, kind)


async def editable_program(pid, user):
    p = await get_program(pid)
    if not can_edit_program(user, p):
        raise HTTPException(403, "Hanya admin atau PJ yang bersangkutan yang dapat mengubah")
    return p


def clean_program(body: ProgramIn, user, current=None):
    d = body.model_dump()
    d["labels"] = sorted({x.strip() for x in d["labels"] if x and x.strip()})
    d["profile"] = [{"label": str(x.get("label", "")).strip(), "value": str(x.get("value", ""))}
                    for x in d["profile"] if str(x.get("label", "")).strip()]
    if user["role"] == "pj":
        d["pj_user_id"] = current.get("pj_user_id") if current else user["id"]
    return d


@api.post("/programs")
async def create_program(body: ProgramIn, user=Depends(require("admin", "pj"))):
    doc = {"id": new_id(), **clean_program(body, user), "created_at": now_iso()}
    await db.programs.insert_one(doc)
    await log_activity(user, "tambah SPM", "program", doc["id"], body.name)
    doc.pop("_id", None)
    return doc


@api.put("/programs/{pid}")
async def update_program(pid: str, body: ProgramIn, user=Depends(get_current_user)):
    p = await editable_program(pid, user)
    await db.programs.update_one({"id": pid}, {"$set": {**clean_program(body, user, p), "updated_at": now_iso()}})
    await log_activity(user, "ubah profil SPM", "program", pid, body.name)
    return await get_program(pid)


@api.delete("/programs/{pid}")
async def delete_program(pid: str, user=Depends(get_current_user)):
    p = await editable_program(pid, user)
    await db.programs.delete_one({"id": pid})
    await db.indicators.delete_many({"program_id": pid})
    await log_activity(user, "hapus SPM", "program", pid, p["name"])
    return {"ok": True}


async def indicator_program(iid, user):
    ind = await db.indicators.find_one({"id": iid}, {"_id": 0})
    if not ind:
        raise HTTPException(404, "Program tidak ditemukan")
    await editable_program(ind["program_id"], user)
    return ind


@api.post("/programs/{pid}/indicators")
async def add_indicator(pid: str, body: IndicatorIn, user=Depends(get_current_user)):
    await editable_program(pid, user)
    doc = {"id": new_id(), "program_id": pid, **body.model_dump(), "created_at": now_iso()}
    await db.indicators.insert_one(doc)
    await log_activity(user, "tambah program", "indikator", doc["id"], body.name)
    doc.pop("_id", None)
    return doc


@api.put("/indicators/{iid}")
async def update_indicator(iid: str, body: IndicatorIn, user=Depends(get_current_user)):
    await indicator_program(iid, user)
    await db.indicators.update_one({"id": iid}, {"$set": body.model_dump()})
    await log_activity(user, "ubah program", "indikator", iid, body.name)
    return await db.indicators.find_one({"id": iid}, {"_id": 0})


@api.delete("/indicators/{iid}")
async def delete_indicator(iid: str, user=Depends(get_current_user)):
    ind = await indicator_program(iid, user)
    await db.indicators.delete_one({"id": iid})
    await log_activity(user, "hapus program", "indikator", iid, ind["name"])
    return {"ok": True}


# ---------- Dashboard ----------
async def scope_programs(user, program_id=None):
    """PJ: list of own SPM ids (403 if requesting another SPM); others: None."""
    if user["role"] != "pj":
        return None
    own = [p["id"] async for p in db.programs.find({"pj_user_id": user["id"]}, {"id": 1, "_id": 0})]
    if program_id and program_id not in own:
        raise HTTPException(403, "PJ hanya dapat melihat data SPM/program miliknya sendiri")
    return own


@api.get("/dashboard")
async def dashboard(year: int, period: str = "bulanan", month: int = 1, quarter: int = 1,
                    program_id: Optional[str] = None, kind: Optional[str] = None, user=Depends(get_current_user)):
    own = await scope_programs(user, program_id)
    ds = await build_dataset(year, period, month, quarter, program_id, kind=kind)
    if own is not None:
        ds["programs"] = [p for p in ds["programs"] if p["id"] in own]
    settings = await get_settings()
    comp = await completeness(year, ds["months"], settings, [program_id] if program_id else own, kind)
    inds = [i for p in ds["programs"] for i in p["indicators"]]
    st = [i["recap"]["status"] for i in inds]
    pers = [i["recap"]["persen"] for i in inds if i["recap"]["persen"] is not None]
    pids = [p["id"] for p in ds["programs"]]
    reports = await load_reports(year, pids, REPORTED)
    prev_reports = await load_reports(year - 1, pids, REPORTED)
    all_reports = await load_reports(year, pids)
    prev_months = ds["months"]

    def avg(vals):
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    trend, yoy = [], []
    for m in range(1, 13):
        row = {"bulan": MONTHS[m - 1][:3], "month": m}
        cur_all, prev_all = [], []
        for p in ds["programs"]:
            vals = [aggregate(i, by_month_for(p["id"], i["id"], reports), [m])["persen"] for i in p["indicators"]]
            pvals = [aggregate(i, by_month_for(p["id"], i["id"], prev_reports), [m])["persen"] for i in p["indicators"]]
            row[p["name"]] = avg(vals)
            cur_all += vals
            prev_all += pvals
        trend.append(row)
        yoy.append({"bulan": row["bulan"], "tahun_ini": avg(cur_all), "tahun_lalu": avg(prev_all)})
    spm = []
    for p in ds["programs"]:
        for i in p["indicators"]:
            i["recap_prev"] = aggregate(i, by_month_for(p["id"], i["id"], prev_reports), prev_months)
            a, b = i["recap"]["persen"], i["recap_prev"]["persen"]
            i["selisih"] = round(a - b, 2) if a is not None and b is not None else None
        sts = [i["recap"]["status"] for i in p["indicators"]]
        p["ringkasan"] = {"rata_persen": avg([i["recap"]["persen"] for i in p["indicators"]]),
                          "rata_persen_lalu": avg([i["recap_prev"]["persen"] for i in p["indicators"]]),
                          "tercapai": sts.count("tercapai"), "total": len(sts),
                          "belum_tersedia": sts.count("belum_tersedia")}
        p["status_bulanan"] = [all_reports[(p["id"], m)]["status"] if (p["id"], m) in all_reports else None for m in range(1, 13)]
        spm.append({"nama": p["name"], "tahun_ini": p["ringkasan"]["rata_persen"], "tahun_lalu": p["ringkasan"]["rata_persen_lalu"]})
    prev_pers = [i["recap_prev"]["persen"] for i in inds if i["recap_prev"]["persen"] is not None]
    dist = {k: st.count(k) for k in ["tercapai", "belum_tercapai", "sasaran_kosong", "target_kosong", "belum_tersedia"]}
    return {"periode": ds["periode"], "periode_lalu": period_label(period, year - 1, month, quarter),
            "programs": ds["programs"], "completeness": comp, "trend": trend, "yoy_trend": yoy, "yoy_spm": spm,
            "distribusi": dist,
            "summary": {"indikator": len(inds), "tercapai": st.count("tercapai"),
                        "belum_tercapai": st.count("belum_tercapai"), "belum_tersedia": st.count("belum_tersedia"),
                        "rata_persen": round(sum(pers) / len(pers), 1) if pers else None,
                        "rata_persen_lalu": round(sum(prev_pers) / len(prev_pers), 1) if prev_pers else None}}


# ---------- Reports ----------
class ReportCreate(BaseModel):
    program_id: str
    year: int
    month: int = Field(ge=1, le=12)


class ReportItem(BaseModel):
    indicator_id: str
    sasaran: Optional[float] = None
    target: Optional[float] = None
    capaian: Optional[float] = None
    keterangan: str = ""


class ReportUpdate(BaseModel):
    items: List[ReportItem] = []
    kendala: str = ""
    upaya: str = ""
    hasil_upaya: str = ""
    rtl: str = ""
    dukungan: str = ""
    autosave: bool = False
    note: str = ""


def snapshot(r):
    return {"items": r.get("items", []), **{k: r.get(k, "") for k in NARR_KEYS}}


async def add_revision(r, user, note):
    cnt = await db.report_revisions.count_documents({"report_id": r["id"]})
    await db.report_revisions.insert_one({"id": new_id(), "report_id": r["id"], "version": cnt + 1,
                                          "status": r["status"], "snapshot": snapshot(r), "user_name": user["name"],
                                          "note": note, "created_at": now_iso()})


async def get_report(rid):
    r = await db.reports.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Laporan tidak ditemukan")
    return r


@api.get("/reports")
async def list_reports(year: Optional[int] = None, month: Optional[int] = None, program_id: Optional[str] = None,
                       status: Optional[str] = None, kind: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if kind:
        kq = {"kind": kind} if kind == "spm" else {"kind": {"$ne": "spm"}}
        q["program_id"] = {"$in": [p["id"] async for p in db.programs.find(kq, {"id": 1, "_id": 0})]}
    if year:
        q["year"] = year
    if month:
        q["month"] = month
    if program_id:
        q["program_id"] = program_id
    if status:
        q["status"] = status
    if user["role"] == "pj":
        mine = [p["id"] async for p in db.programs.find({"pj_user_id": user["id"]}, {"id": 1, "_id": 0})]
        if "program_id" in q:
            mine = [m for m in mine if m in q["program_id"]["$in"]]
        q["program_id"] = {"$in": mine} if not program_id else (program_id if program_id in mine else "__none__")
    rows = await db.reports.find(q, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(1000)
    progs = {p["id"]: p["name"] async for p in db.programs.find({}, {"_id": 0, "id": 1, "name": 1})}
    for r in rows:
        r["program_name"] = progs.get(r["program_id"], "-")
        r.pop("items", None)
    return rows


@api.post("/reports")
async def create_report(body: ReportCreate, user=Depends(get_current_user)):
    p = await get_program(body.program_id)
    if not can_edit_program(user, p):
        raise HTTPException(403, "Hanya PJ terkait atau admin yang dapat membuat laporan")
    ex = await db.reports.find_one({"program_id": p["id"], "year": body.year, "month": body.month}, {"_id": 0})
    if ex:
        return ex
    inds = await db.indicators.find({"program_id": p["id"]}, {"_id": 0}).sort("order", 1).to_list(500)
    prev = await db.reports.find_one({"program_id": p["id"], "year": body.year, "month": {"$lt": body.month}},
                                     {"_id": 0}, sort=[("month", -1)])
    prev_items = {i["indicator_id"]: i for i in (prev or {}).get("items", [])}
    items = [{"indicator_id": i["id"],
              "sasaran": prev_items.get(i["id"], {}).get("sasaran", i.get("sasaran")) if i.get("method") != "rasio" else i.get("sasaran"),
              "target": i.get("target"), "capaian": None, "keterangan": ""} for i in inds]
    doc = {"id": new_id(), "program_id": p["id"], "year": body.year, "month": body.month, "status": "draf",
           "items": items, **{k: "" for k in NARR_KEYS}, "created_by": user["id"], "created_at": now_iso(),
           "updated_at": now_iso(), "submitted_at": None, "approved_at": None}
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(user, "buat laporan", "laporan", doc["id"], f"{p['name']} {MONTHS[body.month - 1]} {body.year}")
    return doc


@api.get("/reports/{rid}")
async def report_detail(rid: str, user=Depends(get_current_user)):
    r = await get_report(rid)
    p = (await programs_with_indicators(r["program_id"]))[0]
    if user["role"] == "pj" and p.get("pj_user_id") != user["id"]:
        raise HTTPException(403, "Akses ditolak")
    r["program"] = p
    r["can_edit"] = can_edit_program(user, p) and r["status"] in ("draf", "perlu_perbaikan")
    r["feedback"] = await db.feedback.find({"report_id": rid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    r["revisions"] = await db.report_revisions.find({"report_id": rid}, {"_id": 0}).sort("version", -1).to_list(200)
    r["deadline"] = deadline_for(r["year"], r["month"], (await get_settings())["deadline_day"]).isoformat()
    return r


@api.put("/reports/{rid}")
async def update_report(rid: str, body: ReportUpdate, user=Depends(get_current_user)):
    r = await get_report(rid)
    p = await get_program(r["program_id"])
    if not can_edit_program(user, p) or r["status"] not in ("draf", "perlu_perbaikan"):
        raise HTTPException(403, "Laporan tidak dapat diubah pada status ini")
    upd = {"items": [i.model_dump() for i in body.items], **{k: getattr(body, k) for k in NARR_KEYS},
           "updated_at": now_iso(), "last_autosave": now_iso() if body.autosave else r.get("last_autosave")}
    await db.reports.update_one({"id": rid}, {"$set": upd})
    r.update(upd)
    if not body.autosave:
        await add_revision(r, user, body.note or "Simpan draf")
        await log_activity(user, "simpan laporan", "laporan", rid, f"{p['name']} {MONTHS[r['month'] - 1]} {r['year']}")
    return {"ok": True, "updated_at": upd["updated_at"]}


@api.post("/reports/{rid}/submit")
async def submit_report(rid: str, user=Depends(get_current_user)):
    r = await get_report(rid)
    p = await get_program(r["program_id"])
    if not can_edit_program(user, p) or r["status"] not in ("draf", "perlu_perbaikan"):
        raise HTTPException(400, "Laporan tidak dapat diajukan pada status ini")
    if not any(i.get("capaian") is not None for i in r.get("items", [])):
        raise HTTPException(400, "Isi minimal satu capaian indikator sebelum mengajukan")
    upd = {"status": "diajukan", "submitted_at": now_iso(), "updated_at": now_iso()}
    await db.reports.update_one({"id": rid}, {"$set": upd})
    r.update(upd)
    await add_revision(r, user, "Diajukan ke Kepala Puskesmas")
    label = f"{p['name']} - {MONTHS[r['month'] - 1]} {r['year']}"
    await notify_role("kepala", "Laporan diajukan", f"Laporan {label} menunggu tinjauan.", f"/laporan/{rid}", "laporan")
    await log_activity(user, "ajukan laporan", "laporan", rid, label)
    return {"ok": True}


class ReviewIn(BaseModel):
    action: str = Field(pattern="^(setujui|perbaikan)$")
    note: str = ""


@api.post("/reports/{rid}/review")
async def review_report(rid: str, body: ReviewIn, user=Depends(require("kepala", "admin"))):
    r = await get_report(rid)
    if r["status"] != "diajukan":
        raise HTTPException(400, "Hanya laporan berstatus Diajukan yang dapat ditinjau")
    if body.action == "perbaikan" and not body.note.strip():
        raise HTTPException(400, "Tuliskan catatan perbaikan")
    p = await get_program(r["program_id"])
    status = "disetujui" if body.action == "setujui" else "perlu_perbaikan"
    upd = {"status": status, "updated_at": now_iso(), "approved_at": now_iso() if status == "disetujui" else None}
    await db.reports.update_one({"id": rid}, {"$set": upd})
    r.update(upd)
    await db.feedback.insert_one({"id": new_id(), "report_id": rid, "program_id": r["program_id"],
                                  "type": "persetujuan" if status == "disetujui" else "perbaikan",
                                  "text": body.note or "Laporan disetujui.", "author_id": user["id"],
                                  "author_name": user["name"], "created_at": now_iso()})
    await add_revision(r, user, STATUS_LABEL[status] + (f": {body.note}" if body.note else ""))
    label = f"{p['name']} - {MONTHS[r['month'] - 1]} {r['year']}"
    if p.get("pj_user_id"):
        await notify(p["pj_user_id"], f"Laporan {STATUS_LABEL[status].lower()}", f"{label}: {body.note or 'Disetujui'}",
                     f"/laporan/{rid}", "laporan")
    await log_activity(user, STATUS_LABEL[status].lower(), "laporan", rid, label)
    return {"ok": True, "status": status}


class FeedbackIn(BaseModel):
    type: str = Field("komentar", pattern="^(komentar|arahan)$")
    text: str = Field(min_length=1)
    followup_title: str = ""
    followup_deadline: Optional[str] = None


@api.post("/reports/{rid}/feedback")
async def add_feedback(rid: str, body: FeedbackIn, user=Depends(get_current_user)):
    r = await get_report(rid)
    p = await get_program(r["program_id"])
    if body.type == "arahan" and user["role"] not in ("kepala", "admin"):
        raise HTTPException(403, "Arahan hanya dapat diberikan Kepala Puskesmas")
    fb = {"id": new_id(), "report_id": rid, "program_id": r["program_id"], "type": body.type, "text": body.text,
          "author_id": user["id"], "author_name": user["name"], "created_at": now_iso(), "followup_id": None}
    if body.type == "arahan":
        fu = {"id": new_id(), "program_id": p["id"], "report_id": rid, "title": body.followup_title or body.text[:120],
              "description": body.text, "pj_user_id": p.get("pj_user_id"), "deadline": body.followup_deadline,
              "status": "belum", "result": "", "source": "arahan", "created_by": user["name"],
              "created_at": now_iso(), "updated_at": now_iso()}
        await db.followups.insert_one(fu)
        fb["followup_id"] = fu["id"]
    await db.feedback.insert_one(fb)
    fb.pop("_id", None)
    target = p.get("pj_user_id") if user["id"] != p.get("pj_user_id") else None
    if target:
        await notify(target, "Arahan baru" if body.type == "arahan" else "Komentar baru", body.text[:140],
                     f"/laporan/{rid}", body.type)
    elif user["role"] == "pj":
        await notify_role("kepala", "Komentar PJ", f"{p['name']}: {body.text[:120]}", f"/laporan/{rid}", "komentar")
    await log_activity(user, f"beri {body.type}", "laporan", rid, body.text[:80])
    return fb


# ---------- Follow-ups ----------
class FollowupIn(BaseModel):
    program_id: str
    title: str
    description: str = ""
    pj_user_id: Optional[str] = None
    deadline: Optional[str] = None
    status: str = Field("belum", pattern="^(belum|proses|selesai)$")
    result: str = ""


@api.get("/followups")
async def list_followups(program_id: Optional[str] = None, status: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if program_id:
        q["program_id"] = program_id
    if status:
        q["status"] = status
    if user["role"] == "pj":
        q["pj_user_id"] = user["id"]
    rows = await db.followups.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    progs = {p["id"]: p["name"] async for p in db.programs.find({}, {"_id": 0, "id": 1, "name": 1})}
    users = {u["id"]: u["name"] async for u in db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    today = now().astimezone(WIB).date().isoformat()
    for f in rows:
        f["program_name"] = progs.get(f["program_id"], "-")
        f["pj_name"] = users.get(f.get("pj_user_id"), "-")
        f["overdue"] = bool(f.get("deadline") and f["status"] != "selesai" and f["deadline"][:10] < today)
    return rows


@api.post("/followups")
async def create_followup(body: FollowupIn, user=Depends(require("admin", "kepala", "pj"))):
    p = await get_program(body.program_id)
    if user["role"] == "pj" and p.get("pj_user_id") != user["id"]:
        raise HTTPException(403, "Akses ditolak")
    doc = {"id": new_id(), **body.model_dump(), "pj_user_id": body.pj_user_id or p.get("pj_user_id"),
           "source": "manual", "report_id": None, "created_by": user["name"], "created_at": now_iso(), "updated_at": now_iso()}
    await db.followups.insert_one(doc)
    doc.pop("_id", None)
    if doc["pj_user_id"] and doc["pj_user_id"] != user["id"]:
        await notify(doc["pj_user_id"], "Tindak lanjut baru", body.title, "/tindak-lanjut", "tindak_lanjut")
    await log_activity(user, "tambah tindak lanjut", "tindak_lanjut", doc["id"], body.title)
    return doc


@api.put("/followups/{fid}")
async def update_followup(fid: str, body: FollowupIn, user=Depends(get_current_user)):
    f = await db.followups.find_one({"id": fid}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Tidak ditemukan")
    if user["role"] == "pj" and f.get("pj_user_id") != user["id"]:
        raise HTTPException(403, "Akses ditolak")
    upd = body.model_dump()
    upd["updated_at"] = now_iso()
    await db.followups.update_one({"id": fid}, {"$set": upd})
    await log_activity(user, "ubah tindak lanjut", "tindak_lanjut", fid, f"{body.title} -> {body.status}")
    return await db.followups.find_one({"id": fid}, {"_id": 0})


@api.delete("/followups/{fid}")
async def delete_followup(fid: str, user=Depends(require("admin", "kepala"))):
    await db.followups.delete_one({"id": fid})
    await log_activity(user, "hapus tindak lanjut", "tindak_lanjut", fid)
    return {"ok": True}


# ---------- Flexible tables ----------
class TableIn(BaseModel):
    name: str
    description: str = ""
    program_id: Optional[str] = None
    columns: List[dict] = []
    rows: List[dict] = []
    summary: dict = {}
    is_template: bool = False


@api.get("/tables")
async def list_tables(template: Optional[bool] = None, user=Depends(get_current_user)):
    q = {} if template is None else {"is_template": template}
    return await db.tables.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)


@api.get("/tables/{tid}")
async def get_table(tid: str, user=Depends(get_current_user)):
    t = await db.tables.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tabel tidak ditemukan")
    return t


@api.post("/tables")
async def create_table(body: TableIn, user=Depends(get_current_user)):
    doc = {"id": new_id(), **body.model_dump(), "owner_id": user["id"], "owner_name": user["name"],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.tables.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(user, "buat " + ("template" if body.is_template else "tabel"), "tabel", doc["id"], body.name)
    return doc


@api.put("/tables/{tid}")
async def update_table(tid: str, body: TableIn, user=Depends(get_current_user)):
    t = await get_table(tid, user)
    if user["role"] != "admin" and t["owner_id"] != user["id"]:
        raise HTTPException(403, "Hanya pembuat tabel atau admin yang dapat mengubah")
    await db.tables.update_one({"id": tid}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    return {"ok": True}


@api.delete("/tables/{tid}")
async def delete_table(tid: str, user=Depends(get_current_user)):
    t = await get_table(tid, user)
    if user["role"] != "admin" and t["owner_id"] != user["id"]:
        raise HTTPException(403, "Akses ditolak")
    await db.tables.delete_one({"id": tid})
    await log_activity(user, "hapus tabel", "tabel", tid, t["name"])
    return {"ok": True}


# ---------- Analyses (SWOT/TOWS, Fishbone/5 Why) ----------
class AnalysisGen(BaseModel):
    type: str = Field(pattern="^(swot|fishbone)$")
    program_id: str
    year: int
    period: str = "bulanan"
    month: int = 1
    quarter: int = 1
    masalah: str = ""


@api.post("/analyses/generate")
async def generate_analysis(body: AnalysisGen, user=Depends(get_current_user)):
    p = await get_program(body.program_id)
    ds, ctx = await ai.context_for(body.program_id, body.year, body.period, body.month, body.quarter, db)
    if not ai.has_data(ds):
        raise HTTPException(400, f"Belum ada data laporan yang diajukan untuk {ds['periode']}. Analisis tidak dibuat agar tidak mengarang data.")
    masalah = body.masalah.strip()
    if body.type == "fishbone" and not masalah:
        gaps = [(i["recap"]["target_periode"] - i["recap"]["persen"], i) for i in ds["programs"][0]["indicators"]
                if i["recap"]["status"] == "belum_tercapai"]
        if gaps:
            g, i = max(gaps, key=lambda x: x[0])
            masalah = f"Capaian {i['name']} {exports.fmt(i['recap']['persen'], True)} di bawah target periode {exports.fmt(i['recap']['target_periode'], True)}"
        else:
            raise HTTPException(400, "Tidak ada indikator di bawah target. Tuliskan masalah yang ingin dianalisis.")
    try:
        prompt = (ai.SWOT_PROMPT.format(ctx=ctx) if body.type == "swot" else ai.FISH_PROMPT.format(masalah=masalah, ctx=ctx))
        content = await ai.ai_json(prompt)
    except Exception as e:
        logger.error(f"AI error: {e}")
        raise HTTPException(502, "Layanan AI belum dapat diakses. Coba lagi beberapa saat.")
    doc = {"id": new_id(), "type": body.type, "program_id": p["id"], "program_name": p["name"], "year": body.year,
           "period": body.period, "month": body.month, "quarter": body.quarter, "periode": ds["periode"],
           "masalah": masalah, "content": content,
           "rujukan": ai.SWOT_REFS if body.type == "swot" else ai.FISH_REFS,
           "sumber_data": f"Laporan bulanan {unit_label(p)} {p['name']} berstatus Diajukan/Perlu perbaikan/Disetujui, {ds['periode']}; daftar tindak lanjut.",
           "validations": [], "status": "menunggu_validasi", "created_by": user["name"], "created_at": now_iso(),
           "updated_at": now_iso()}
    await db.analyses.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(user, f"buat analisis {body.type}", "analisis", doc["id"], f"{p['name']} {ds['periode']}")
    return doc


@api.get("/analyses")
async def list_analyses(type: Optional[str] = None, program_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if type:
        q["type"] = type
    if program_id:
        q["program_id"] = program_id
    return await db.analyses.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/analyses/{aid}")
async def get_analysis(aid: str, user=Depends(get_current_user)):
    a = await db.analyses.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Analisis tidak ditemukan")
    return a


class AnalysisEdit(BaseModel):
    content: dict


@api.put("/analyses/{aid}")
async def edit_analysis(aid: str, body: AnalysisEdit, user=Depends(get_current_user)):
    await get_analysis(aid, user)
    await db.analyses.update_one({"id": aid}, {"$set": {"content": body.content, "updated_at": now_iso()}})
    await log_activity(user, "ubah analisis", "analisis", aid)
    return {"ok": True}


class ValidateIn(BaseModel):
    status: str = Field(pattern="^(valid|perlu_revisi)$")
    note: str = ""


@api.post("/analyses/{aid}/validate")
async def validate_analysis(aid: str, body: ValidateIn, user=Depends(get_current_user)):
    a = await get_analysis(aid, user)
    p = await get_program(a["program_id"])
    role = "kepala" if user["role"] == "kepala" else ("pj" if p.get("pj_user_id") == user["id"] else None)
    if not role:
        raise HTTPException(403, "Validasi hanya oleh PJ terkait dan Kepala Puskesmas")
    vals = [v for v in a.get("validations", []) if v["role"] != role]
    vals.append({"role": role, "user_name": user["name"], "status": body.status, "note": body.note, "at": now_iso()})
    roles_ok = {v["role"] for v in vals if v["status"] == "valid"}
    status = "perlu_revisi" if any(v["status"] == "perlu_revisi" for v in vals) else \
        ("tervalidasi" if roles_ok == {"pj", "kepala"} else f"divalidasi_{'_'.join(sorted(roles_ok))}")
    await db.analyses.update_one({"id": aid}, {"$set": {"validations": vals, "status": status}})
    await log_activity(user, "validasi analisis", "analisis", aid, body.status)
    return {"ok": True, "status": status}


@api.delete("/analyses/{aid}")
async def delete_analysis(aid: str, user=Depends(get_current_user)):
    await db.analyses.delete_one({"id": aid})
    await log_activity(user, "hapus analisis", "analisis", aid)
    return {"ok": True}


# ---------- Presentations ----------
class PresGen(BaseModel):
    program_id: str
    year: int
    period: str = "bulanan"
    month: int = 1
    quarter: int = 1
    include_draft: bool = True


def _narr_bullets(p, key):
    out = [f"[{n['bulan']}] {n[key]}" for n in p["narasi"] if n.get(key)]
    return out or ["Belum tersedia"]


@api.post("/presentations/generate")
async def generate_presentation(body: PresGen, user=Depends(get_current_user)):
    prog = await get_program(body.program_id)
    if user["role"] == "pj" and prog.get("pj_user_id") != user["id"]:
        raise HTTPException(403, "PJ hanya dapat membuat presentasi untuk SPM/program miliknya")
    ds, ctx = await ai.context_for(body.program_id, body.year, body.period, body.month, body.quarter, db, body.include_draft)
    p = ds["programs"][0]
    inds = p["indicators"]
    has_draft = any(n["status"] == "draf" for n in p["narasi"])
    sid = new_id
    slides = [
        {"id": sid(), "layout": "title", "title": f"Capaian {unit_label(p)} {p['name']}",
         "subtitle": f"{ds['periode']}  |  PJ: {p.get('pj_name') or '-'}  |  UPT Puskesmas Melati" + ("  |  Memuat data draf" if has_draft else ""),
         "bullets": [], "notes": "Disusun dari data yang dientri PJ pada laporan bulanan."},
        {"id": sid(), "layout": "table", "title": "Capaian Program",
         "table": {"headers": ["Indikator", "Sasaran", "Target (%)", "Capaian", "Capaian (%)", "Status"],
                   "rows": [[r[0], r[3], r[4], r[5], r[6], r[7]] for r in map(exports.ind_row, inds)]}, "bullets": []},
        {"id": sid(), "layout": "chart", "title": "Grafik Capaian vs Target (%)",
         "chart": {"labels": [i["name"][:40] for i in inds],
                   "series": [{"name": "Capaian (%)", "data": [i["recap"]["persen"] for i in inds]},
                              {"name": "Target periode (%)", "data": [i["recap"]["target_periode"] for i in inds]}]},
         "bullets": []},
        {"id": sid(), "layout": "bullets", "title": "Kendala", "bullets": _narr_bullets(p, "kendala")},
        {"id": sid(), "layout": "bullets", "title": "Upaya & Hasil Upaya",
         "bullets": [f"Upaya {b}" for b in _narr_bullets(p, "upaya")] + [f"Hasil {b}" for b in _narr_bullets(p, "hasil_upaya")]},
    ]
    analysis = ["Belum tersedia - belum ada data laporan yang diajukan."]
    if ai.has_data(ds):
        try:
            res = await ai.ai_json(ai.PRES_PROMPT.format(ctx=ctx))
            analysis = [f"[{x.get('jenis', 'dugaan').capitalize()}] {x.get('teks')} (Sumber: {x.get('sumber', '-')})"
                        for x in res.get("analisis", [])] or analysis
        except Exception as e:
            logger.error(f"AI pres error: {e}")
            analysis = ["Analisis otomatis belum tersedia (layanan AI tidak dapat diakses). Silakan isi manual."]
    fus = await db.followups.find({"program_id": p["id"], "status": {"$ne": "selesai"}}, {"_id": 0}).to_list(20)
    st = {"belum": "Belum dikerjakan", "proses": "Sedang dikerjakan", "selesai": "Selesai"}
    slides += [
        {"id": sid(), "layout": "bullets", "title": "Analisis", "bullets": analysis,
         "notes": "[Fakta] = tertulis di data laporan; [Dugaan] = perlu verifikasi PJ/Kepala Puskesmas."},
        {"id": sid(), "layout": "bullets", "title": "Rencana Tindak Lanjut",
         "bullets": _narr_bullets(p, "rtl") + [f"{f['title']} - {st[f['status']]}" + (f" (tenggat {f['deadline'][:10]})" if f.get('deadline') else "") for f in fus]},
        {"id": sid(), "layout": "bullets", "title": "Dukungan yang Dibutuhkan", "bullets": _narr_bullets(p, "dukungan")},
    ]
    doc = {"id": new_id(), "program_id": prog["id"], "program_name": prog["name"], "periode": ds["periode"],
           "title": f"{prog['name']} - {ds['periode']}", "slides": slides, "created_by": user["name"],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.presentations.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(user, "buat presentasi", "presentasi", doc["id"], doc["title"])
    return doc


@api.get("/presentations")
async def list_presentations(user=Depends(get_current_user)):
    q = {}
    if user["role"] == "pj":
        q["program_id"] = {"$in": [p["id"] async for p in db.programs.find({"pj_user_id": user["id"]}, {"id": 1, "_id": 0})]}
    return await db.presentations.find(q, {"_id": 0, "slides": 0}).sort("created_at", -1).to_list(200)


@api.get("/presentations/{pid}")
async def get_presentation(pid: str, user=Depends(get_current_user)):
    p = await db.presentations.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Presentasi tidak ditemukan")
    return p


class PresEdit(BaseModel):
    title: str
    slides: List[dict]


@api.put("/presentations/{pid}")
async def edit_presentation(pid: str, body: PresEdit, user=Depends(get_current_user)):
    await get_presentation(pid, user)
    await db.presentations.update_one({"id": pid}, {"$set": {"title": body.title, "slides": body.slides, "updated_at": now_iso()}})
    await log_activity(user, "ubah presentasi", "presentasi", pid, body.title)
    return {"ok": True}


@api.delete("/presentations/{pid}")
async def delete_presentation(pid: str, user=Depends(get_current_user)):
    await db.presentations.delete_one({"id": pid})
    return {"ok": True}


# ---------- Exports ----------
MIME = {"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


def _file(data, name, fmt):
    return StreamingResponse(io.BytesIO(data), media_type=MIME[fmt],
                             headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"'})


@api.get("/export/report")
async def export_report(format: str, year: int, period: str = "bulanan", month: int = 1, quarter: int = 1,
                        program_id: Optional[str] = None, kind: Optional[str] = None, user=Depends(get_current_user)):
    if format not in ("docx", "xlsx", "pdf"):
        raise HTTPException(400, "Format tidak didukung")
    own = await scope_programs(user, program_id)
    ds = await build_dataset(year, period, month, quarter, program_id or None, kind=kind or None)
    if own is not None:
        ds["programs"] = [p for p in ds["programs"] if p["id"] in own]
    data = {"docx": exports.report_docx, "xlsx": exports.report_xlsx, "pdf": exports.report_pdf}[format](ds)
    await log_activity(user, f"ekspor laporan {format}", "ekspor", None, ds["periode"])
    name = f"Laporan_{'Kolektif' if not program_id else ds['programs'][0]['name']}_{ds['periode']}".replace(" ", "_")
    return _file(data, name, format)


@api.get("/export/presentation/{pid}")
async def export_presentation(pid: str, format: str, user=Depends(get_current_user)):
    if format not in ("pptx", "pdf"):
        raise HTTPException(400, "Format tidak didukung")
    p = await get_presentation(pid, user)
    data = exports.pres_pptx(p) if format == "pptx" else exports.pres_pdf(p)
    await log_activity(user, f"ekspor presentasi {format}", "ekspor", pid, p["title"])
    return _file(data, p["title"].replace(" ", "_"), format)


# ---------- Notifications ----------
@api.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    rows = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"items": rows, "unread": await db.notifications.count_documents({"user_id": user["id"], "read": False})}


@api.post("/notifications/read-all")
async def read_all(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def read_one(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Settings & reminders ----------
class SettingsIn(BaseModel):
    deadline_day: int = Field(ge=1, le=28)
    days_before: int = Field(ge=1, le=20)
    send_hour: int = Field(ge=0, le=23)
    email_enabled: bool
    end_of_month: bool = True
    late_days: List[int] = [1, 3, 7]


@api.get("/settings")
async def read_settings(user=Depends(get_current_user)):
    return await get_settings()


@api.put("/settings")
async def write_settings(body: SettingsIn, user=Depends(require("admin"))):
    await get_settings()
    await db.settings.update_one({"key": "reminder"}, {"$set": body.model_dump()})
    await log_activity(user, "ubah pengaturan pengingat", "pengaturan")
    return await get_settings()


@api.get("/integrations/status")
async def integrations_status(user=Depends(get_current_user)):
    s = await get_settings()
    last = await db.reminder_logs.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    last_cron = await db.cron_runs.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    email_state = "aktif" if (email_configured() and s.get("email_enabled")) else (
        "nonaktif" if email_configured() else "belum_terkonfigurasi")
    return {"email": {"status": email_state, "provider": "Resend (dikelola Emergent)"},
            "ai": {"status": "aktif" if ai.ai_available() else "belum_terkonfigurasi", "model": "Gemini 3 Flash"},
            "scheduler": {"status": "aktif", "jadwal": "Setiap jam (cek jam kirim)", "terakhir": (last_cron or {}).get("created_at")},
            "last_reminder": last}


STAGE_TXT = {"akhir_bulan": "Akhir bulan", "sebelum_tenggat": "Sebelum tenggat", "terlambat": "Terlambat"}


async def run_reminders(force=False):
    s = await get_settings()
    t = now().astimezone(WIB)
    if not force and t.hour != s["send_hour"]:
        return {"skipped": "Bukan jam kirim", "sent": 0}
    today = t.date()
    jobs = []
    if s.get("end_of_month", True) and today.day == calendar.monthrange(today.year, today.month)[1]:
        jobs.append(("akhir_bulan", today.year, today.month))
    py, pm = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    dl = deadline_for(py, pm, s["deadline_day"]).date()
    diff = (dl - today).days
    if diff >= 0 and (force or diff == s["days_before"] or diff == 0):
        jobs.append(("sebelum_tenggat", py, pm))
    if diff < 0 and (force or -diff in s.get("late_days", [1, 3, 7])):
        jobs.append(("terlambat", py, pm))
    progs = await db.programs.find({}, {"_id": 0}).to_list(500)
    users = {u["id"]: u async for u in db.users.find({}, {"_id": 0, "password_hash": 0})}
    sent, results = 0, []
    for stage, yy, mm in jobs:
        reports = await load_reports(yy, None)
        dlx = deadline_for(yy, mm, s["deadline_day"])
        late_names = []
        for p in progs:
            r = reports.get((p["id"], mm))
            if r and r["status"] in REPORTED:
                continue
            key = f"{stage}:{p['id']}:{yy}-{mm}:{today.isoformat()}"
            if await db.reminder_logs.find_one({"key": key}):
                continue
            pj = users.get(p.get("pj_user_id"))
            per = f"{MONTHS[mm - 1]} {yy}"
            msg = {"akhir_bulan": f"Hari ini akhir bulan. Mohon lengkapi laporan {unit_label(p)} {p['name']} periode {per}. Tenggat: {dlx.strftime('%d-%m-%Y')}.",
                   "sebelum_tenggat": f"Tenggat laporan {unit_label(p)} {p['name']} periode {per} jatuh pada {dlx.strftime('%d-%m-%Y')} ({(dlx.date() - today).days} hari lagi).",
                   "terlambat": f"Laporan {unit_label(p)} {p['name']} periode {per} melewati tenggat {dlx.strftime('%d-%m-%Y')} dan belum diajukan."}[stage]
            email_res = "Email dinonaktifkan"
            if pj:
                await notify(pj["id"], f"Pengingat: {STAGE_TXT[stage]}", msg, "/laporan", "pengingat")
                if s.get("email_enabled"):
                    ok, info = await send_email(to=pj["email"], subject=f"[MELATI] Pengingat laporan - {STAGE_TXT[stage]}",
                                                html=reminder_html(pj["name"], f"Pengingat Laporan: {STAGE_TXT[stage]}", msg))
                    email_res = ("Terkirim" if ok else "Tidak terkirim") + f" ({info})"
            if stage == "terlambat":
                late_names.append(p["name"])
            await db.reminder_logs.insert_one({"id": new_id(), "key": key, "stage": stage, "program": p["name"],
                                               "periode": per, "pj": pj["name"] if pj else "PJ belum ditetapkan",
                                               "email": email_res, "created_at": now_iso()})
            sent += 1
            results.append({"program": p["name"], "stage": stage, "email": email_res})
        if late_names:
            await notify_role("kepala", "Laporan terlambat", f"{len(late_names)} SPM/program terlambat ({MONTHS[mm - 1]} {yy}): {', '.join(late_names)}",
                              "/dashboard", "pengingat")
    return {"sent": sent, "jobs": [j[0] for j in jobs], "results": results}


@api.post("/reminders/run")
async def run_now(user=Depends(require("admin"))):
    res = await run_reminders(force=True)
    await log_activity(user, "jalankan pengingat manual", "pengingat", None, f"{res['sent']} pengingat")
    return res


@api.get("/reminders/logs")
async def reminder_logs(user=Depends(get_current_user)):
    return await db.reminder_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/reminders/test-email")
async def test_email(user=Depends(require("admin"))):
    ok, info = await send_email(to=user["email"], subject="[MELATI] Uji pengiriman email",
                                html=reminder_html(user["name"], "Uji Email Pengingat",
                                                   "Integrasi email pengingat MELATI Program Hub berfungsi dengan baik."))
    await log_activity(user, "uji email", "pengingat", None, info)
    return {"ok": ok, "info": info}


@api.post("/cron/reminders")
async def cron_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = request.headers.get("X-Webhook-Id") or (body or {}).get("run_id") or new_id()
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "created_at": now_iso()})
    background.add_task(run_reminders)
    return {"ok": True}


# ---------- Activity ----------
@api.get("/activity")
async def activity(limit: int = 200, user=Depends(require("admin", "kepala"))):
    return await db.activity_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.get("/")
async def root():
    return {"app": "MELATI Program Hub"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.reports.create_index([("program_id", 1), ("year", 1), ("month", 1)], unique=True)
    await db.reminder_logs.create_index("key")
    await seed_all()


@app.on_event("shutdown")
async def shutdown():
    from core import client
    client.close()
