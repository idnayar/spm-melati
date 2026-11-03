import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";

const DEMO = [
  { label: "Kepala Puskesmas", email: "kepala@puskesmas-melati.test", pw: "Kepala@2026" },
  { label: "PJ KIA", email: "pj.kia@puskesmas-melati.test", pw: "Pj@2026" },
  { label: "PJ Gizi", email: "pj.gizi@puskesmas-melati.test", pw: "Pj@2026" },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard/spm" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await login(email, password); nav("/dashboard/spm"); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#1A4D3A] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative rounded-2xl bg-white/95 px-6 py-4 shadow-xl w-fit"><img src="/logo.png" alt="MELATI Program Hub" className="h-16" /></div>
        <div className="relative max-w-lg animate-rise">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">UPT Puskesmas Melati</div>
          <h1 className="font-display text-5xl font-bold leading-[1.05]">Satu ruang untuk laporan, evaluasi, dan tindak lanjut SPM & program.</h1>
          <p className="mt-6 text-emerald-100/90">Capaian bulanan, rekap triwulan & tahunan, analisis SWOT dan fishbone berbasis data, hingga presentasi siap tayang.</p>
        </div>
        <div className="relative grid grid-cols-3 gap-4 text-sm">
          {["Draf", "Diajukan", "Disetujui"].map((s, i) => (
            <div key={s} className="rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-md"><div className="font-mono text-xs text-emerald-200">0{i + 1}</div><div className="mt-1 font-semibold">{s}</div></div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center bg-[#F8FAF7] px-5 py-12">
        <div className="w-full max-w-md animate-rise">
          <img src="/logo.png" alt="MELATI Program Hub" className="mb-8 h-14 lg:hidden" />
          <h2 className="font-display text-3xl font-bold text-[#12372A]">Masuk</h2>
          <p className="mt-2 text-sm text-slate-600">Gunakan akun yang diberikan admin puskesmas.</p>
          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <Input data-testid="login-email-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 bg-white" />
            <Input data-testid="login-password-input" type="password" placeholder="Kata sandi" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 bg-white" />
            <Button data-testid="login-submit-button" disabled={busy} className="btn-primary h-12 w-full rounded-xl text-base">{busy ? "Memproses…" : "Masuk"}</Button>
          </form>
          <div className="mt-10 rounded-2xl border border-[#DCE7DF] bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700">Akun demo</div>
            <div className="flex flex-wrap gap-2">
              {DEMO.map((d) => (
                <button key={d.email} type="button" data-testid={`demo-login-${d.label.replace(/\s/g, "-").toLowerCase()}`} onClick={() => { setEmail(d.email); setPassword(d.pw); }}
                  className="rounded-full border border-[#CFE0D4] px-3 py-1.5 text-xs font-medium text-[#1A4D3A] transition-colors hover:bg-[#EEF4EF]">{d.label}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
