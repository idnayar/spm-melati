"""Iteration 3: Dashboard details + Year-over-Year comparison.

Tests the dashboard endpoint's new fields: periode_lalu, summary.rata_persen_lalu,
distribusi, yoy_trend, yoy_spm, per-program ringkasan + status_bulanan,
per-indicator recap_prev + selisih, PJ scoping.
"""
import os
import pytest
import requests

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
KEPALA = ("kepala@puskesmas-melati.test", "Kepala@2026")
PJ_KIA = ("pj.kia@puskesmas-melati.test", "Pj@2026")
PJ_GIZI = ("pj.gizi@puskesmas-melati.test", "Pj@2026")


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
def kepala_tok():
    return _login(*KEPALA)


@pytest.fixture(scope="module")
def pj_kia_tok():
    return _login(*PJ_KIA)


@pytest.fixture(scope="module")
def pj_gizi_tok():
    return _login(*PJ_GIZI)


# ---- Dashboard shape ----

def test_dashboard_has_new_fields(admin_tok):
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 9},
                     headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ("periode", "periode_lalu", "programs", "trend", "yoy_trend", "yoy_spm",
             "distribusi", "summary", "completeness"):
        assert k in d, f"missing field {k}"
    # summary
    for k in ("indikator", "tercapai", "belum_tercapai", "belum_tersedia",
              "rata_persen", "rata_persen_lalu"):
        assert k in d["summary"], f"missing summary.{k}"
    # distribusi keys
    for k in ("tercapai", "belum_tercapai", "sasaran_kosong", "target_kosong", "belum_tersedia"):
        assert k in d["distribusi"]
    # yoy_trend 12 months with shape
    assert len(d["yoy_trend"]) == 12
    for row in d["yoy_trend"]:
        assert set(row.keys()) >= {"bulan", "tahun_ini", "tahun_lalu"}
    # yoy_spm per program
    assert len(d["yoy_spm"]) == len(d["programs"])
    for row in d["yoy_spm"]:
        assert set(row.keys()) >= {"nama", "tahun_ini", "tahun_lalu"}
    # periode_lalu reflects prior year same month
    assert "2025" in d["periode_lalu"]


def test_dashboard_program_ringkasan_status_bulanan(admin_tok):
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 9},
                     headers=_h(admin_tok), timeout=30)
    d = r.json()
    for p in d["programs"]:
        assert "ringkasan" in p
        for k in ("rata_persen", "rata_persen_lalu", "tercapai", "total", "belum_tersedia"):
            assert k in p["ringkasan"]
        assert isinstance(p["status_bulanan"], list) and len(p["status_bulanan"]) == 12
        # indicators have recap_prev + selisih
        for i in p["indicators"]:
            assert "recap_prev" in i and "selisih" in i
            a = i["recap"]["persen"]
            b = i["recap_prev"]["persen"]
            if a is not None and b is not None:
                assert i["selisih"] == round(a - b, 2)
            else:
                assert i["selisih"] is None


def test_dashboard_triwulan(admin_tok):
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "triwulan", "quarter": 3},
                     headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "Triwulan III" in d["periode"]
    assert "Triwulan III" in d["periode_lalu"] and "2025" in d["periode_lalu"]


def test_dashboard_pj_scoping_includes_new_fields(pj_kia_tok):
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 9},
                     headers=_h(pj_kia_tok), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert len(d["programs"]) == 1
    assert "KIA" in d["programs"][0]["name"] or "Kesehatan Ibu" in d["programs"][0]["name"]
    assert len(d["yoy_spm"]) == 1
    # yoy_trend still 12 months with averages across only own SPM
    assert len(d["yoy_trend"]) == 12


def test_dashboard_pj_cannot_access_other_program(pj_gizi_tok, admin_tok):
    # find a non-gizi program id
    r = requests.get(f"{API}/programs", headers=_h(admin_tok), timeout=30)
    programs = r.json()
    other = next(p for p in programs if "Gizi" not in p["name"])
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 9, "program_id": other["id"]},
                     headers=_h(pj_gizi_tok), timeout=30)
    assert r.status_code == 403


# ---- YoY integration: create Sep 2025 KIA report, verify tahun_lalu populated ----

@pytest.fixture(scope="module")
def kia_program(admin_tok):
    r = requests.get(f"{API}/programs", headers=_h(admin_tok), timeout=30)
    return next(p for p in r.json() if "Kesehatan Ibu" in p["name"] or "KIA" in p["name"])


def test_yoy_integration_create_prev_year_report(pj_kia_tok, kia_program, admin_tok):
    """Create Sep 2025 KIA report, submit, check dashboard Sep 2026 shows tahun_lalu."""
    pid = kia_program["id"]
    # Baseline - get current yoy_spm KIA tahun_lalu
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2026, "period": "bulanan", "month": 9},
                     headers=_h(pj_kia_tok), timeout=30)
    baseline = r.json()
    baseline_prev = next((s["tahun_lalu"] for s in baseline["yoy_spm"] if s["nama"] == kia_program["name"]), None)

    # Check if report already exists; create or reuse
    r = requests.post(f"{API}/reports",
                      json={"program_id": pid, "year": 2025, "month": 9},
                      headers=_h(pj_kia_tok), timeout=30)
    assert r.status_code == 200, r.text
    report = r.json()
    rid = report["id"]
    initial_status = report["status"]

    try:
        # If already submitted (prior test run), skip fill/submit — just verify YoY
        if initial_status in ("draf", "perlu_perbaikan"):
            items = []
            for it in report["items"]:
                items.append({
                    "indicator_id": it["indicator_id"],
                    "sasaran": 100.0,
                    "target": it.get("target"),
                    "capaian": 60.0,
                    "keterangan": "TEST_yoy"
                })
            r = requests.put(f"{API}/reports/{rid}",
                             json={"items": items, "kendala": "", "upaya": "", "hasil_upaya": "",
                                   "rtl": "", "dukungan": "", "note": "TEST_yoy"},
                             headers=_h(pj_kia_tok), timeout=30)
            assert r.status_code == 200, r.text
            r = requests.post(f"{API}/reports/{rid}/submit", headers=_h(pj_kia_tok), timeout=30)
            assert r.status_code == 200, r.text

        # Dashboard Sep 2026 should now have tahun_lalu populated
        r = requests.get(f"{API}/dashboard",
                         params={"year": 2026, "period": "bulanan", "month": 9},
                         headers=_h(pj_kia_tok), timeout=30)
        d = r.json()
        kia_row = next(s for s in d["yoy_spm"] if s["nama"] == kia_program["name"])
        assert kia_row["tahun_lalu"] is not None, f"expected tahun_lalu populated, got {kia_row}"
        # Expected 60% average across indicators (100 sasaran / 60 capaian for all)
        assert kia_row["tahun_lalu"] == 60.0, f"expected 60.0, got {kia_row['tahun_lalu']}"

        # yoy_trend Sep must have tahun_lalu
        sep = next(row for row in d["yoy_trend"] if row["bulan"] == "Sep")
        assert sep["tahun_lalu"] is not None

        # summary.rata_persen_lalu populated
        assert d["summary"]["rata_persen_lalu"] is not None

        # per-indicator selisih computed (current% - prev%)
        kia_prog = next(p for p in d["programs"] if p["id"] == pid)
        for i in kia_prog["indicators"]:
            if i["recap"]["persen"] is not None:
                assert i["recap_prev"]["persen"] == 60.0
                assert i["selisih"] == round(i["recap"]["persen"] - 60.0, 2)

        # Triwulan III 2026 should also show tahun_lalu
        r = requests.get(f"{API}/dashboard",
                         params={"year": 2026, "period": "triwulan", "quarter": 3},
                         headers=_h(pj_kia_tok), timeout=30)
        d = r.json()
        kia_row = next(s for s in d["yoy_spm"] if s["nama"] == kia_program["name"])
        assert kia_row["tahun_lalu"] is not None
    finally:
        # Cleanup: delete the created Sep 2025 report via mongo (through admin API not exposed - use direct)
        # No admin API to delete reports. Leave data; tests are idempotent via create_report upsert-ish.
        # But revert items to empty to avoid pollution of other tests isn't necessary.
        pass


def test_dashboard_missing_prev_year_returns_null_not_zero(admin_tok):
    """For a period where no prev-year reported data exists, tahun_lalu must be null (not 0)."""
    # Use 2030 (future) which has no 2029 data
    r = requests.get(f"{API}/dashboard",
                     params={"year": 2030, "period": "bulanan", "month": 3},
                     headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["summary"]["rata_persen_lalu"] is None
    for row in d["yoy_spm"]:
        assert row["tahun_lalu"] is None
    for row in d["yoy_trend"]:
        assert row["tahun_lalu"] is None
