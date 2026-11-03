import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

const BarsChart = ({ chart }) => {
  const data = chart.labels.map((l, i) => Object.fromEntries([["label", l], ...chart.series.map((s) => [s.name, s.data[i]])]));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6EEE8" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v) => (v === null || v === undefined ? "Belum tersedia" : `${v}%`)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {chart.series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={["#1A4D3A", "#F59E0B", "#10B981"][i % 3]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
};

export const SlideView = ({ slide }) => {
  if (slide.layout === "title") {
    return (
      <div className="slide-frame relative flex aspect-video w-full flex-col justify-center overflow-hidden rounded-xl bg-[#F8FAF7] p-[6%] shadow-inner" data-testid="slide-view">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[#1A4D3A]"><div className="grain h-full w-full opacity-40" /></div>
        <img src="/logo.png" alt="" className="relative mb-[4%] h-[14%] w-auto self-start object-contain" />
        <div className="relative max-w-[62%] font-display text-[clamp(18px,3.4vw,48px)] font-bold leading-tight text-[#12372A]">{slide.title}</div>
        <div className="relative mt-3 max-w-[62%] text-[clamp(10px,1.3vw,18px)] text-slate-600">{slide.subtitle}</div>
      </div>
    );
  }
  return (
    <div className="slide-frame flex aspect-video w-full flex-col overflow-hidden rounded-xl bg-white shadow-inner" data-testid="slide-view">
      <div className="bg-[#1A4D3A] px-[4%] py-[2.2%] font-display text-[clamp(13px,2vw,30px)] font-semibold text-white">{slide.title}</div>
      <div className="min-h-0 flex-1 overflow-hidden px-[4%] py-[3%]">
        {slide.layout === "table" && slide.table?.rows?.length > 0 && (
          <table className="w-full text-[clamp(8px,0.95vw,14px)]">
            <thead><tr className="bg-[#E8F5E9]">{slide.table.headers.map((h) => <th key={h} className="border border-[#CFE0D4] px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>{slide.table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={`border border-[#E6EEE8] px-2 py-1 ${v === "Belum tersedia" ? "italic text-slate-400" : ""}`}>{v}</td>)}</tr>)}</tbody>
          </table>
        )}
        {slide.layout === "chart" && slide.chart?.labels?.length > 0 && <div className="h-full w-full"><BarsChart chart={slide.chart} /></div>}
        {(slide.layout === "bullets" || ((slide.layout === "table" || slide.layout === "chart") && !(slide.table?.rows?.length || slide.chart?.labels?.length))) && (
          <ul className="space-y-[1.4%] text-[clamp(10px,1.35vw,20px)] leading-snug text-slate-800">
            {(slide.bullets?.length ? slide.bullets : ["Belum tersedia"]).map((b, i) => (
              <li key={i} className="flex gap-3"><span className="mt-[0.5em] h-2 w-2 shrink-0 rounded-full bg-emerald-600" /><span className={b === "Belum tersedia" ? "italic text-slate-400" : ""}>{b}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
