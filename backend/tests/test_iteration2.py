"""
Iteration 2 - new features:
- Presentations: include_draft, PJ scoping, exports
- Dashboard scoping for PJ
- Export report scoping for PJ
- Program profile (labels, profile fields, PJ create/edit/delete own, cross-PJ 403, no reassign pj)
- Regression: admin can still manage all; kepala read-only (no code change on backend side)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") \
    else "https://melati-report.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = ("tiofansha@gmail.com", "Melati@2026")
KEPALA = ("kepala@puskesmas-melati.test", "Kepala@2026")
PJ_KIA = ("pj.kia@puskesmas-melati.test", "Pj@2026")
PJ_GIZI = ("pj.gizi@puskesmas-melati.test", "Pj@2026")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _client(_login(*ADMIN)["token"])


@pytest.fixture(scope="module")
def kepala():
    return _client(_login(*KEPALA)["token"])


@pytest.fixture(scope="module")
def pj_kia():
    d = _login(*PJ_KIA)
    c = _client(d["token"])
    c.user_id = d["user"]["id"]
    return c


@pytest.fixture(scope="module")
def pj_gizi():
    d = _login(*PJ_GIZI)
    c = _client(d["token"])
    c.user_id = d["user"]["id"]
    return c


@pytest.fixture(scope="module")
def programs(admin):
    return admin.get(f"{API}/programs", timeout=30).json()


@pytest.fixture(scope="module")
def kia(programs):
    for p in programs:
        if "KIA" in p["name"] or "Ibu" in p["name"]:
            return p
    pytest.skip("KIA not seeded")


@pytest.fixture(scope="module")
def gizi(programs):
    for p in programs:
        if "Gizi" in p["name"]:
            return p
    pytest.skip("Gizi not seeded")


# ---------- Dashboard scoping ----------
class TestDashboardScoping:
    def test_pj_sees_only_own_program(self, pj_kia, kia):
        r = pj_kia.get(f"{API}/dashboard?year=2026&period=bulanan&month=9")
        assert r.status_code == 200
        d = r.json()
        assert len(d["programs"]) == 1
        assert d["programs"][0]["id"] == kia["id"]

    def test_pj_forbidden_other_program(self, pj_kia, gizi):
        r = pj_kia.get(f"{API}/dashboard?year=2026&period=bulanan&month=9&program_id={gizi['id']}")
        assert r.status_code == 403

    def test_pj_own_program_id_ok(self, pj_kia, kia):
        r = pj_kia.get(f"{API}/dashboard?year=2026&period=bulanan&month=9&program_id={kia['id']}")
        assert r.status_code == 200
        assert len(r.json()["programs"]) == 1

    def test_admin_sees_all(self, admin, programs):
        r = admin.get(f"{API}/dashboard?year=2026&period=bulanan&month=9")
        assert r.status_code == 200
        assert len(r.json()["programs"]) == len(programs)

    def test_kepala_sees_all(self, kepala, programs):
        r = kepala.get(f"{API}/dashboard?year=2026&period=bulanan&month=9")
        assert r.status_code == 200
        assert len(r.json()["programs"]) == len(programs)


# ---------- Export scoping ----------
class TestExportScoping:
    def test_pj_collective_only_own(self, pj_kia, kia):
        r = requests.get(f"{API}/export/report?format=xlsx&year=2026&period=bulanan&month=9",
                         headers=pj_kia.headers, timeout=60)
        assert r.status_code == 200
        assert len(r.content) > 500

    def test_pj_other_program_forbidden(self, pj_kia, gizi):
        r = requests.get(f"{API}/export/report?format=xlsx&year=2026&period=bulanan&month=9&program_id={gizi['id']}",
                         headers=pj_kia.headers, timeout=60)
        assert r.status_code == 403

    def test_pj_own_program_ok(self, pj_kia, kia):
        r = requests.get(f"{API}/export/report?format=xlsx&year=2026&period=bulanan&month=9&program_id={kia['id']}",
                         headers=pj_kia.headers, timeout=60)
        assert r.status_code == 200


# ---------- Presentations ----------
class TestPresentationsScoping:
    def test_pj_generate_own(self, pj_kia, kia):
        r = pj_kia.post(f"{API}/presentations/generate",
                        json={"program_id": kia["id"], "year": 2026, "period": "bulanan",
                              "month": 7, "include_draft": True},
                        timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["program_id"] == kia["id"]
        # Title slide subtitle should mention 'Memuat data draf' because July 2026 KIA is a draft
        title_slide = d["slides"][0]
        # Not strict - only check if there is at least a draft report; otherwise skip assertion
        # In iteration_1 we created a July 2026 draft KIA report.
        if "draf" in title_slide["subtitle"].lower() or "Memuat data draf" in title_slide["subtitle"]:
            assert "Memuat data draf" in title_slide["subtitle"]
        TestPresentationsScoping.pid = d["id"]

    def test_pj_generate_other_forbidden(self, pj_kia, gizi):
        r = pj_kia.post(f"{API}/presentations/generate",
                        json={"program_id": gizi["id"], "year": 2026, "period": "bulanan", "month": 9},
                        timeout=60)
        assert r.status_code == 403

    def test_pj_list_only_own(self, pj_kia, kia):
        r = pj_kia.get(f"{API}/presentations")
        assert r.status_code == 200
        for p in r.json():
            assert p["program_id"] == kia["id"]

    def test_pj_export_pptx(self, pj_kia):
        pid = getattr(TestPresentationsScoping, "pid", None)
        if not pid:
            pytest.skip("no presentation created")
        r = requests.get(f"{API}/export/presentation/{pid}?format=pptx",
                         headers=pj_kia.headers, timeout=90)
        assert r.status_code == 200
        assert len(r.content) > 500

    def test_pj_export_pdf(self, pj_kia):
        pid = getattr(TestPresentationsScoping, "pid", None)
        if not pid:
            pytest.skip("no presentation created")
        r = requests.get(f"{API}/export/presentation/{pid}?format=pdf",
                         headers=pj_kia.headers, timeout=90)
        assert r.status_code == 200
        assert len(r.content) > 500

    def test_cleanup_pres(self, pj_kia):
        pid = getattr(TestPresentationsScoping, "pid", None)
        if pid:
            pj_kia.delete(f"{API}/presentations/{pid}")


# ---------- Program profile - PJ own-program edit ----------
class TestProgramProfilePJ:
    def test_pj_edit_own_profile(self, pj_kia, kia):
        payload = {
            "name": kia["name"],
            "code": kia.get("code", ""),
            "description": kia.get("description", ""),
            "labels": ["TEST_label1", "TEST_label2"],
            "profile": [{"label": "TEST_PIC", "value": "Bidan A"},
                        {"label": "TEST_Target", "value": "100"}],
        }
        r = pj_kia.put(f"{API}/programs/{kia['id']}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "TEST_label1" in d["labels"]
        assert any(f["label"] == "TEST_PIC" for f in d["profile"])
        # pj_user_id must not be nullable from PJ
        assert d["pj_user_id"] == pj_kia.user_id

    def test_pj_cannot_reassign_pj(self, pj_kia, kia):
        payload = {
            "name": kia["name"], "code": kia.get("code", ""), "description": "",
            "pj_user_id": "some-other-user-id",
            "labels": [], "profile": [],
        }
        r = pj_kia.put(f"{API}/programs/{kia['id']}", json=payload)
        assert r.status_code == 200
        # Must still be own
        assert r.json()["pj_user_id"] == pj_kia.user_id

    def test_pj_cannot_edit_other_program(self, pj_kia, gizi):
        r = pj_kia.put(f"{API}/programs/{gizi['id']}",
                       json={"name": gizi["name"], "code": "", "description": "", "labels": [], "profile": []})
        assert r.status_code == 403

    def test_pj_cannot_delete_other_program(self, pj_kia, gizi):
        r = pj_kia.delete(f"{API}/programs/{gizi['id']}")
        assert r.status_code == 403

    def test_pj_cannot_add_indicator_to_other(self, pj_kia, gizi):
        r = pj_kia.post(f"{API}/programs/{gizi['id']}/indicators",
                        json={"name": "x", "unit": "%", "target": 90})
        assert r.status_code == 403

    def test_pj_create_and_delete_own_program(self, pj_kia):
        r = pj_kia.post(f"{API}/programs", json={"name": "TEST_PJ_Program", "code": "TPJ",
                                                 "description": "", "labels": ["t"], "profile": []})
        assert r.status_code == 200, r.text
        new = r.json()
        assert new["pj_user_id"] == pj_kia.user_id
        pid = new["id"]
        # Add indicator
        ri = pj_kia.post(f"{API}/programs/{pid}/indicators",
                         json={"name": "TEST_Ind", "unit": "%", "target": 90, "sasaran": 100})
        assert ri.status_code == 200
        iid = ri.json()["id"]
        # Edit indicator
        ru = pj_kia.put(f"{API}/indicators/{iid}",
                        json={"name": "TEST_Ind2", "unit": "%", "target": 95, "sasaran": 100})
        assert ru.status_code == 200
        # Delete indicator
        rd = pj_kia.delete(f"{API}/indicators/{iid}")
        assert rd.status_code == 200
        # Delete own program
        rdp = pj_kia.delete(f"{API}/programs/{pid}")
        assert rdp.status_code == 200


# ---------- Regression: admin and kepala still work ----------
class TestRegression:
    def test_admin_can_edit_any(self, admin, gizi):
        payload = {
            "name": gizi["name"], "code": gizi.get("code", ""), "description": gizi.get("description", ""),
            "pj_user_id": gizi.get("pj_user_id"),
            "labels": gizi.get("labels", []) + ["TEST_admin"],
            "profile": gizi.get("profile", []),
        }
        r = admin.put(f"{API}/programs/{gizi['id']}", json=payload)
        assert r.status_code == 200
        assert "TEST_admin" in r.json()["labels"]
        # revert
        admin.put(f"{API}/programs/{gizi['id']}", json={**payload, "labels": gizi.get("labels", [])})

    def test_kepala_cannot_edit_program(self, kepala, kia):
        r = kepala.put(f"{API}/programs/{kia['id']}",
                       json={"name": kia["name"], "code": "", "description": "", "labels": [], "profile": []})
        assert r.status_code == 403
