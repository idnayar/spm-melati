import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Sparkles, Clock3, Play, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, errMsg, fmtDate } from "@/lib/api";
import { PageHeader, Card, Field, Empty } from "@/components/common";
import { useAuth } from "@/context/AuthContext";

const STATE = {
  aktif: { label: "Aktif", cls: "bg-emerald-100 text-emerald-800" },
  nonaktif: { label: "Nonaktif", cls: "bg-amber-100 text-amber-800" },
  belum_terkonfigurasi: { label: "Belum aktif", cls: "bg-rose-100 text-rose-700" },
};
const STAGE = { akhir_bulan: "Akhir bulan", sebelum_tenggat: "Sebelum tenggat", terlambat: "Terlambat" };

const Integration = ({ icon: Icon, title, status, detail, testid }) => (
  <Card className="flex items-start gap-4" data-testid={testid}>
    <span className="rounded-xl bg-[#EEF4EF] p-2.5"><Icon className="h-5 w-5 text-[#1A4D3A]" /></span>
    <div className="flex-1">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-800">{title}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE[status]?.cls}`} data-testid={`${testid}-status`}>{STATE[status]?.label}</span></div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  </Card>
);

export default function Settings() {
  const { user } = useAuth();
  const admin = user.role === "admin";
  const [s, setS] = useState(null);
  const [st, setSt] = useState(null);
  const [logs, setLogs] = useState([]);
  const load = () => {
    api.get("/settings").then((r) => setS(r.data));
    api.get("/integrations/status").then((r) => setSt(r.data));
    api.get("/reminders/logs").then((r) => setLogs(r.data));
  };
  useEffect(() => { load(); }, []);
  if (!s || !st) return <div className="text-sm text-slate-500">Memuat…</div>;

  const save = async () => {
    try {
      await api.put("/settings", { deadline_day: Number(s.deadline_day), days_before: Number(s.days_before), send_hour: Number(s.send_hour), email_enabled: s.email_enabled, end_of_month: s.end_of_month, late_days: String(s.late_days).split(",").map((x) => Number(x.trim())).filter((x) => x > 0) });
      toast.success("Pengaturan disimpan"); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const runNow = async () => { try { const { data } = await api.post("/reminders/run"); toast.success(`${data.sent} pengingat dikirim (${data.jobs.map((j) => STAGE[j]).join(", ") || "tidak ada tahap aktif hari ini"})`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const testMail = async () => { try { const { data } = await api.post("/reminders/test-email"); data.ok ? toast.success(`Email uji terkirim ke ${user.email}`) : toast.error(data.info); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div>
      <PageHeader eyebrow="Otomasi" title="Pengingat & Integrasi" subtitle="Notifikasi otomatis sebelum tenggat, pada akhir bulan, dan setelah terlambat — di aplikasi dan melalui email." />
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Integration testid="integration-email" icon={Mail} title="Email pengingat" status={st.email.status} detail={`${st.email.provider}. ${st.email.status === "nonaktif" ? "Aktifkan pengiriman email di pengaturan di bawah." : ""}`} />
        <Integration testid="integration-ai" icon={Sparkles} title="Analisis AI" status={st.ai.status} detail={`Model ${st.ai.model} untuk SWOT/TOWS, fishbone/5 Why, dan analisis slide.`} />
        <Integration testid="integration-scheduler" icon={Clock3} title="Penjadwal otomatis" status={st.scheduler.status} detail={`${st.scheduler.jadwal}. Terakhir berjalan: ${st.scheduler.terakhir ? fmtDate(st.scheduler.terakhir, true) : "belum ada"}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="space-y-4" data-testid="reminder-settings-card">
          <div className="font-display text-lg font-semibold text-[#12372A]">Jadwal pengingat</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tenggat laporan (tanggal bulan berikutnya)"><Input data-testid="deadline-day-input" type="number" min={1} max={28} disabled={!admin} value={s.deadline_day} onChange={(e) => setS({ ...s, deadline_day: e.target.value })} /></Field>
            <Field label="Ingatkan H- sebelum tenggat"><Input data-testid="days-before-input" type="number" min={1} disabled={!admin} value={s.days_before} onChange={(e) => setS({ ...s, days_before: e.target.value })} /></Field>
            <Field label="Jam kirim (WIB, 0-23)"><Input data-testid="send-hour-input" type="number" min={0} max={23} disabled={!admin} value={s.send_hour} onChange={(e) => setS({ ...s, send_hour: e.target.value })} /></Field>
            <Field label="Hari ke- setelah terlambat"><Input data-testid="late-days-input" disabled={!admin} value={Array.isArray(s.late_days) ? s.late_days.join(", ") : s.late_days} onChange={(e) => setS({ ...s, late_days: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-3 text-sm"><Switch data-testid="end-of-month-switch" disabled={!admin} checked={s.end_of_month} onCheckedChange={(v) => setS({ ...s, end_of_month: v })} />Pengingat pada hari terakhir setiap bulan</label>
          <label className="flex items-center gap-3 text-sm"><Switch data-testid="email-enabled-switch" disabled={!admin} checked={s.email_enabled} onCheckedChange={(v) => setS({ ...s, email_enabled: v })} />Kirim juga melalui email</label>
          {admin && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button className="btn-primary" data-testid="save-settings-button" onClick={save}><Save className="mr-1 h-4 w-4" />Simpan</Button>
              <Button variant="outline" className="btn-soft" data-testid="run-reminders-button" onClick={runNow}><Play className="mr-1 h-4 w-4" />Jalankan sekarang</Button>
              <Button variant="outline" className="btn-soft" data-testid="test-email-button" onClick={testMail}><Send className="mr-1 h-4 w-4" />Kirim email uji</Button>
            </div>
          )}
          <p className="text-xs text-slate-500">Laporan bulan N jatuh tempo pada tanggal tenggat di bulan N+1. Pengingat hanya dikirim untuk SPM/program yang laporannya belum diajukan. Akun demo (.test) tidak dikirimi email.</p>
        </Card>
        <Card data-testid="reminder-log-card">
          <div className="mb-4 font-display text-lg font-semibold text-[#12372A]">Log pengingat</div>
          {logs.length === 0 ? <Empty>Belum ada pengingat terkirim.</Empty> : (
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500"><th className="py-2">Waktu</th><th>Tahap</th><th>SPM/Program</th><th>Email</th></tr></thead>
                <tbody>{logs.map((l) => (
                  <tr key={l.id} className="border-t border-[#EEF3EF]"><td className="py-2 pr-2 text-xs text-slate-500">{fmtDate(l.created_at, true)}</td><td className="pr-2">{STAGE[l.stage]}</td><td className="pr-2">{l.program}<div className="text-xs text-slate-500">{l.periode} · {l.pj}</div></td><td className="text-xs text-slate-600">{l.email}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
