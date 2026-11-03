import calendar
from datetime import datetime
from core import db, NOID, MONTHS, WIB, now

REPORTED = ["diajukan", "perlu_perbaikan", "disetujui"]
METHOD_LABEL = {
    "kumulatif": "Kumulatif (capaian bulanan dijumlah, sasaran tahunan dihitung sekali)",
    "rasio": "Rasio periode (jumlah capaian / jumlah sasaran bulanan)",
    "terakhir": "Nilai terakhir (posisi bulan terakhir yang dilaporkan)",
}


def period_months(period, month=None, quarter=None):
    if period == "bulanan":
        return [int(month)]
    if period == "triwulan":
        q = int(quarter)
        return [3 * q - 2, 3 * q - 1, 3 * q]
    return list(range(1, 13))


def period_label(period, year, month=None, quarter=None):
    if period == "bulanan":
        return f"{MONTHS[int(month) - 1]} {year}"
    if period == "triwulan":
        return f"Triwulan {['I', 'II', 'III', 'IV'][int(quarter) - 1]} {year}"
    return f"Tahun {year}"


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def aggregate(ind, by_month, months):
    rows = [(m, by_month[m]) for m in sorted(months) if m in by_month and num(by_month[m].get("capaian")) is not None]
    base_target = num(ind.get("target"))
    if not rows:
        return {"sasaran": None, "target": base_target, "target_periode": None, "capaian": None,
                "persen": None, "status": "belum_tersedia", "bulan_terlapor": []}
    last = rows[-1][1]
    method = ind.get("method", "kumulatif")
    caps = [num(r["capaian"]) for _, r in rows]
    if method == "kumulatif":
        capaian, sasaran = sum(caps), num(last.get("sasaran"))
    elif method == "rasio":
        sas = [num(r.get("sasaran")) for _, r in rows]
        capaian = sum(caps)
        sasaran = sum(s for s in sas if s is not None) if any(s is not None for s in sas) else None
    else:
        capaian, sasaran = caps[-1], num(last.get("sasaran"))
    t = num(last.get("target"))
    t = t if t is not None else base_target
    target_periode = round(t * len(months) / 12, 2) if (t is not None and method == "kumulatif") else t
    persen = round(capaian / sasaran * 100, 2) if sasaran else None
    if persen is None:
        status = "sasaran_kosong"
    elif target_periode is None:
        status = "target_kosong"
    else:
        status = "tercapai" if persen >= target_periode else "belum_tercapai"
    return {"sasaran": sasaran, "target": t, "target_periode": target_periode, "capaian": capaian,
            "persen": persen, "status": status, "bulan_terlapor": [m for m, _ in rows]}


def deadline_for(year, month, day):
    y, m = (year + 1, 1) if month == 12 else (year, month + 1)
    return datetime(y, m, min(day, calendar.monthrange(y, m)[1]), 23, 59, 59, tzinfo=WIB)


async def load_reports(year, program_ids=None, statuses=None):
    q = {"year": int(year)}
    if program_ids is not None:
        q["program_id"] = {"$in": program_ids}
    if statuses:
        q["status"] = {"$in": statuses}
    out = {}
    async for r in db.reports.find(q, NOID):
        out[(r["program_id"], r["month"])] = r
    return out


def by_month_for(program_id, indicator_id, reports):
    res = {}
    for (pid, m), r in reports.items():
        if pid != program_id:
            continue
        for it in r.get("items", []):
            if it.get("indicator_id") == indicator_id:
                res[m] = it
    return res


def unit_label(p):
    return "SPM" if p.get("kind") == "spm" else "Program"


async def programs_with_indicators(program_id=None, kind=None):
    q = {"id": program_id} if program_id else {}
    if kind:
        q["kind"] = kind
    progs = await db.programs.find(q, NOID).sort([("kind", -1), ("code", 1), ("name", 1)]).to_list(500)
    users = {u["id"]: u["name"] async for u in db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    for p in progs:
        p["pj_name"] = users.get(p.get("pj_user_id"))
        p["indicators"] = await db.indicators.find({"program_id": p["id"]}, NOID).sort("order", 1).to_list(500)
    return progs


async def build_dataset(year, period, month=None, quarter=None, program_id=None, include_draft=False, kind=None):
    months = period_months(period, month, quarter)
    progs = await programs_with_indicators(program_id, kind)
    reports = await load_reports(year, [p["id"] for p in progs], REPORTED + (["draf"] if include_draft else []))
    for p in progs:
        for ind in p["indicators"]:
            ind["recap"] = aggregate(ind, by_month_for(p["id"], ind["id"], reports), months)
        p["narasi"] = []
        for m in months:
            r = reports.get((p["id"], m))
            if r:
                p["narasi"].append({"bulan": MONTHS[m - 1], "status": r["status"], **{k: r.get(k, "") for k in
                                    ["kendala", "upaya", "hasil_upaya", "rtl", "dukungan"]}})
    return {"periode": period_label(period, year, month, quarter), "year": int(year), "period": period, "kind": kind,
            "months": months, "programs": progs}


async def completeness(year, months, settings, program_ids=None, kind=None):
    q = {"id": {"$in": program_ids}} if program_ids is not None else {}
    if kind:
        q["kind"] = kind
    progs = await db.programs.find(q, NOID).to_list(500)
    reports = await load_reports(year, [p["id"] for p in progs])
    t = now().astimezone(WIB)
    rows = []
    for p in progs:
        for m in months:
            if int(year) > t.year or (int(year) == t.year and m > t.month):
                continue
            r = reports.get((p["id"], m))
            dl = deadline_for(int(year), m, settings["deadline_day"])
            sub = r.get("submitted_at") if r else None
            status = r["status"] if r else "belum_dibuat"
            late = False
            if sub:
                late = datetime.fromisoformat(sub).astimezone(WIB) > dl
            elif t > dl:
                late = True
            rows.append({"program_id": p["id"], "program": p["name"], "month": m, "bulan": MONTHS[m - 1],
                         "status": status, "submitted_at": sub, "deadline": dl.isoformat(), "late": late,
                         "report_id": r["id"] if r else None})
    expected = len(rows)
    submitted = sum(1 for r in rows if r["status"] in REPORTED)
    return {"expected": expected, "submitted": submitted,
            "approved": sum(1 for r in rows if r["status"] == "disetujui"),
            "late": sum(1 for r in rows if r["late"]),
            "persen": round(submitted / expected * 100, 1) if expected else None, "rows": rows}
