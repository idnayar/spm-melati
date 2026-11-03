import os
import logging
from pymongo.errors import DuplicateKeyError
from core import db, new_id, now_iso, hash_password, verify_password, get_settings

logger = logging.getLogger("seed")

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
        # Cek apakah indikator SPM sudah ada dari restore database
        existing_spm = await db.programs.find_one({"code": f"SPM-{k:02d}"})
        if not existing_spm:
            pid = new_id()
            await db.programs.insert_one({
                "id": pid, "kind": "spm", "code": f"SPM-{k:02d}", "name": name, "description": "",
                "labels": ["SPM"], "profile": [], "pj_user_id": None, "created_at": now_iso()
            })
            await db.indicators.insert_one({
                "id": new_id(), "program_id": pid, "name": ind, "unit": unit, "target": 100,
                "sasaran": None, "method": "kumulatif", "order": 0, "created_at": now_iso(),
                "definition": f"Sasaran: {sasaran_def}. Capaian dibagi sasaran x 100%."
            })
    
    try:
        await db.meta.insert_one({"key": "seeded_spm", "at": now_iso()})
    except DuplicateKeyError:
        pass


async def seed_all():
    admin_email = os.environ.get("ADMIN_EMAIL", "puskesmasmelati2016@gmail.com").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")

    # Sinkronisasi atau inisialisasi akun admin utama dengan aman
    if admin_email and admin_pw:
        ex = await db.users.find_one({"email": admin_email})
        if not ex:
            try:
                await db.users.insert_one({
                    "id": new_id(),
                    "email": admin_email,
                    "name": "Admin Melati",
                    "role": "admin",
                    "active": True,
                    "password_hash": hash_password(admin_pw),
                    "created_at": now_iso()
                })
            except DuplicateKeyError:
                pass  # Ditangani jika worker lain baru saja meng-insert bersamaan
        else:
            # Perbarui password jika password di env Render berbeda
            current_hash = ex.get("password_hash")
            if not current_hash or not verify_password(admin_pw, current_hash):
                await db.users.update_one(
                    {"email": admin_email},
                    {"$set": {"password_hash": hash_password(admin_pw)}}
                )

    await get_settings()

    # Tandai meta seeded produksi agar tidak pernah menjalankan insert demo
    if not await db.meta.find_one({"key": "seeded"}):
        try:
            await db.meta.insert_one({"key": "seeded", "at": now_iso(), "mode": "production"})
        except DuplicateKeyError:
            pass

    await seed_spm()
