import os
from core import db, new_id, now_iso, hash_password, verify_password, get_settings

DEMO_PASSWORD_PJ = "Pj@2026"
DEMO_PASSWORD_KEPALA = "Kepala@2026"

USERS = [
    ("kepala@puskesmas-melati.test", "Kepala Puskesmas Melati", "kepala", DEMO_PASSWORD_KEPALA),
    ("pj.kia@puskesmas-melati.test", "PJ SPM KIA", "pj", DEMO_PASSWORD_PJ),
    ("pj.gizi@puskesmas-melati.test", "PJ SPM Gizi", "pj", DEMO_PASSWORD_PJ),
    ("pj.imunisasi@puskesmas-melati.test", "PJ SPM Imunisasi", "pj", DEMO_PASSWORD_PJ),
    ("pj.tb@puskesmas-melati.test", "PJ SPM P2P TB", "pj", DEMO_PASSWORD_PJ),
]

PROGRAMS = [
    ("KIA", "Kesehatan Ibu dan Anak", "pj.kia@puskesmas-melati.test", [
        ("Pelayanan kesehatan ibu hamil sesuai standar", "ibu hamil", 100, "kumulatif"),
        ("Pelayanan kesehatan ibu bersalin sesuai standar", "ibu bersalin", 100, "kumulatif"),
        ("Pelayanan kesehatan bayi baru lahir sesuai standar", "bayi", 100, "kumulatif")]),
    ("GIZI", "Gizi Masyarakat", "pj.gizi@puskesmas-melati.test", [
        ("Balita ditimbang (D/S)", "balita", None, "rasio"),
        ("Remaja putri mendapat tablet tambah darah", "remaja putri", None, "kumulatif"),
        ("Balita gizi kurang (posisi bulan terakhir)", "balita", None, "terakhir")]),
    ("IMUN", "Imunisasi", "pj.imunisasi@puskesmas-melati.test", [
        ("Imunisasi dasar lengkap pada bayi", "bayi", None, "kumulatif")]),
    ("TB", "P2P Tuberkulosis", "pj.tb@puskesmas-melati.test", [
        ("Pelayanan kesehatan orang terduga TB sesuai standar", "orang", 100, "kumulatif")]),
]


SPM_LIST = [
    ("Pelayanan Kesehatan Ibu Hamil", "Ibu hamil mendapatkan pelayanan kesehatan sesuai standar", "ibu hamil", "Jumlah ibu hamil yang ada di wilayah kerja dalam kurun waktu 1 tahun"),
    ("Pelayanan Kesehatan Ibu Bersalin", "Ibu bersalin mendapatkan pelayanan persalinan sesuai standar", "ibu bersalin", "Jumlah semua ibu bersalin yang ada di wilayah kerja dalam kurun waktu 1 tahun"),
    ("Pelayanan Kesehatan Bayi Baru Lahir", "Bayi baru lahir mendapatkan pelayanan kesehatan sesuai standar", "bayi", "Jumlah semua bayi baru lahir yang ada di wilayah kerja dalam kurun waktu 1 tahun"),
    ("Pelayanan Kesehatan Anak Balita", "Balita mendapatkan pelayanan kesehatan sesuai standar", "balita", "Jumlah balita 0-59 bulan yang ada di wilayah kerja dalam kurun waktu 1 tahun yang sama"),
    ("Pelayanan Kesehatan pada Usia Pendidikan Dasar", "Anak usia pendidikan dasar mendapatkan skrining kesehatan sesuai standar", "anak", "Jumlah semua anak usia pendidikan dasar kelas 1 & 7 di wilayah kerja dalam satu tahun ajaran"),
    ("Pelayanan Kesehatan pada Usia Produktif", "Warga usia 15-59 tahun mendapatkan skrining kesehatan sesuai standar", "orang", "Jumlah warga negara usia 15-59 tahun di wilayah kerja dalam kurun waktu 1 tahun yang sama"),
    ("Pelayanan Kesehatan pada Usia Lanjut", "Warga usia 60 tahun ke atas mendapatkan skrining kesehatan sesuai standar", "orang", "Jumlah semua penduduk berusia 60 tahun ke atas di wilayah kerja dalam kurun waktu satu tahun"),
    ("Pelayanan Kesehatan Penderita Hipertensi", "Penderita hipertensi mendapatkan pelayanan kesehatan sesuai standar", "orang", "Jumlah estimasi penderita hipertensi berdasarkan prevalensi dalam kurun waktu satu tahun"),
    ("Pelayanan Kesehatan Penderita Diabetes Melitus", "Penyandang DM mendapatkan pelayanan kesehatan sesuai standar", "orang", "Jumlah penyandang DM berdasarkan angka prevalensi nasional di wilayah kerja dalam satu tahun"),
    ("Pelayanan Kesehatan Orang dengan Gangguan Jiwa (ODGJ) Berat", "ODGJ berat mendapatkan pelayanan kesehatan jiwa sesuai standar", "orang", "Jumlah ODGJ berat (psikotik) di wilayah kerja dalam kurun waktu satu tahun yang sama"),
    ("Pelayanan Kesehatan Orang Terduga Tuberkulosis", "Orang terduga TB mendapatkan pelayanan kesehatan sesuai standar", "orang", "Jumlah orang terduga TB di wilayah kerja dalam kurun waktu satu tahun yang sama"),
    ("Pelayanan Kesehatan Orang dengan Risiko Terinfeksi HIV", "Orang berisiko terinfeksi HIV mendapatkan pemeriksaan HIV sesuai standar", "orang", "Jumlah orang berisiko terinfeksi HIV di wilayah kerja dalam kurun waktu satu tahun yang sama"),
]


async def seed_spm():
    await db.programs.update_many({"kind": {"$exists": False}}, {"$set": {"kind": "program"}})
    if await db.meta.find_one({"key": "seeded_spm"}):
        return
    for k, (name, ind, unit, sasaran_def) in enumerate(SPM_LIST, 1):
        pid = new_id()
        await db.programs.insert_one({"id": pid, "kind": "spm", "code": f"SPM-{k:02d}", "name": name, "description": "",
                                      "labels": ["SPM"], "profile": [], "pj_user_id": None, "created_at": now_iso()})
        await db.indicators.insert_one({"id": new_id(), "program_id": pid, "name": ind, "unit": unit, "target": 100,
                                        "sasaran": None, "method": "kumulatif", "order": 0, "created_at": now_iso(),
                                        "definition": f"Sasaran: {sasaran_def}. Capaian dibagi sasaran x 100%."})
    await db.meta.insert_one({"key": "seeded_spm", "at": now_iso()})


async def seed_all():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    ex = await db.users.find_one({"email": admin_email})
    if not ex:
        await db.users.insert_one({"id": new_id(), "email": admin_email, "name": "Admin Melati", "role": "admin",
                                   "active": True, "password_hash": hash_password(admin_pw), "created_at": now_iso()})
    elif not verify_password(admin_pw, ex["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
    await get_settings()
    if await db.meta.find_one({"key": "seeded"}):
        return await seed_spm()
    ids = {}
    for email, name, role, pw in USERS:
        u = await db.users.find_one({"email": email})
        if not u:
            uid = new_id()
            await db.users.insert_one({"id": uid, "email": email, "name": name, "role": role, "active": True,
                                       "password_hash": hash_password(pw), "created_at": now_iso()})
        ids[email] = u["id"] if u else uid
    for code, name, pj, inds in PROGRAMS:
        pid = new_id()
        await db.programs.insert_one({"id": pid, "code": code, "name": name, "description": "",
                                      "pj_user_id": ids.get(pj), "kind": "program", "created_at": now_iso()})
        for k, (iname, unit, target, method) in enumerate(inds):
            await db.indicators.insert_one({"id": new_id(), "program_id": pid, "name": iname, "unit": unit,
                                            "target": target, "sasaran": None, "method": method,
                                            "definition": "", "order": k, "created_at": now_iso()})
    await db.meta.insert_one({"key": "seeded", "at": now_iso()})
    await seed_spm()
