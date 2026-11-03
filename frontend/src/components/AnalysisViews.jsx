import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Check, ShieldCheck, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { api, errMsg, fmtDate } from "@/lib/api";
import { Card, KindTag, SimpleSelect } from "@/components/common";

export const ItemRow = ({ item, onChange, onDelete, testid, extra }) => {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState(item.teks || "");
  return (
    <div className="group rounded-xl border border-[#EEF3EF] bg-white p-3" data-testid={testid}>
      {edit ? (
        <div className="flex gap-2"><Input value={txt} onChange={(e) => setTxt(e.target.value)} className="h-8" data-testid={`${testid}-input`} /><Button size="icon" className="btn-primary h-8 w-8" onClick={() => { onChange({ ...item, teks: txt }); setEdit(false); }}><Check className="h-4 w-4" /></Button></div>
      ) : <p className="text-sm text-slate-800">{item.teks}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.jenis && <button onClick={() => onChange({ ...item, jenis: item.jenis === "fakta" ? "dugaan" : "fakta" })} title="Klik untuk mengubah fakta/dugaan" data-testid={`${testid}-toggle-kind`}><KindTag jenis={item.jenis} /></button>}
        {item.sumber && <span className="text-[11px] text-slate-500">Sumber: {item.sumber}</span>}
        <span className="ml-auto flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
          <button onClick={() => setEdit(true)} data-testid={`${testid}-edit`}><Pencil className="h-3.5 w-3.5 text-slate-500" /></button>
          <button onClick={onDelete} data-testid={`${testid}-delete`}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></button>
        </span>
      </div>
      {extra}
    </div>
  );
};

const listOps = (content, setContent, path) => {
  const get = () => path.reduce((o, k) => (o ? o[k] : undefined), content) || [];
  const set = (arr) => {
    const c = structuredClone(content);
    let o = c;
    path.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
    o[path[path.length - 1]] = arr;
    setContent(c);
  };
  return { list: get(), update: (i, v) => set(get().map((x, j) => (j === i ? v : x))), remove: (i) => set(get().filter((_, j) => j !== i)), add: (v) => set([...get(), v]) };
};

const Quadrant = ({ title, tone, ops, testid }) => (
  <div className={`rounded-2xl border p-4 ${tone}`} data-testid={testid}>
    <div className="mb-3 flex items-center justify-between"><span className="font-display font-semibold">{title}</span>
      <button onClick={() => ops.add({ teks: "Butir baru (edit)", jenis: "dugaan", sumber: "Ditambahkan manual" })} data-testid={`${testid}-add`} className="rounded p-1 hover:bg-white/70"><Plus className="h-4 w-4" /></button></div>
    <div className="space-y-2">
      {ops.list.length === 0 && <p className="text-xs italic text-slate-500">Tidak ada butir yang didukung data.</p>}
      {ops.list.map((it, i) => <ItemRow key={i} item={it} testid={`${testid}-item-${i}`} onChange={(v) => ops.update(i, v)} onDelete={() => ops.remove(i)} />)}
    </div>
  </div>
);

export const SwotView = ({ content, setContent }) => {
  const q = (k) => listOps(content, setContent, [k]);
  const s = (k) => listOps(content, setContent, ["strategi", k]);
  const strat = [["SO", "Strategi S-O", "Gunakan kekuatan untuk meraih peluang"], ["WO", "Strategi W-O", "Atasi kelemahan dengan peluang"], ["ST", "Strategi S-T", "Gunakan kekuatan menghadapi ancaman"], ["WT", "Strategi W-T", "Minimalkan kelemahan & hindari ancaman"]];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Quadrant testid="swot-strengths" title="Kekuatan (S)" tone="border-emerald-200 bg-emerald-50/50" ops={q("kekuatan")} />
        <Quadrant testid="swot-weaknesses" title="Kelemahan (W)" tone="border-rose-200 bg-rose-50/40" ops={q("kelemahan")} />
        <Quadrant testid="swot-opportunities" title="Peluang (O)" tone="border-sky-200 bg-sky-50/40" ops={q("peluang")} />
        <Quadrant testid="swot-threats" title="Ancaman (T)" tone="border-amber-200 bg-amber-50/40" ops={q("ancaman")} />
      </div>
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold text-[#12372A]">Matriks TOWS</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {strat.map(([k, t, d]) => {
            const ops = s(k);
            return (
              <Card key={k} className="p-4" data-testid={`tows-${k}`}>
                <div className="font-display font-semibold text-[#1A4D3A]">{t}</div><div className="mb-3 text-xs text-slate-500">{d}</div>
                <div className="space-y-2">{ops.list.length === 0 && <p className="text-xs italic text-slate-500">Belum ada strategi.</p>}
                  {ops.list.map((it, i) => <ItemRow key={i} item={{ ...it, sumber: it.dasar ? `Dasar: ${it.dasar}` : "" }} testid={`tows-${k}-item-${i}`} onChange={(v) => ops.update(i, { teks: v.teks, dasar: it.dasar })} onDelete={() => ops.remove(i)} />)}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CATS = ["Manusia", "Metode", "Material", "Sarana", "Dana", "Lingkungan"];

const Bone = ({ cat, ops, top }) => (
  <div className={`relative flex flex-col ${top ? "justify-end" : "justify-start"}`} data-testid={`fishbone-cat-${cat}`}>
    <div className={`rounded-xl border border-[#CFE0D4] bg-white p-3 ${top ? "mb-3" : "mt-3"}`}>
      <div className="mb-2 flex items-center justify-between"><span className="rounded-md bg-[#1A4D3A] px-2 py-0.5 text-xs font-semibold text-white">{cat}</span>
        <button data-testid={`fishbone-add-cause-${cat}`} onClick={() => ops.add({ teks: "Penyebab baru (edit)", jenis: "dugaan", bukti: "Belum ada bukti", verifikasi: "Perlu verifikasi lapangan", sumber: "Ditambahkan manual" })}><Plus className="h-4 w-4 text-emerald-700" /></button></div>
      <div className="space-y-2">
        {ops.list.length === 0 && <p className="text-xs italic text-slate-400">—</p>}
        {ops.list.map((c, i) => (
          <ItemRow key={i} item={c} testid={`cause-${cat}-${i}`} onChange={(v) => ops.update(i, v)} onDelete={() => ops.remove(i)}
            extra={<div className="mt-1 space-y-0.5 text-[11px] text-slate-500"><div><b>Bukti:</b> {c.bukti || "-"}</div><div><b>Verifikasi:</b> {c.verifikasi || "-"}</div></div>} />
        ))}
      </div>
    </div>
    <div className={`absolute left-1/2 hidden h-3 w-px bg-[#1A4D3A] lg:block ${top ? "bottom-0" : "top-0"}`} />
  </div>
);

export const FishboneView = ({ content, setContent }) => {
  const cat = (k) => listOps(content, setContent, ["kategori", k]);
  const why = listOps(content, setContent, ["lima_why"]);
  const rec = listOps(content, setContent, ["rekomendasi"]);
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[1fr_1fr_1fr_220px] gap-4">{CATS.slice(0, 3).map((c) => <Bone key={c} cat={c} ops={cat(c)} top />)}<div /></div>
          <div className="grid grid-cols-[1fr_220px] items-center">
            <div className="h-1 rounded-full bg-[#1A4D3A]" />
            <div className="rounded-2xl bg-[#1A4D3A] p-4 text-sm font-semibold text-white" data-testid="fishbone-problem-head">{content.masalah}</div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_220px] gap-4">{CATS.slice(3).map((c) => <Bone key={c} cat={c} ops={cat(c)} />)}<div /></div>
        </div>
      </div>
      {content.dasar_masalah?.teks && <p className="text-sm text-slate-600"><b>Dasar masalah:</b> {content.dasar_masalah.teks} <span className="text-xs text-slate-500">(Sumber: {content.dasar_masalah.sumber})</span></p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="five-why-panel">
          <div className="mb-3 font-display text-lg font-semibold text-[#12372A]">Analisis 5 Why</div>
          <ol className="space-y-2">
            {why.list.map((w, i) => (
              <li key={i} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6EEE8] font-mono text-xs font-bold text-[#1A4D3A]">{i + 1}</span>
                <div className="flex-1"><div className="text-xs font-semibold text-slate-500">{w.tanya}</div>
                  <ItemRow item={{ teks: w.jawab, jenis: w.jenis, sumber: w.sumber }} testid={`why-${i}`} onChange={(v) => why.update(i, { ...w, jawab: v.teks, jenis: v.jenis })} onDelete={() => why.remove(i)} /></div>
              </li>
            ))}
          </ol>
          {content.akar_masalah?.teks && <div className="mt-4 rounded-xl border-2 border-[#1A4D3A] bg-[#F3F7F2] p-3" data-testid="root-cause"><div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-[#1A4D3A]">Akar masalah <KindTag jenis={content.akar_masalah.jenis} /></div><p className="text-sm">{content.akar_masalah.teks}</p></div>}
        </Card>
        <Card data-testid="recommendation-panel">
          <div className="mb-3 font-display text-lg font-semibold text-[#12372A]">Rekomendasi perbaikan</div>
          <div className="space-y-2">
            {rec.list.map((r, i) => (
              <ItemRow key={i} item={{ teks: r.teks, sumber: r.terkait ? `Menangani: ${r.terkait}` : "" }} testid={`rec-${i}`} onChange={(v) => rec.update(i, { ...r, teks: v.teks })} onDelete={() => rec.remove(i)}
                extra={r.prioritas && <span className="mt-1 inline-block rounded-full bg-[#EEF4EF] px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">Prioritas {r.prioritas}</span>} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const VSTATUS = { menunggu_validasi: "Menunggu validasi", divalidasi_pj: "Divalidasi PJ", divalidasi_kepala: "Divalidasi Kepala Puskesmas", tervalidasi: "Tervalidasi PJ & Kepala Puskesmas", perlu_revisi: "Perlu revisi", divalidasi_: "Menunggu validasi" };

export const ValidationPanel = ({ a, onDone }) => {
  const [f, setF] = useState({ status: "valid", note: "" });
  const send = async () => { try { await api.post(`/analyses/${a.id}/validate`, f); toast.success("Validasi tersimpan"); setF({ status: "valid", note: "" }); onDone(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="space-y-3" data-testid="validation-panel">
      <div className="flex items-center gap-2 font-display font-semibold text-[#12372A]"><ShieldCheck className="h-4 w-4 text-emerald-700" />Validasi</div>
      <div className="rounded-lg bg-[#F3F7F2] px-3 py-2 text-sm font-semibold text-[#1A4D3A]" data-testid="validation-status">{VSTATUS[a.status] || a.status}</div>
      {a.validations.map((v) => <div key={v.role} className="text-xs text-slate-600"><b>{v.role === "pj" ? "PJ" : "Kepala Puskesmas"}</b> ({v.user_name}): {v.status === "valid" ? "Valid" : "Perlu revisi"} {v.note && `— ${v.note}`} · {fmtDate(v.at, true)}</div>)}
      <SimpleSelect testid="validation-status-select" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "valid", label: "Valid" }, { value: "perlu_revisi", label: "Perlu revisi" }]} />
      <Textarea data-testid="validation-note-input" rows={2} placeholder="Catatan validasi" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <Button className="btn-primary w-full" data-testid="submit-validation-button" onClick={send}>Simpan validasi</Button>
      <p className="text-[11px] text-slate-500">Validasi dilakukan oleh PJ terkait dan Kepala Puskesmas.</p>
    </Card>
  );
};
