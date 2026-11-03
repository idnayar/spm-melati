import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Maximize2, Save, Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, errMsg, download } from "@/lib/api";
import { Card, Field } from "@/components/common";
import { SlideView } from "@/components/SlideView";

export default function PresentationEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [cur, setCur] = useState(0);
  const stage = useRef();
  useEffect(() => { api.get(`/presentations/${id}`).then((r) => setP(r.data)).catch((e) => toast.error(errMsg(e))); }, [id]);

  const go = useCallback((d) => setCur((c) => Math.max(0, Math.min((p?.slides.length || 1) - 1, c + d))), [p]);
  useEffect(() => {
    const h = (e) => { if (!document.fullscreenElement) return; if (["ArrowRight", "PageDown", " "].includes(e.key)) go(1); if (["ArrowLeft", "PageUp"].includes(e.key)) go(-1); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go]);
  if (!p) return <div className="text-sm text-slate-500">Memuat…</div>;

  const s = p.slides[cur];
  const setSlide = (ns) => setP({ ...p, slides: p.slides.map((x, i) => (i === cur ? ns : x)) });
  const move = (d) => { const j = cur + d; if (j < 0 || j >= p.slides.length) return; const arr = [...p.slides]; [arr[cur], arr[j]] = [arr[j], arr[cur]]; setP({ ...p, slides: arr }); setCur(j); };
  const add = () => { const arr = [...p.slides]; arr.splice(cur + 1, 0, { id: Math.random().toString(36).slice(2), layout: "bullets", title: "Slide baru", bullets: ["Poin pertama"] }); setP({ ...p, slides: arr }); setCur(cur + 1); };
  const remove = () => { if (p.slides.length <= 1) return; setP({ ...p, slides: p.slides.filter((_, i) => i !== cur) }); setCur(Math.max(0, cur - 1)); };
  const save = async () => { try { await api.put(`/presentations/${id}`, { title: p.title, slides: p.slides }); toast.success("Presentasi disimpan"); } catch (e) { toast.error(errMsg(e)); } };
  const exp = async (format) => { await save(); download(`/export/presentation/${id}`, { format }).catch((e) => toast.error(errMsg(e))); };

  return (
    <div className="space-y-6">
      <button onClick={() => nav("/presentasi")} className="flex items-center gap-1 text-sm text-emerald-700 hover:underline" data-testid="back-to-presentations"><ArrowLeft className="h-4 w-4" />Kembali</button>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input data-testid="presentation-title-input" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} className="h-12 max-w-xl border-0 bg-transparent px-0 font-display text-2xl font-bold text-[#12372A] shadow-none focus-visible:ring-0 sm:text-3xl" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="btn-soft" data-testid="presentation-fullscreen-button" onClick={() => stage.current.requestFullscreen?.()}><Maximize2 className="mr-1 h-4 w-4" />Layar penuh</Button>
          <Button variant="outline" className="btn-soft" data-testid="export-pptx-button" onClick={() => exp("pptx")}>PowerPoint</Button>
          <Button variant="outline" className="btn-soft" data-testid="export-pres-pdf-button" onClick={() => exp("pdf")}>PDF</Button>
          <Button className="btn-primary" data-testid="save-presentation-button" onClick={save}><Save className="mr-1 h-4 w-4" />Simpan</Button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[180px_1fr_340px]">
        <div className="flex gap-3 overflow-x-auto pb-2 xl:flex-col xl:overflow-visible">
          {p.slides.map((x, i) => (
            <button key={x.id} onClick={() => setCur(i)} data-testid={`slide-thumb-${i}`} className={`w-40 shrink-0 rounded-xl border-2 p-2 text-left transition-colors xl:w-full ${i === cur ? "border-[#1A4D3A] bg-white" : "border-transparent bg-[#EEF4EF] hover:border-[#CFE0D4]"}`}>
              <div className="text-[10px] font-mono text-slate-400">{String(i + 1).padStart(2, "0")}</div>
              <div className="truncate text-xs font-semibold text-slate-700">{x.title}</div>
            </button>
          ))}
        </div>
        <div>
          <div ref={stage} className="slide-stage"><SlideView slide={s} /></div>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <Button size="icon" variant="ghost" data-testid="prev-slide" onClick={() => go(-1)}><ChevronLeft className="h-5 w-5" /></Button>
            <span data-testid="slide-counter">Slide {cur + 1} / {p.slides.length}</span>
            <Button size="icon" variant="ghost" data-testid="next-slide" onClick={() => go(1)}><ChevronRight className="h-5 w-5" /></Button>
          </div>
        </div>
        <Card className="space-y-4">
          <div className="flex items-center justify-between"><span className="font-display font-semibold text-[#12372A]">Edit slide</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" data-testid="move-slide-up" onClick={() => move(-1)}><ChevronUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" data-testid="move-slide-down" onClick={() => move(1)}><ChevronDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" data-testid="add-slide" onClick={add}><Plus className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" data-testid="delete-slide" onClick={remove}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
            </div>
          </div>
          <Field label="Judul"><Input data-testid="slide-title-input" value={s.title} onChange={(e) => setSlide({ ...s, title: e.target.value })} /></Field>
          {s.layout === "title" && <Field label="Subjudul"><Input data-testid="slide-subtitle-input" value={s.subtitle || ""} onChange={(e) => setSlide({ ...s, subtitle: e.target.value })} /></Field>}
          {s.layout === "bullets" && <Field label="Poin (satu per baris)"><Textarea data-testid="slide-bullets-input" rows={10} value={(s.bullets || []).join("\n")} onChange={(e) => setSlide({ ...s, bullets: e.target.value.split("\n") })} /></Field>}
          {s.layout === "table" && s.table && (
            <Field label="Isi tabel (sel dapat diedit)">
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {s.table.rows.map((r, ri) => (
                  <div key={ri} className="grid grid-cols-2 gap-1 rounded-lg bg-[#F7FAF7] p-2">
                    {r.map((v, ci) => <Input key={ci} className="h-8 text-xs" value={v} title={s.table.headers[ci]} onChange={(e) => setSlide({ ...s, table: { ...s.table, rows: s.table.rows.map((rr, k) => (k === ri ? rr.map((vv, m) => (m === ci ? e.target.value : vv)) : rr)) } })} />)}
                  </div>
                ))}
              </div>
            </Field>
          )}
          {s.layout === "chart" && <p className="text-xs text-slate-500">Grafik dibuat dari rekap data. Ekspor PowerPoint menghasilkan grafik asli yang dapat diedit.</p>}
          <Field label="Catatan pembicara"><Textarea data-testid="slide-notes-input" rows={3} value={s.notes || ""} onChange={(e) => setSlide({ ...s, notes: e.target.value })} /></Field>
        </Card>
      </div>
    </div>
  );
}
