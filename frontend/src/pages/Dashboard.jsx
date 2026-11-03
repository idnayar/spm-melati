import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Target, CheckCircle2, AlertTriangle, CircleDashed, Gauge, ClipboardCheck, Clock } from "lucide-react";
import { useParams } from "react-router-dom";
import { api, currentPeriod, fmtDate, TERM } from "@/lib/api";
import { PageHeader, PeriodFilter, ProgramSelect, useMyPrograms, Card, Num, NA, RecapBadge, StatusBadge, Empty } from "@/components/common";
import { Progress } from "@/components/ui/progress";
import { Delta, YoyCard, DistributionCard, StatusGrid } from "@/components/DashboardDetail";

const COLORS = ["#1A4D3A", "#10B981", "#D97706", "#0E7490", "#9F1239", "#4D7C0F", "#7C2D12"];

const Kpi = ({ icon: Icon, label, value, sub, testid, tone = "text-[#1A4D3A]" }) => (
  <Card className="flex flex-col gap-3" data-testid={testid}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <Icon className={`h-4 w-4 ${tone}`} />
    </div>
    <div className={`font-display text-3xl font-bold ${tone}`}>{value}</div>
    {sub && <div className="text-xs text-slate-500">{sub}</div>}
  </Card>
);

const ProgramRecap = ({ p }) => (
  <Card className="overflow-hidden p-0" data-testid={`recap-program-${p.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EEE8] bg-[#F3F7F2] px-5 py-3">
      <div><div className="font-display text-lg font-semibold text-[#12372A]">{p.name}</div><div className="text-xs text-slate-500">PJ: {p.pj_name || "Belum ditetapkan"}</div></div>
      <div className="flex flex-wrap items-center gap-4 text-xs" data-testid={`spm-summary-${p.id}`}>
        <span>Rata-rata <b className="font-mono-num text-sm text-[#12372A]">{p.ringkasan.rata_persen === null ? "–" : `${p.ringkasan.rata_persen.toLocaleString("id-ID")}%`}</b></span>
        <span>Tahun lalu <b className="font-mono-num text-sm text-slate-600">{p.ringkasan.rata_persen_lalu === null ? "–" : `${p.ringkasan.rata_persen_lalu.toLocaleString("id-ID")}%`}</b></span>
        <Delta value={p.ringkasan.rata_persen !== null && p.ringkasan.rata_persen_lalu !== null ? Math.round((p.ringkasan.rata_persen - p.ringkasan.rata_persen_lalu) * 10) / 10 : null} testid={`spm-delta-${p.id}`} />
        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-emerald-800">{p.ringkasan.tercapai}/{p.ringkasan.total} tercapai</span>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500">
          <th className="px-5 py-3">Indikator</th><th className="px-3">Sasaran</th><th className="px-3">Target periode</th><th className="px-3">Capaian</th><th className="px-3 w-44">Persentase</th><th className="px-3">Tahun lalu</th><th className="px-3">Selisih</th><th className="px-3">Status</th>
        </tr></thead>
        <tbody>
          {p.indicators.map((i) => (
            <tr key={i.id} className="border-t border-[#EEF3EF]" data-testid={`recap-row-${i.id}`}>
              <td className="px-5 py-3"><div className="font-medium text-slate-800">{i.name}</div><div className="text-xs text-slate-500">{i.unit} · {i.recap.bulan_terlapor.length} bln terlapor</div></td>
              <td className="px-3"><Num v={i.recap.sasaran} /></td>
              <td className="px-3"><Num v={i.recap.target_periode} pct /></td>
              <td className="px-3"><Num v={i.recap.capaian} /></td>
              <td className="px-3">{i.recap.persen === null ? <NA /> : (
                <div className="flex items-center gap-2"><Progress value={Math.min(100, i.recap.persen)} className="h-2 bg-[#E6EEE8]" /><span className="font-mono-num w-16 text-right">{i.recap.persen.toLocaleString("id-ID")}%</span></div>)}</td>
              <td className="px-3"><Num v={i.recap_prev.persen} pct /></td>
              <td className="px-3"><Delta value={i.selisih} testid={`delta-${i.id}`} /></td>
              <td className="px-3"><RecapBadge status={i.recap.status} /></td>
            </tr>
          ))}
          {p.indicators.length === 0 && <tr><td colSpan={8} className="px-5 py-4 text-slate-500">Belum ada program.</td></tr>}
        </tbody>
      </table>
    </div>
  </Card>
);

export default function Dashboard() {
  const { kind = "spm" } = useParams();
  const T = TERM[kind] || "SPM";
  const [per, setPer] = useState(currentPeriod());
  const [programId, setProgramId] = useState("");
  const programs = useMyPrograms(kind);
  const [d, setD] = useState(null);

  useEffect(() => { setProgramId(""); setD(null); }, [kind]);
  useEffect(() => {
    api.get("/dashboard", { params: { ...per, kind, program_id: programId || undefined } }).then((r) => setD(r.data));
  }, [per, programId, kind]);

  const c = d?.completeness;
  const lateRows = c?.rows.filter((r) => r.late || r.status === "belum_dibuat" || r.status === "draf") || [];
  return (
    <div>
      <PageHeader eyebrow={`Dashboard ${T}`} title={d ? d.periode : `Dashboard ${T}`} subtitle={`Capaian ${kind === "spm" ? "Standar Pelayanan Minimal (SPM)" : "program puskesmas"}. Rekap triwulan & tahunan dihitung dari laporan bulanan sesuai metode tiap indikator. Data yang belum dilaporkan tidak dihitung sebagai nol.`}>
        <ProgramSelect programs={programs} value={programId} onChange={setProgramId} allowAll noun={T} testid="dashboard-program-select" />
        <PeriodFilter value={per} onChange={setPer} />
      </PageHeader>
      {!d ? <div className="text-sm text-slate-500">Memuat data…</div> : (
        <div className="space-y-8">
          <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi testid="kpi-indicators" icon={Target} label="Indikator" value={d.summary.indikator} />
            <Kpi testid="kpi-achieved" icon={CheckCircle2} label="Tercapai" value={d.summary.tercapai} tone="text-emerald-600" />
            <Kpi testid="kpi-not-achieved" icon={AlertTriangle} label="Belum tercapai" value={d.summary.belum_tercapai} tone="text-rose-600" />
            <Kpi testid="kpi-unavailable" icon={CircleDashed} label="Belum tersedia" value={d.summary.belum_tersedia} tone="text-slate-500" />
            <Kpi testid="kpi-average" icon={Gauge} label="Rata-rata capaian" value={d.summary.rata_persen === null ? <span className="text-base"><NA /></span> : `${d.summary.rata_persen.toLocaleString("id-ID")}%`}
              sub={<span className="flex flex-wrap items-center gap-1">{d.periode_lalu}: {d.summary.rata_persen_lalu === null ? "belum tersedia" : `${d.summary.rata_persen_lalu.toLocaleString("id-ID")}%`}{d.summary.rata_persen !== null && d.summary.rata_persen_lalu !== null && <Delta value={Math.round((d.summary.rata_persen - d.summary.rata_persen_lalu) * 10) / 10} testid="kpi-average-delta" />}</span>} />
            <Kpi testid="kpi-completeness" icon={ClipboardCheck} label="Kelengkapan" value={c.persen === null ? <span className="text-base"><NA /></span> : `${c.persen}%`} sub={`${c.submitted}/${c.expected} laporan · ${c.late} terlambat`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card data-testid="trend-chart">
              <div className="mb-1 font-display text-lg font-semibold text-[#12372A]">Tren capaian bulanan {per.year}</div>
              <div className="mb-4 text-xs text-slate-500">Rata-rata persentase capaian indikator per bulan. Titik kosong = belum tersedia.</div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.trend} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6EEE8" />
                    <XAxis dataKey="bulan" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} unit="%" />
                    <Tooltip formatter={(v) => (v === null ? "Belum tersedia" : `${v}%`)} />
                    {d.programs.length <= 6 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                    {d.programs.map((p, i) => <Line key={p.id} type="monotone" dataKey={p.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2.2} dot={{ r: 3 }} connectNulls={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card data-testid="late-report-panel">
              <div className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-[#12372A]"><Clock className="h-4 w-4 text-amber-600" />Kelengkapan & keterlambatan</div>
              {lateRows.length === 0 ? <Empty>Semua laporan periode ini sudah diajukan.</Empty> : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {lateRows.map((r) => (
                    <div key={`${r.program_id}-${r.month}`} className="flex items-center justify-between gap-2 rounded-xl border border-[#EEF3EF] px-3 py-2">
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{r.program}</div><div className="text-xs text-slate-500">{r.bulan} · tenggat {fmtDate(r.deadline)}</div></div>
                      <div className="flex flex-col items-end gap-1"><StatusBadge status={r.status} />{r.late && <span className="text-[10px] font-bold uppercase text-rose-600" data-testid="late-flag">Terlambat</span>}</div>
                    </div>
                  ))}
                </div>
              )}
              <Link to={`/laporan-${kind}`} className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline" data-testid="goto-reports-link">Buka laporan →</Link>
            </Card>
          </div>

          <YoyCard d={d} year={per.year} noun={T} />
          <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
            <DistributionCard dist={d.distribusi} />
            <StatusGrid programs={d.programs} year={per.year} noun={T} />
          </div>

          <div className="space-y-5">
            <h2 className="font-display text-xl font-semibold text-[#12372A]">Rekap per {T}</h2>
            {d.programs.map((p) => <ProgramRecap key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}
