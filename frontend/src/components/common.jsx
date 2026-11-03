import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTHS, QUARTERS, STATUS, RECAP, FU_STATUS, fmtNum, api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export const NA = ({ testid = "unreported-data-placeholder" }) => (
  <span data-testid={testid} className="na-badge">Belum tersedia</span>
);

export const Num = ({ v, pct }) => (fmtNum(v, pct) === null ? <NA /> : <span className="font-mono-num">{fmtNum(v, pct)}</span>);

const Pill = ({ cls, children, testid }) => (
  <span data-testid={testid} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
);
export const StatusBadge = ({ status }) => <Pill testid="report-status-badge" cls={STATUS[status]?.cls}>{STATUS[status]?.label || status}</Pill>;
export const RecapBadge = ({ status }) => <Pill testid="recap-status-badge" cls={RECAP[status]?.cls}>{RECAP[status]?.label}</Pill>;
export const FuBadge = ({ status }) => <Pill testid="followup-status-badge" cls={FU_STATUS[status]?.cls}>{FU_STATUS[status]?.label}</Pill>;
export const KindTag = ({ jenis }) =>
  jenis === "fakta" ? (
    <Pill testid="kind-fakta" cls="bg-emerald-50 text-emerald-800 border-emerald-300">Fakta</Pill>
  ) : (
    <Pill testid="kind-dugaan" cls="bg-amber-50 text-amber-800 border-dashed border-amber-400">Dugaan · perlu verifikasi</Pill>
  );

export const PageHeader = ({ title, subtitle, children, eyebrow }) => (
  <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-rise">
    <div>
      {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</div>}
      <h1 className="font-display text-3xl font-bold tracking-tight text-[#12372A] sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);

export const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl border border-[#DCE7DF] bg-white p-5 shadow-[0_1px_0_rgba(26,77,58,0.04)] ${className}`} {...rest}>{children}</div>
);

export const Field = ({ label, children, hint }) => (
  <label className="flex flex-col gap-1.5 text-sm">
    <span className="font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="text-xs text-slate-500">{hint}</span>}
  </label>
);

export const SimpleSelect = ({ value, onChange, options, testid, placeholder, className = "w-full" }) => (
  <Select value={value === null || value === undefined ? undefined : String(value)} onValueChange={onChange}>
    <SelectTrigger data-testid={testid} className={`${className} bg-white`}><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={String(o.value)} data-testid={`${testid}-opt-${o.value}`}>{o.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);

export const PeriodFilter = ({ value, onChange, allowPeriod = true }) => {
  const set = (k) => (v) => onChange({ ...value, [k]: k === "period" ? v : Number(v) });
  return (
    <div className="flex flex-wrap gap-2" data-testid="period-filter">
      {allowPeriod && (
        <SimpleSelect testid="period-type-select" className="w-36" value={value.period} onChange={set("period")}
          options={[{ value: "bulanan", label: "Bulanan" }, { value: "triwulan", label: "Triwulanan" }, { value: "tahunan", label: "Tahunan" }]} />
      )}
      {value.period === "bulanan" && (
        <SimpleSelect testid="period-month-select" className="w-36" value={value.month} onChange={set("month")}
          options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
      )}
      {value.period === "triwulan" && (
        <SimpleSelect testid="period-quarter-select" className="w-36" value={value.quarter} onChange={set("quarter")}
          options={QUARTERS.map((q, i) => ({ value: i + 1, label: `Triwulan ${q}` }))} />
      )}
      <SimpleSelect testid="period-year-select" className="w-28" value={value.year} onChange={set("year")}
        options={YEARS.map((y) => ({ value: y, label: String(y) }))} />
    </div>
  );
};

export const usePrograms = (kind) => {
  const [programs, setPrograms] = useState([]);
  const reload = () => api.get("/programs", { params: { kind: kind || undefined } }).then((r) => setPrograms(r.data));
  useEffect(() => { reload(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return [programs, reload];
};

export const useMyPrograms = (kind) => {
  const { user } = useAuth();
  const [programs] = usePrograms(kind);
  return user.role === "pj" ? programs.filter((p) => p.pj_user_id === user.id) : programs;
};

export const ProgramSelect = ({ programs, value, onChange, allowAll, testid = "program-select", noun = "SPM/Program" }) => (
  <SimpleSelect testid={testid} className="w-full sm:w-64" value={value || (allowAll ? "all" : undefined)} placeholder={`Pilih ${noun}`}
    onChange={(v) => onChange(v === "all" ? "" : v)}
    options={[...(allowAll ? [{ value: "all", label: `Semua ${noun}` }] : []), ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
);

export const Empty = ({ children, testid = "empty-state" }) => (
  <div data-testid={testid} className="rounded-2xl border border-dashed border-[#C9D9CE] bg-[#F3F7F2] px-6 py-10 text-center text-sm text-slate-500">{children}</div>
);
