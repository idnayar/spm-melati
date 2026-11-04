import os
import json
import re
import logging
from google import genai
from google.genai import types
from core import new_id, MONTHS
from recap import build_dataset

logger = logging.getLogger(__name__)

# Menggunakan model Gemini Flash yang cepat dan hemat kuota
AI_MODEL = "gemini-3-flash-preview"

BASE_RULES = """Anda analis SPM dan program kesehatan Puskesmas. Gunakan Bahasa Indonesia.
ISTILAH: data dapat berupa SPM (Standar Pelayanan Minimal) atau program puskesmas; masing-masing memiliki indikator. Gunakan istilah sesuai jenisnya.
ATURAN KETAT:
- Gunakan HANYA data yang diberikan. Jangan mengarang angka, penyebab, kejadian, atau referensi ilmiah.
- Setiap butir wajib memiliki "jenis": "fakta" (tertulis langsung di data) atau "dugaan" (inferensi yang perlu diverifikasi).
- Setiap butir wajib mencantumkan "sumber" yang menunjuk bagian data (mis. "Laporan Maret 2026 - Kendala", "Rekap program X").
- Data bernilai null berarti "Belum tersedia", bukan nol. Jangan menganggapnya nol.
- Jika data tidak cukup, kosongkan daftar atau tulis dugaan dengan jelas, jangan mengisi dengan informasi umum yang tidak ada di data.
- Keluarkan HANYA JSON valid tanpa teks lain."""

SWOT_REFS = [
    "Analisis SWOT (Albert S. Humphrey, Stanford Research Institute, 1960-an)",
    "Matriks TOWS (Heinz Weihrich, 'The TOWS Matrix - A Tool for Situational Analysis', Long Range Planning, 1982)"
]
FISH_REFS = [
    "Diagram sebab-akibat/fishbone (Kaoru Ishikawa)",
    "Teknik 5 Why (Sakichi Toyoda; dipopulerkan dalam Toyota Production System oleh Taiichi Ohno)"
]


def _get_api_key():
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")


def ai_available():
    return bool(_get_api_key())


def _parse_json(text):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1:
        raise ValueError(f"Output model tidak mengandung JSON yang valid: {text}")
    return json.loads(text[s:e + 1])


async def ai_json(prompt):
    api_key = _get_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY atau EMERGENT_LLM_KEY belum disetel di environment variable.")

    client = genai.Client(api_key=api_key)

    # Memaksa model merespons langsung dalam format JSON valid
    response = client.models.generate_content(
        model=AI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=BASE_RULES,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )
    return _parse_json(response.text)


def compact_context(ds, followups):
    progs = []
    for p in ds["programs"]:
        progs.append({
            "nama": p["name"],
            "jenis": "SPM" if p.get("kind") == "spm" else "Program",
            "pj": p.get("pj_name"),
            "indikator": [
                {
                    "nama": i["name"],
                    "satuan": i.get("unit"),
                    "metode": i.get("method"),
                    "sasaran": i["recap"]["sasaran"],
                    "target_persen_periode": i["recap"]["target_periode"],
                    "capaian": i["recap"]["capaian"],
                    "persen_capaian": i["recap"]["persen"],
                    "status": i["recap"]["status"],
                    "bulan_terlapor": [MONTHS[m - 1] for m in i["recap"]["bulan_terlapor"]]
                }
                for i in p["indicators"]
            ],
            "narasi_laporan": p["narasi"]
        })
    return json.dumps({
        "periode": ds["periode"],
        "program": progs,
        "tindak_lanjut": [
            {
                "judul": f["title"],
                "status": f["status"],
                "tenggat": f.get("deadline"),
                "hasil": f.get("result", "")
            }
            for f in followups
        ]
    }, ensure_ascii=False, default=str)


def has_data(ds):
    return any(i["recap"]["status"] != "belum_tersedia" for p in ds["programs"] for i in p["indicators"]) or \
        any(p["narasi"] for p in ds["programs"])


SWOT_PROMPT = """Susun analisis SWOT dan strategi TOWS dari DATA berikut.
Kekuatan/Kelemahan = faktor internal yang tampak di data. Peluang/Ancaman = faktor eksternal; jika data tidak menyebutkan faktor eksternal secara eksplisit, tandai sebagai "dugaan".
Format JSON:
{{"kekuatan":[{{"teks":"","jenis":"fakta|dugaan","sumber":""}}],"kelemahan":[...],"peluang":[...],"ancaman":[...],
"strategi":{{"SO":[{{"teks":"","dasar":"butir SWOT yang dipakai"}}],"WO":[...],"ST":[...],"WT":[...]}},
"keterbatasan_data":"catatan singkat data apa yang belum tersedia"}}
DATA:
{ctx}"""

FISH_PROMPT = """Buat analisis fishbone (Ishikawa) dan 5 Why untuk masalah: "{masalah}".
Gunakan kategori: Manusia, Metode, Material, Sarana, Dana, Lingkungan. Penyebab yang tidak tertulis di data WAJIB berjenis "dugaan" dan perlu verifikasi.
Format JSON:
{{"masalah":"","dasar_masalah":{{"teks":"bukti masalah dari data","sumber":""}},
"kategori":{{"Manusia":[{{"teks":"","jenis":"fakta|dugaan","bukti":"bukti dari data atau 'Belum ada bukti'","sumber":"","verifikasi":"cara/kebutuhan verifikasi"}}],"Metode":[],"Material":[],"Sarana":[],"Dana":[],"Lingkungan":[]}},
"lima_why":[{{"tanya":"Mengapa ...?","jawab":"","jenis":"fakta|dugaan","sumber":""}}],
"akar_masalah":{{"teks":"","jenis":"fakta|dugaan"}},
"rekomendasi":[{{"teks":"","terkait":"penyebab yang ditangani","prioritas":"tinggi|sedang|rendah"}}],
"keterbatasan_data":""}}
DATA:
{ctx}"""

PRES_PROMPT = """Tulis analisis singkat capaian untuk slide presentasi (maks 5 butir) dari DATA berikut.
Format JSON: {{"analisis":[{{"teks":"","jenis":"fakta|dugaan","sumber":""}}]}}
DATA:
{ctx}"""


async def context_for(program_id, year, period, month, quarter, db, include_draft=False):
    ds = await build_dataset(year, period, month, quarter, program_id, include_draft)
    fus = await db.followups.find({"program_id": program_id}, {"_id": 0}).to_list(100) if program_id else []
    return ds, compact_context(ds, fus)
