import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { MONTHS, STATUS, RECAP } from "@/lib/api";
import { Card, NA } from "@/components/common";

const pctFmt = (v) => (v === null || v === undefined ? "Belum tersedia" : `${Number(v).toLocaleString("id-ID")}%`);

export const Delta = ({ value, testid = "delta-value" }) => {
  if (value === null || value === undefined) return <NA testid={`${testid}-na`} />;
  const up = value > 0, flat = value === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-0.5 font-mono-num text-xs font-semibold ${flat ? "text-slate-500" : up ? "text-emerald-700" : "text-rose-600"}`}>
      <Icon className="h-3.5 w-3.5" />{up ? "+" : ""}{Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 })} poin
    </span>
  );
};

export const YoyCard = ({ d, year, noun }) => (
  <Card data-testid="yoy-comparison-card">
    <div className="mb-1 font-display text-lg font-semibold text-[#12372A]">Perbandingan tahunan</div>
    <div className="mb-4 text-xs text-slate-500">{d.periode} dibandingkan {d.periode_lalu}. Rata-rata persentase capaian indikator per {noun}; kosong = belum tersedia.</div>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-72" data-testid="yoy-spm-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={d.yoy_spm} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E6EEE8" />
            <XAxis dataKey="nama" tick={{ fontSize: 10 }} interval={0} tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 16)}…` : v)} />
            <YAxis unit="%" tick={{ fontSize: 10 }} />
            <Tooltip formatter={pctFmt} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="tahun_lalu" name={`${year - 1}`} fill="#A7C4B5" radius={[4, 4, 0, 0]} />
            <Bar dataKey="tahun_ini" name={`${year}`} fill="#1A4D3A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72" data-testid="yoy-monthly-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={d.yoy_trend} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E6EEE8" />
            <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
            <YAxis unit="%" tick={{ fontSize: 10 }} />
            <Tooltip formatter={pctFmt} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="tahun_lalu" name={`Bulanan ${year - 1}`} stroke="#A7C4B5" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} connectNulls={false} />
            <Line dataKey="tahun_ini" name={`Bulanan ${year}`} stroke="#1A4D3A" strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  </Card>
);

const DIST_COLORS = { tercapai: "#10B981", belum_tercapai: "#E11D48", sasaran_kosong: "#F59E0B", target_kosong: "#FBBF24", belum_tersedia: "#CBD5E1" };

export const DistributionCard = ({ dist }) => {
  const data = Object.entries(dist).filter(([, v]) => v > 0).map(([k, v]) => ({ key: k, name: RECAP[k].label, value: v }));
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <Card data-testid="status-distribution-card">
      <div className="mb-4 font-display text-lg font-semibold text-[#12372A]">Sebaran status indikator</div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={data} dataKey="value" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">{data.map((x) => <Cell key={x.key} fill={DIST_COLORS[x.key]} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-2xl font-bold text-[#12372A]">{total}</span><span className="text-[10px] uppercase tracking-wider text-slate-500">indikator</span></div>
        </div>
        <ul className="w-full space-y-2 text-sm">
          {data.map((x) => (
            <li key={x.key} className="flex items-center justify-between gap-2" data-testid={`dist-${x.key}`}>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DIST_COLORS[x.key] }} />{x.name}</span>
              <span className="font-mono-num">{x.value} · {Math.round((x.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
};

const CELL = { draf: "bg-slate-300", diajukan: "bg-sky-500", perlu_perbaikan: "bg-amber-500", disetujui: "bg-emerald-600" };

export const StatusGrid = ({ programs, year, noun }) => (
  <Card data-testid="report-status-grid">
    <div className="mb-1 font-display text-lg font-semibold text-[#12372A]">Status laporan bulanan {year}</div>
    <div className="mb-4 flex flex-wrap gap-3 text-[11px] text-slate-500">
      {Object.entries(CELL).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${c}`} />{STATUS[k].label}</span>)}
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-slate-300" />Belum dibuat</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead><tr><th className="pb-2 text-left font-semibold text-slate-500">{noun}</th>{MONTHS.map((m) => <th key={m} className="pb-2 font-medium text-slate-500">{m.slice(0, 3)}</th>)}</tr></thead>
        <tbody>
          {programs.map((p) => (
            <tr key={p.id}>
              <td className="py-1 pr-3 font-medium text-slate-700">{p.name}</td>
              {p.status_bulanan.map((s, i) => (
                <td key={i} className="p-0.5"><div title={`${MONTHS[i]}: ${s ? STATUS[s].label : "Belum dibuat"}`} data-testid={`grid-${p.id}-${i + 1}`} className={`mx-auto h-6 w-full min-w-[28px] rounded ${s ? CELL[s] : "border border-dashed border-slate-300 bg-white"}`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
);
