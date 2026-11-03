import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save, Send, Cloud, Presentation as PresIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { api, errMsg, MONTHS, METHODS, fmtDate, fmtNum } from "@/lib/api";
import { Card, StatusBadge, NA, Field } from "@/components/common";
import { FeedbackPanel, ReviewBar, RevisionList } from "@/components/ReportSidePanels";
import { useAuth } from "@/context/AuthContext";

const NARR = [
  ["kendala", "Kendala"], ["upaya", "Upaya yang sudah dilakukan"], ["hasil_upaya", "Hasil upaya"],
  ["rtl", "Rencana tindak lanjut"], ["dukungan", "Dukungan yang dibutuhkan"],
];
const STEPS = ["draf", "diajukan", "akhir"];

const Stepper = ({ status }) => {
  const idx = status === "draf" ? 0 : status === "diajukan" ? 1 : 2;
  const last = status === "perlu_perbaikan" ? "Perlu perbaikan" : status === "disetujui" ? "Disetujui" : "Perlu perbaikan / Disetujui";
  return (
    <div className="flex items-center gap-2 text-xs font-semibold" data-testid="workflow-stepper">
      {["Draf", "Diajukan", last].map((s, i) => (
        <div key={STEPS[i]} className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 ${i <= idx ? (i === 2 && status === "perlu_perbaikan" ? "bg-amber-500 text-white" : "bg-[#1A4D3A] text-white") : "bg-[#E6EEE8] text-slate-500"}`}>{s}</span>
          {i < 2 && <span className="h-px w-5 bg-[#C9D9CE]" />}
        </div>
      ))}
    </div>
  );
};

const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const ItemsTable = ({ report, items, setItems, editable }) => {
  const inds = Object.fromEntries(report.program.indicators.map((i) => [i.id, i]));
  const upd = (k, field, v) => setItems(items.map((it, j) => (j === k ? { ...it, [field]: field === "keterangan" ? v : numOrNull(v) } : it)));
  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500"><th className="py-2 pr-3">Indikator</th><th className="px-2">Metode</th><th className="px-2 w-28">Sasaran</th><th className="px-2 w-24">Target (%)</th><th className="px-2 w-28">Capaian</th><th className="px-2">%</th><th className="px-2">Keterangan</th></tr></thead>
          <tbody>
            {items.map((it, k) => {
              const ind = inds[it.indicator_id] || { name: "(indikator dihapus)" };
              const pct = it.capaian !== null && it.sasaran ? (it.capaian / it.sasaran) * 100 : null;
              return (
                <tr key={it.indicator_id} className="border-t border-[#EEF3EF] align-top">
                  <td className="py-3 pr-3"><div className="font-medium text-slate-800">{ind.name}</div><div className="text-xs text-slate-500">{ind.unit}</div></td>
                  <td className="px-2 py-3"><Tooltip><TooltipTrigger asChild><span className="cursor-help rounded bg-[#EEF4EF] px-2 py-0.5 text-xs text-emerald-800">{METHODS[ind.method]?.label}</span></TooltipTrigger><TooltipContent className="max-w-xs">{METHODS[ind.method]?.hint}</TooltipContent></Tooltip></td>
                  {["sasaran", "target", "capaian"].map((f) => (
                    <td key={f} className="px-2 py-2">
                      {editable ? <Input data-testid={`item-${f}-${k}`} type="number" inputMode="decimal" value={it[f] ?? ""} onChange={(e) => upd(k, f, e.target.value)} className="h-9 bg-white" placeholder="—" />
                        : fmtNum(it[f]) ?? <NA />}
                    </td>
                  ))}
                  <td className="px-2 py-3">{pct === null ? <NA /> : <span className="font-mono-num">{fmtNum(pct, true)}</span>}</td>
                  <td className="px-2 py-2">{editable ? <Input data-testid={`item-note-${k}`} value={it.keterangan || ""} onChange={(e) => upd(k, "keterangan", e.target.value)} className="h-9 bg-white" /> : <span className="text-slate-600">{it.keterangan || "-"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Kosongkan capaian bila belum ada data — akan ditampilkan sebagai “Belum tersedia”, bukan nol.</p>
    </TooltipProvider>
  );
};

export default function ReportEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [r, setR] = useState(null);
  const [items, setItems] = useState([]);
  const [narr, setNarr] = useState({});
  const [saved, setSaved] = useState(null);
  const [making, setMaking] = useState(false);
  const dirty = useRef(false);

  const load = useCallback(() => api.get(`/reports/${id}`).then(({ data }) => {
    setR(data); setItems(data.items); setNarr(Object.fromEntries(NARR.map(([k]) => [k, data[k] || ""])));
    setSaved(data.last_autosave); dirty.current = false;
  }).catch((e) => toast.error(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);

  const payload = (extra) => ({ items, ...narr, ...extra });
  useEffect(() => {
    if (!r?.can_edit || !dirty.current) return;
    const t = setTimeout(() => {
      api.put(`/reports/${id}`, payload({ autosave: true })).then((res) => { setSaved(res.data.updated_at); dirty.current = false; }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, narr]);

  const setItemsDirty = (v) => { dirty.current = true; setItems(v); };
  const setNarrDirty = (k, v) => { dirty.current = true; setNarr({ ...narr, [k]: v }); };
  const save = async () => { try { await api.put(`/reports/${id}`, payload({ autosave: false })); toast.success("Draf disimpan (versi baru tercatat)"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const submit = async () => {
    try { await api.put(`/reports/${id}`, payload({ autosave: false, note: "Simpan sebelum diajukan" })); await api.post(`/reports/${id}/submit`); toast.success("Laporan diajukan ke Kepala Puskesmas"); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  if (!r) return <div className="text-sm text-slate-500">Memuat laporan…</div>;
  const makePres = async () => {
    setMaking(true);
    try {
      if (r.can_edit) await api.put(`/reports/${id}`, payload({ autosave: true }));
      const { data } = await api.post("/presentations/generate", { program_id: r.program_id, year: r.year, period: "bulanan", month: r.month, include_draft: true });
      toast.success("Presentasi dibuat dari isian laporan ini");
      nav(`/presentasi/${data.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setMaking(false); }
  };
  const editable = r.can_edit;
  return (
    <div className="space-y-6">
      <button onClick={() => nav(r?.program?.kind === "spm" ? "/laporan-spm" : "/laporan-program")} className="flex items-center gap-1 text-sm text-emerald-700 hover:underline" data-testid="back-to-reports"><ArrowLeft className="h-4 w-4" />Kembali</button>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-rise">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Laporan bulanan {r.program.kind === "spm" ? "SPM" : "Program"}</div>
          <h1 className="font-display text-3xl font-bold text-[#12372A] sm:text-4xl" data-testid="report-title">{r.program.name} · {MONTHS[r.month - 1]} {r.year}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600"><StatusBadge status={r.status} /><span>PJ: {r.program.pj_name || "-"}</span><span>Tenggat: {fmtDate(r.deadline)}</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="btn-soft" data-testid="report-make-presentation-button" disabled={making} onClick={makePres}>
            <PresIcon className="mr-1 h-4 w-4" />{making ? "Menyusun…" : "Buat presentasi"}
          </Button>
          <Stepper status={r.status} />
        </div>
      </div>
      {r.status === "perlu_perbaikan" && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="revision-request-note">
          <b>Perlu perbaikan:</b> {r.feedback.find((f) => f.type === "perbaikan")?.text}
        </div>
      )}
      <ReviewBar report={r} user={user} onDone={load} />
      <Tabs defaultValue="isi">
        <TabsList className="bg-[#E6EEE8]">
          <TabsTrigger value="isi" data-testid="tab-report-content">Isi laporan</TabsTrigger>
          <TabsTrigger value="masukan" data-testid="tab-report-feedback">Masukan ({r.feedback.length})</TabsTrigger>
          <TabsTrigger value="riwayat" data-testid="tab-report-history">Riwayat revisi ({r.revisions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="isi" className="space-y-6 pt-4">
          <Card>
            <div className="mb-4 font-display text-lg font-semibold text-[#12372A]">Sasaran, target & capaian</div>
            <ItemsTable report={r} items={items} setItems={setItemsDirty} editable={editable} />
          </Card>
          <Card className="grid gap-5 md:grid-cols-2">
            {NARR.map(([k, label]) => (
              <Field key={k} label={label}>
                {editable ? <Textarea data-testid={`narr-${k}`} rows={4} value={narr[k]} onChange={(e) => setNarrDirty(k, e.target.value)} className="bg-white" />
                  : <div className="min-h-[3rem] whitespace-pre-wrap rounded-lg bg-[#F7FAF7] p-3 text-slate-700">{narr[k] || <NA />}</div>}
              </Field>
            ))}
          </Card>
          {editable && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DCE7DF] bg-white/90 p-3 shadow-lg backdrop-blur-md">
              <span className="flex items-center gap-2 text-xs text-slate-500" data-testid="autosave-status"><Cloud className="h-4 w-4 text-emerald-600" />{saved ? `Tersimpan otomatis ${fmtDate(saved, true)}` : "Draf disimpan otomatis saat Anda mengetik"}</span>
              <div className="flex gap-2">
                <Button variant="outline" className="btn-soft" data-testid="save-draft-button" onClick={save}><Save className="mr-1 h-4 w-4" />Simpan draf</Button>
                <Button className="btn-primary" data-testid="submit-report-button" onClick={submit}><Send className="mr-1 h-4 w-4" />Ajukan</Button>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="masukan" className="pt-4"><FeedbackPanel report={r} user={user} onDone={load} /></TabsContent>
        <TabsContent value="riwayat" className="pt-4"><RevisionList report={r} /></TabsContent>
      </Tabs>
    </div>
  );
}
