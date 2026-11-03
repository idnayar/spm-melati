import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, BookOpen, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errMsg, fmtDate } from "@/lib/api";
import { PageHeader, Card, Empty, usePrograms } from "@/components/common";
import { GenerateDialog } from "@/components/GenerateDialog";
import { SwotView, FishboneView, ValidationPanel } from "@/components/AnalysisViews";

export default function Analysis() {
  const [type, setType] = useState("swot");
  const [programs] = usePrograms();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);

  const loadList = (pick) => api.get("/analyses", { params: { type } }).then((r) => { setList(r.data); setSel(pick || r.data[0] || null); });
  useEffect(() => { loadList(); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const reloadSel = () => api.get(`/analyses/${sel.id}`).then((r) => { setSel(r.data); setList(list.map((x) => (x.id === r.data.id ? r.data : x))); });

  const gen = async (p) => {
    try { const { data } = await api.post("/analyses/generate", { ...p, type }); toast.success("Analisis dibuat dari data laporan"); loadList(data); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const save = async () => { try { await api.put(`/analyses/${sel.id}`, { content: sel.content }); toast.success("Perubahan disimpan"); reloadSel(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async () => { if (!window.confirm("Hapus analisis ini?")) return; await api.delete(`/analyses/${sel.id}`); loadList(); };
  const setContent = (c) => setSel({ ...sel, content: c });

  return (
    <div>
      <PageHeader eyebrow="Analisis berbasis data" title={type === "swot" ? "Analisis SWOT & TOWS" : "Fishbone & 5 Why"} subtitle="Disusun AI hanya dari data laporan. Setiap butir ditandai Fakta (tertulis di data) atau Dugaan (perlu verifikasi), mencantumkan sumber data, dan divalidasi PJ serta Kepala Puskesmas.">
        <Button className="btn-primary rounded-full" data-testid="generate-analysis-button" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Buat analisis</Button>
      </PageHeader>
      <Tabs value={type} onValueChange={setType} className="mb-6">
        <TabsList className="bg-[#E6EEE8]"><TabsTrigger value="swot" data-testid="tab-swot">SWOT & TOWS</TabsTrigger><TabsTrigger value="fishbone" data-testid="tab-fishbone">Fishbone & 5 Why</TabsTrigger></TabsList>
      </Tabs>
      {list.length === 0 ? <Empty>Belum ada analisis. Pastikan laporan periode terkait sudah diajukan, lalu klik “Buat analisis”.</Empty> : (
        <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
          <div className="flex gap-2 overflow-x-auto pb-2 xl:flex-col xl:overflow-visible">
            {list.map((a) => (
              <button key={a.id} onClick={() => setSel(a)} data-testid={`analysis-item-${a.id}`} className={`w-56 shrink-0 rounded-xl border p-3 text-left transition-colors xl:w-full ${sel?.id === a.id ? "border-[#1A4D3A] bg-white" : "border-transparent bg-[#EEF4EF] hover:border-[#CFE0D4]"}`}>
                <div className="text-sm font-semibold text-slate-800">{a.program_name}</div>
                <div className="text-xs text-slate-500">{a.periode} · {fmtDate(a.created_at)}</div>
              </button>
            ))}
          </div>
          {sel && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-display text-xl font-semibold text-[#12372A]">{sel.program_name} · {sel.periode}</div>{sel.masalah && <div className="text-sm text-slate-600">Masalah: {sel.masalah}</div>}</div>
                <div className="flex gap-2">
                  <Button variant="outline" className="btn-soft" data-testid="delete-analysis-button" onClick={del}><Trash2 className="mr-1 h-4 w-4" />Hapus</Button>
                  <Button className="btn-primary" data-testid="save-analysis-button" onClick={save}><Save className="mr-1 h-4 w-4" />Simpan perubahan</Button>
                </div>
              </div>
              <div className="grid gap-6 2xl:grid-cols-[1fr_300px]">
                <div>{type === "swot" ? <SwotView content={sel.content} setContent={setContent} /> : <FishboneView content={sel.content} setContent={setContent} />}</div>
                <div className="space-y-4">
                  <ValidationPanel a={sel} onDone={reloadSel} />
                  <Card className="space-y-2 text-xs text-slate-600" data-testid="data-source-panel">
                    <div className="flex items-center gap-2 font-semibold text-slate-800"><Database className="h-3.5 w-3.5" />Sumber data</div>
                    <p>{sel.sumber_data}</p>
                    {sel.content.keterbatasan_data && <p><b>Keterbatasan data:</b> {sel.content.keterbatasan_data}</p>}
                    <div className="flex items-center gap-2 pt-2 font-semibold text-slate-800"><BookOpen className="h-3.5 w-3.5" />Kerangka rujukan</div>
                    <ul className="list-disc pl-4">{sel.rujukan.map((r) => <li key={r}>{r}</li>)}</ul>
                    <p className="italic">Disusun oleh {sel.created_by}. Tidak memuat referensi ilmiah selain kerangka metode di atas.</p>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <GenerateDialog open={open} onOpenChange={setOpen} programs={programs} withProblem={type === "fishbone"}
        title={type === "swot" ? "Buat analisis SWOT & TOWS" : "Buat analisis Fishbone & 5 Why"}
        description="Hanya laporan berstatus Diajukan/Perlu perbaikan/Disetujui yang digunakan. Jika data belum tersedia, analisis tidak dibuat." onGenerate={gen} />
    </div>
  );
}
