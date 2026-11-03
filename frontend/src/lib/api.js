import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const TOKEN_KEY = "melati_token";
export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config?.url?.includes("/auth/")) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(e);
  }
);

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Terjadi kesalahan. Coba lagi.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.msg || String(d);
}

export async function download(url, params = {}) {
  const r = await api.get(url, { params, responseType: "blob" });
  const cd = r.headers["content-disposition"] || "";
  const name = decodeURIComponent((cd.match(/filename="?([^"]+)"?/) || [])[1] || "unduhan");
  const href = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const QUARTERS = ["I", "II", "III", "IV"];
export const STATUS = {
  draf: { label: "Draf", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  diajukan: { label: "Diajukan", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  perlu_perbaikan: { label: "Perlu perbaikan", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  disetujui: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  belum_dibuat: { label: "Belum dibuat", cls: "bg-white text-slate-500 border-dashed border-slate-300" },
};
export const RECAP = {
  tercapai: { label: "Tercapai", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  belum_tercapai: { label: "Belum tercapai", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  belum_tersedia: { label: "Belum tersedia", cls: "bg-slate-50 text-slate-500 border-dashed border-slate-300 italic" },
  sasaran_kosong: { label: "Sasaran belum diisi", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  target_kosong: { label: "Target belum ditetapkan", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};
export const TERM = { spm: "SPM", program: "Program" };
export const ROLES = { admin: "Admin", pj: "PJ", kepala: "Kepala Puskesmas" };
export const METHODS = {
  kumulatif: { label: "Kumulatif", hint: "Sasaran = sasaran tahunan (dihitung sekali). Capaian = capaian bulan ini saja, bukan akumulasi." },
  rasio: { label: "Rasio periode", hint: "Sasaran & capaian = angka bulan ini. Rekap = jumlah capaian / jumlah sasaran." },
  terakhir: { label: "Nilai terakhir", hint: "Rekap memakai posisi bulan terakhir yang dilaporkan." },
};
export const FU_STATUS = {
  belum: { label: "Belum dikerjakan", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  proses: { label: "Sedang dikerjakan", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  selesai: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

export const fmtNum = (v, pct = false) =>
  v === null || v === undefined || v === "" ? null : `${Number(v).toLocaleString("id-ID", { maximumFractionDigits: 2 })}${pct ? "%" : ""}`;
export const fmtDate = (s, time = false) =>
  s ? new Date(s).toLocaleString("id-ID", time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : "-";

export const currentPeriod = () => {
  const d = new Date();
  return { year: d.getFullYear(), period: "bulanan", month: d.getMonth() + 1, quarter: Math.floor(d.getMonth() / 3) + 1 };
};
