"""Iteration 4: SPM vs Program separation.

- GET /api/programs?kind=spm returns 12 SPMs sorted; ?kind=program returns 4 programs.
- GET /api/dashboard?kind=spm/program filters correctly, YoY fields preserved.
- GET /api/reports?kind=... filters.
- GET /api/export/report?kind=... titles.
- Presentation title slide uses SPM/Program.
"""
import io
import os
import pytest
import requests
from zipfile import ZipFile


def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
API = BASE_URL + "/api"

ADMIN = ("tiofansha@gmail.com", "Melati@2026")
PJ_KIA = ("pj.kia@puskesmas-melati.test", "Pj@2026")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def pj_kia_tok():
    return _login(*PJ_KIA)


# ---------- Programs ----------

def test_programs_kind_spm(admin_tok):
    r = requests.get(f"{API}/programs", params={"kind": "spm"}, headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 12, f"expected 12 SPM, got {len(data)}"
    codes = [p["code"] for p in data]
    assert codes == sorted(codes), f"codes not sorted: {codes}"
    assert codes[0] == "SPM-01" and codes[-1] == "SPM-12"
    for p in data:
        assert p["kind"] == "spm"
        assert len(p["indicators"]) >= 1
        for i in p["indicators"]:
            assert i["target"] == 100


def test_programs_kind_program(admin_tok):
    r = requests.get(f"{API}/programs", params={"kind": "program"}, headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 4, f"expected 4 programs, got {len(data)}"
    for p in data:
        assert p["kind"] == "program"


def test_programs_no_kind_returns_all(admin_tok):
    r = requests.get(f"{API}/programs", headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    assert len(r.json()) == 16


def test_create_program_with_kind_spm(admin_tok):
    r = requests.post(f"{API}/programs",
                      json={"name": "TEST_SPM_NEW", "code": "TEST01", "kind": "spm"},
                      headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    try:
        r = requests.get(f"{API}/programs", params={"kind": "spm"}, headers=_h(admin_tok), timeout=30)
        assert any(p["id"] == pid and p["kind"] == "spm" for p in r.json())
    finally:
        requests.delete(f"{API}/programs/{pid}", headers=_h(admin_tok), timeout=30)


# ---------- Dashboard ----------

def test_dashboard_kind_spm(admin_tok):
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 10, "kind": "spm"},
                     headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert len(d["programs"]) == 12
    for p in d["programs"]:
        assert p["kind"] == "spm"
    # yoy fields preserved
    assert "yoy_trend" in d and len(d["yoy_trend"]) == 12
    assert "yoy_spm" in d and len(d["yoy_spm"]) == 12
    # completeness only covers SPM
    program_ids = {p["id"] for p in d["programs"]}
    for row in d["completeness"]["rows"]:
        assert row["program_id"] in program_ids


def test_dashboard_kind_program(admin_tok):
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 10, "kind": "program"},
                     headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert len(d["programs"]) == 4
    for p in d["programs"]:
        assert p["kind"] == "program"


# ---------- Reports filter ----------

def test_reports_kind_filter(admin_tok):
    r = requests.get(f"{API}/reports", params={"kind": "spm"}, headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    spm_reports = r.json()
    r = requests.get(f"{API}/reports", params={"kind": "program"}, headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    prog_reports = r.json()
    # Fetch programs to classify
    r = requests.get(f"{API}/programs", headers=_h(admin_tok), timeout=30)
    kind_by_pid = {p["id"]: p["kind"] for p in r.json()}
    for rep in spm_reports:
        assert kind_by_pid.get(rep["program_id"]) == "spm"
    for rep in prog_reports:
        assert kind_by_pid.get(rep["program_id"]) == "program"


# ---------- Export titles ----------

def _xlsx_text(content):
    """Return concatenated text from xlsx (sharedStrings or inline)."""
    parts = []
    with ZipFile(io.BytesIO(content)) as z:
        for n in z.namelist():
            if n.startswith("xl/") and n.endswith(".xml"):
                parts.append(z.read(n).decode("utf-8", errors="ignore"))
    return "\n".join(parts)


def test_export_xlsx_collective_spm(admin_tok):
    r = requests.get(f"{API}/export/report",
                     params={"format": "xlsx", "year": 2026, "period": "bulanan", "month": 10, "kind": "spm"},
                     headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200, r.text
    xml = _xlsx_text(r.content)
    assert "Laporan Kolektif SPM" in xml


def test_export_xlsx_collective_program(admin_tok):
    r = requests.get(f"{API}/export/report",
                     params={"format": "xlsx", "year": 2026, "period": "bulanan", "month": 10, "kind": "program"},
                     headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200, r.text
    xml = _xlsx_text(r.content)
    assert "Laporan Kolektif Program" in xml


def test_export_xlsx_single_spm(admin_tok):
    r = requests.get(f"{API}/programs", params={"kind": "spm"}, headers=_h(admin_tok), timeout=30)
    spm = r.json()[0]
    r = requests.get(f"{API}/export/report",
                     params={"format": "xlsx", "year": 2026, "period": "bulanan", "month": 10,
                             "kind": "spm", "program_id": spm["id"]},
                     headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200
    xml = _xlsx_text(r.content)
    assert f"Laporan SPM {spm['name']}" in xml, xml[:400]


def test_export_xlsx_single_program(admin_tok):
    r = requests.get(f"{API}/programs", params={"kind": "program"}, headers=_h(admin_tok), timeout=30)
    prog = r.json()[0]
    r = requests.get(f"{API}/export/report",
                     params={"format": "xlsx", "year": 2026, "period": "bulanan", "month": 10,
                             "kind": "program", "program_id": prog["id"]},
                     headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200
    xml = _xlsx_text(r.content)
    assert f"Laporan Program {prog['name']}" in xml


# ---------- Presentation title slide ----------

def test_presentation_title_slide_spm(admin_tok):
    r = requests.get(f"{API}/programs", params={"kind": "spm"}, headers=_h(admin_tok), timeout=30)
    spm = r.json()[0]
    r = requests.post(f"{API}/presentations/generate",
                      json={"program_id": spm["id"], "year": 2026, "period": "bulanan", "month": 10, "include_draft": True},
                      headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200, r.text
    pres = r.json()
    try:
        title_slide = next((s for s in pres["slides"] if s.get("layout") == "title"), None)
        assert title_slide is not None
        assert title_slide["title"].startswith(f"Capaian SPM {spm['name']}"), title_slide["title"]
    finally:
        requests.delete(f"{API}/presentations/{pres['id']}", headers=_h(admin_tok), timeout=30)


def test_presentation_title_slide_program(admin_tok):
    r = requests.get(f"{API}/programs", params={"kind": "program"}, headers=_h(admin_tok), timeout=30)
    prog = r.json()[0]
    r = requests.post(f"{API}/presentations/generate",
                      json={"program_id": prog["id"], "year": 2026, "period": "bulanan", "month": 10, "include_draft": True},
                      headers=_h(admin_tok), timeout=60)
    assert r.status_code == 200, r.text
    pres = r.json()
    try:
        title_slide = next((s for s in pres["slides"] if s.get("layout") == "title"), None)
        assert title_slide["title"].startswith(f"Capaian Program {prog['name']}"), title_slide["title"]
    finally:
        requests.delete(f"{API}/presentations/{pres['id']}", headers=_h(admin_tok), timeout=30)


# ---------- PJ scoping across kinds ----------

def test_pj_kia_cannot_see_spm_reports_from_other_programs(pj_kia_tok, admin_tok):
    # PJ KIA has program KIA (kind=program). Reports kind=spm filter should return only
    # SPMs owned by pj.kia (none, unless admin assigned). Verify no leaked reports.
    r = requests.get(f"{API}/reports", params={"kind": "spm"}, headers=_h(pj_kia_tok), timeout=30)
    assert r.status_code == 200
    reports = r.json()
    # If any returned, their program must be assigned to pj.kia
    r2 = requests.get(f"{API}/programs", headers=_h(admin_tok), timeout=30)
    kia_me_programs = [p["id"] for p in r2.json() if p.get("pj_user_id")]
    # fetch pj.kia id
    r3 = requests.get(f"{API}/auth/me", headers=_h(pj_kia_tok), timeout=30)
    pj_id = r3.json()["id"]
    my_pids = {p["id"] for p in r2.json() if p.get("pj_user_id") == pj_id}
    for rep in reports:
        assert rep["program_id"] in my_pids
