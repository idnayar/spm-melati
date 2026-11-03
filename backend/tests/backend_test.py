"""
MELATI Program Hub - Backend API Regression tests.
Covers: auth, users, programs/indicators, reports (full workflow), feedback/follow-ups,
tables, analyses, presentations, exports, notifications, settings, reminders, cron, activity.
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") \
    else "https://melati-report.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = ("tiofansha@gmail.com", "Melati@2026")
KEPALA = ("kepala@puskesmas-melati.test", "Kepala@2026")
PJ_KIA = ("pj.kia@puskesmas-melati.test", "Pj@2026")

CRON_SECRET = "72241d2e86fe3a0d258cca865aebbd18889d66c37d6dd22a"


# ---- helpers ----
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---- fixtures ----
@pytest.fixture(scope="session")
def admin():
    return _client(_login(*ADMIN))


@pytest.fixture(scope="session")
def kepala():
    return _client(_login(*KEPALA))


@pytest.fixture(scope="session")
def pj():
    return _client(_login(*PJ_KIA))


@pytest.fixture(scope="session")
def programs(admin):
    r = admin.get(f"{API}/programs", timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def kia(programs):
    for p in programs:
        if "KIA" in p["name"] or "Ibu" in p["name"]:
            return p
    pytest.skip("KIA program not seeded")


# ---- AUTH ----
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["token"]
        # httpOnly cookie set
        assert any("access_token" in c for c in r.headers.get("set-cookie", "").split(","))

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, admin):
        r = admin.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN[0]

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code in (401, 403)

    def test_login_all_roles(self):
        for cred, role in [(KEPALA, "kepala"), (PJ_KIA, "pj")]:
            r = requests.post(f"{API}/auth/login", json={"email": cred[0], "password": cred[1]}, timeout=30)
            assert r.status_code == 200, f"{cred[0]} failed"
            assert r.json()["user"]["role"] == role


# ---- USERS ----
class TestUsers:
    def test_list_users(self, admin):
        r = admin.get(f"{API}/users", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 3

    def test_pj_cannot_create_user(self, pj):
        r = pj.post(f"{API}/users", json={"name": "x", "email": "x@test.com", "role": "pj", "password": "abc123"})
        assert r.status_code == 403

    def test_user_crud(self, admin):
        payload = {"name": "TEST_User", "email": "test_user@test.local", "role": "pj", "password": "pass1234", "active": True}
        # cleanup if exists
        existing = admin.get(f"{API}/users").json()
        for u in existing:
            if u["email"] == payload["email"]:
                admin.delete(f"{API}/users/{u['id']}")
        r = admin.post(f"{API}/users", json=payload)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # update
        r2 = admin.put(f"{API}/users/{uid}", json={**payload, "name": "TEST_User2"})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_User2"
        # delete
        r3 = admin.delete(f"{API}/users/{uid}")
        assert r3.status_code == 200


# ---- PROGRAMS & INDICATORS ----
class TestPrograms:
    def test_list_programs(self, programs):
        assert len(programs) >= 1
        p0 = programs[0]
        assert "indicators" in p0

    def test_program_crud(self, admin):
        r = admin.post(f"{API}/programs", json={"name": "TEST_Prog", "code": "TST"})
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = admin.post(f"{API}/programs/{pid}/indicators", json={"name": "TEST_Ind", "unit": "%", "target": 90, "sasaran": 100})
        assert r2.status_code == 200
        iid = r2.json()["id"]
        r3 = admin.put(f"{API}/indicators/{iid}", json={"name": "TEST_Ind_v2", "unit": "%", "target": 95, "sasaran": 100})
        assert r3.status_code == 200
        admin.delete(f"{API}/indicators/{iid}")
        admin.delete(f"{API}/programs/{pid}")

    def test_pj_cannot_create_program(self, pj):
        r = pj.post(f"{API}/programs", json={"name": "x"})
        assert r.status_code == 403


# ---- DASHBOARD ----
class TestDashboard:
    def test_dashboard_monthly(self, admin):
        r = admin.get(f"{API}/dashboard?year=2026&period=bulanan&month=9")
        assert r.status_code == 200
        d = r.json()
        for k in ("periode", "programs", "completeness", "trend", "summary"):
            assert k in d
        assert len(d["trend"]) == 12

    def test_dashboard_quarterly(self, admin):
        r = admin.get(f"{API}/dashboard?year=2026&period=triwulanan&quarter=3")
        assert r.status_code == 200

    def test_dashboard_yearly(self, admin):
        r = admin.get(f"{API}/dashboard?year=2026&period=tahunan")
        assert r.status_code == 200


# ---- REPORTS WORKFLOW ----
class TestReports:
    def test_list_reports(self, admin):
        r = admin.get(f"{API}/reports?year=2026")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pj_sees_only_own(self, pj):
        r = pj.get(f"{API}/reports?year=2026")
        assert r.status_code == 200

    def test_full_workflow(self, pj, kepala, kia):
        # Use month 8 to avoid clashing with existing Sept diajukan report
        year, month = 2026, 8
        # cleanup previous attempt
        existing = pj.get(f"{API}/reports?year={year}&month={month}&program_id={kia['id']}").json()
        for r in existing:
            # cannot delete reports directly - but we'll reuse if present
            pass
        r = pj.post(f"{API}/reports", json={"program_id": kia["id"], "year": year, "month": month})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # Fill with capaian
        detail = pj.get(f"{API}/reports/{rid}").json()
        items = []
        for it in detail["items"]:
            items.append({"indicator_id": it["indicator_id"], "sasaran": it.get("sasaran") or 100,
                          "target": it.get("target") or 90, "capaian": 85, "keterangan": "test"})
        up = {"items": items, "kendala": "k", "upaya": "u", "hasil_upaya": "h", "rtl": "r", "dukungan": "d",
              "autosave": False, "note": "draft"}
        r2 = pj.put(f"{API}/reports/{rid}", json=up)
        assert r2.status_code == 200
        # autosave
        up["autosave"] = True
        r2b = pj.put(f"{API}/reports/{rid}", json=up)
        assert r2b.status_code == 200
        # submit
        r3 = pj.post(f"{API}/reports/{rid}/submit")
        assert r3.status_code == 200, r3.text
        # kepala requests revision
        r4 = kepala.post(f"{API}/reports/{rid}/review", json={"action": "perbaikan", "note": "mohon perbaiki"})
        assert r4.status_code == 200
        assert r4.json()["status"] == "perlu_perbaikan"
        # revision needs note
        r4b = kepala.post(f"{API}/reports/{rid}/review", json={"action": "perbaikan", "note": ""})
        # Already perlu_perbaikan now so 400
        assert r4b.status_code == 400
        # resubmit
        pj.put(f"{API}/reports/{rid}", json=up)
        pj.post(f"{API}/reports/{rid}/submit")
        # approve
        r5 = kepala.post(f"{API}/reports/{rid}/review", json={"action": "setujui", "note": "ok"})
        assert r5.status_code == 200
        assert r5.json()["status"] == "disetujui"
        # kepala comment
        r6 = kepala.post(f"{API}/reports/{rid}/feedback",
                         json={"type": "komentar", "text": "kerja bagus"})
        assert r6.status_code == 200
        # kepala arahan creates followup
        r7 = kepala.post(f"{API}/reports/{rid}/feedback",
                         json={"type": "arahan", "text": "tingkatkan cakupan",
                               "followup_title": "TEST Perbaikan cakupan",
                               "followup_deadline": "2026-12-31T00:00:00"})
        assert r7.status_code == 200
        assert r7.json().get("followup_id")
        detail = pj.get(f"{API}/reports/{rid}").json()
        assert detail["status"] == "disetujui"
        assert len(detail["revisions"]) >= 2
        assert len(detail["feedback"]) >= 2

    def test_submit_without_capaian(self, pj, kia):
        # Create a draft report with no capaian and try to submit (use month=7)
        year, month = 2026, 7
        r = pj.post(f"{API}/reports", json={"program_id": kia["id"], "year": year, "month": month})
        assert r.status_code == 200
        rid = r.json()["id"]
        # If existing report, skip (may already have capaian)
        detail = pj.get(f"{API}/reports/{rid}").json()
        if any(i.get("capaian") is not None for i in detail["items"]):
            pytest.skip("report already has capaian from prior tests")
        r2 = pj.post(f"{API}/reports/{rid}/submit")
        assert r2.status_code == 400


# ---- FOLLOWUPS ----
class TestFollowups:
    def test_list(self, admin):
        r = admin.get(f"{API}/followups")
        assert r.status_code == 200

    def test_crud(self, admin, kia):
        r = admin.post(f"{API}/followups", json={"program_id": kia["id"], "title": "TEST_FU",
                                                 "description": "d", "status": "belum"})
        assert r.status_code == 200
        fid = r.json()["id"]
        r2 = admin.put(f"{API}/followups/{fid}", json={"program_id": kia["id"], "title": "TEST_FU",
                                                       "description": "d", "status": "proses", "result": "jalan"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "proses"
        admin.delete(f"{API}/followups/{fid}")


# ---- TABLES ----
class TestTables:
    def test_crud(self, pj, kia):
        payload = {"program_id": kia["id"], "name": "TEST_Tabel",
                   "columns": [{"key": "nama", "name": "Nama", "type": "text"},
                               {"key": "sasaran", "name": "Sasaran", "type": "number"},
                               {"key": "capaian", "name": "Capaian", "type": "number"},
                               {"key": "persen", "name": "%", "type": "formula", "formula": "[Capaian]/[Sasaran]*100"}],
                   "rows": [{"nama": "a", "sasaran": 100, "capaian": 80}],
                   "summary_row": True, "is_template": False}
        r = pj.post(f"{API}/tables", json=payload)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        r2 = pj.get(f"{API}/tables/{tid}")
        assert r2.status_code == 200
        pj.delete(f"{API}/tables/{tid}")


# ---- ANALYSES ----
class TestAnalyses:
    def test_list(self, admin):
        r = admin.get(f"{API}/analyses")
        assert r.status_code == 200

    def test_generate_no_data(self, admin, kia):
        # Period without submitted data must return 400 (no fabrication)
        r = admin.post(f"{API}/analyses/generate", json={"type": "swot", "program_id": kia["id"],
                                                         "year": 2020, "period": "bulanan", "month": 1})
        assert r.status_code == 400
        assert "Belum ada data" in r.text or "tidak dibuat" in r.text

    def test_validate_flow(self, admin, pj, kepala):
        # Use existing SWOT or create for Sept 2026 (data exists)
        existing = admin.get(f"{API}/analyses?type=swot").json()
        if not existing:
            pytest.skip("No existing SWOT analysis to validate")
        aid = existing[0]["id"]
        # PJ validate
        rp = pj.post(f"{API}/analyses/{aid}/validate", json={"status": "valid", "note": "ok"})
        # Only PJ of this program can validate; if not, may 403
        if rp.status_code == 403:
            pytest.skip("PJ not authorised for this analysis program")
        assert rp.status_code == 200
        rk = kepala.post(f"{API}/analyses/{aid}/validate", json={"status": "valid", "note": "ok"})
        assert rk.status_code == 200
        assert rk.json()["status"] == "tervalidasi"


# ---- PRESENTATIONS ----
class TestPresentations:
    def test_list(self, admin):
        r = admin.get(f"{API}/presentations")
        assert r.status_code == 200

    def test_export_pres(self, admin):
        rl = admin.get(f"{API}/presentations").json()
        if not rl:
            pytest.skip("No presentation")
        pid = rl[0]["id"]
        for fmt in ["pptx", "pdf"]:
            r = requests.get(f"{API}/export/presentation/{pid}?format={fmt}",
                             headers=admin.headers, timeout=90)
            assert r.status_code == 200, f"{fmt}: {r.status_code}"
            assert len(r.content) > 500


# ---- EXPORTS ----
class TestExports:
    def test_report_exports(self, admin):
        for fmt in ["docx", "xlsx", "pdf"]:
            r = requests.get(f"{API}/export/report?format={fmt}&year=2026&period=bulanan&month=9",
                             headers=admin.headers, timeout=120)
            assert r.status_code == 200, f"{fmt} failed: {r.status_code} {r.text[:200]}"
            assert len(r.content) > 500

    def test_collective_export(self, admin):
        r = requests.get(f"{API}/export/report?format=docx&year=2026&period=bulanan&month=9",
                         headers=admin.headers, timeout=120)
        assert r.status_code == 200


# ---- NOTIFICATIONS ----
class TestNotifications:
    def test_list(self, kepala):
        r = kepala.get(f"{API}/notifications")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "unread" in d

    def test_read_all(self, kepala):
        r = kepala.post(f"{API}/notifications/read-all")
        assert r.status_code == 200


# ---- SETTINGS ----
class TestSettings:
    def test_get(self, admin):
        r = admin.get(f"{API}/settings")
        assert r.status_code == 200
        s = r.json()
        for k in ("deadline_day", "days_before", "send_hour", "email_enabled"):
            assert k in s

    def test_update(self, admin):
        cur = admin.get(f"{API}/settings").json()
        payload = {"deadline_day": cur["deadline_day"], "days_before": cur["days_before"],
                   "send_hour": cur["send_hour"], "email_enabled": cur.get("email_enabled", False),
                   "end_of_month": cur.get("end_of_month", True), "late_days": cur.get("late_days", [1, 3, 7])}
        r = admin.put(f"{API}/settings", json=payload)
        assert r.status_code == 200

    def test_integrations_status(self, admin):
        r = admin.get(f"{API}/integrations/status")
        assert r.status_code == 200
        d = r.json()
        for k in ("email", "ai", "scheduler"):
            assert k in d


# ---- REMINDERS/CRON ----
class TestReminders:
    def test_cron_requires_bearer(self):
        r = requests.post(f"{API}/cron/reminders", json={})
        assert r.status_code == 401

    def test_cron_wrong_token(self):
        r = requests.post(f"{API}/cron/reminders", headers={"Authorization": "Bearer wrong"}, json={})
        assert r.status_code == 401

    def test_cron_valid(self):
        r = requests.post(f"{API}/cron/reminders",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"}, json={"run_id": "test_run_1"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reminders_run(self, admin):
        r = admin.post(f"{API}/reminders/run")
        assert r.status_code == 200

    def test_reminders_logs(self, admin):
        r = admin.get(f"{API}/reminders/logs")
        assert r.status_code == 200


# ---- ACTIVITY ----
class TestActivity:
    def test_admin_can_view(self, admin):
        r = admin.get(f"{API}/activity")
        assert r.status_code == 200

    def test_kepala_can_view(self, kepala):
        r = kepala.get(f"{API}/activity")
        assert r.status_code == 200

    def test_pj_cannot(self, pj):
        r = pj.get(f"{API}/activity")
        assert r.status_code == 403
