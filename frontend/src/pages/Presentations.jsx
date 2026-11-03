import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Presentation as PIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg, fmtDate, download } from "@/lib/api";
import { PageHeader, Card, Empty, useMyPrograms } from "@/components/common";
import { GenerateDialog } from "@/components/GenerateDialog";

export default function Presentations() {
  const nav = useNavigate();
  const programs = useMyPrograms();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const load = () => api.get("/presentations").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const gen = async (p) => {
    try { const { data } = await api.post("/presentations/generate", p); toast.success("Presentasi dibuat"); nav(`/presentasi/${data.id}`); } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (p) => { if (!window.confirm(`Hapus ${p.title}?`)) return; await api.delete(`/presentations/${p.id}`); load(); };
  return (
    <div>
      <PageHeader eyebrow="Presentasi otomatis" title="Presentasi SPM & Program" subtitle="Slide capaian, grafik, kendala, upaya, analisis, dan tindak lanjut disusun otomatis dari laporan. Dapat diedit, ditayangkan layar penuh, dan diekspor ke PowerPoint/PDF.">
        <Button className="btn-primary rounded-full" data-testid="generate-presentation-button" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Buat presentasi</Button>
      </PageHeader>
      {rows.length === 0 ? <Empty>Belum ada presentasi.</Empty> : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <Card key={p.id} className="group flex flex-col gap-4 p-0 transition-shadow hover:shadow-md" data-testid={`presentation-card-${p.id}`}>
              <button onClick={() => nav(`/presentasi/${p.id}`)} className="relative aspect-video overflow-hidden rounded-t-2xl bg-[#1A4D3A] p-5 text-left text-white">
                <div className="grain absolute inset-0 opacity-40" />
                <PIcon className="relative h-5 w-5 text-emerald-200" />
                <div className="relative mt-6 font-display text-xl font-semibold leading-tight">{p.program_name}</div>
                <div className="relative mt-1 text-sm text-emerald-100">{p.periode}</div>
              </button>
              <div className="flex items-center justify-between px-5 pb-4">
                <span className="text-xs text-slate-500">{p.created_by} · {fmtDate(p.updated_at)}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="btn-soft h-8" data-testid={`pres-export-pptx-${p.id}`} onClick={() => download(`/export/presentation/${p.id}`, { format: "pptx" })}>PPTX</Button>
                  <Button size="sm" variant="outline" className="btn-soft h-8" data-testid={`pres-export-pdf-${p.id}`} onClick={() => download(`/export/presentation/${p.id}`, { format: "pdf" })}>PDF</Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`delete-presentation-${p.id}`} onClick={() => del(p)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <GenerateDialog open={open} onOpenChange={setOpen} programs={programs} title="Buat presentasi otomatis" description="Slide disusun otomatis dari data yang dientri PJ pada laporan bulanan (sasaran, target, capaian, kendala, upaya, hasil, RTL, dukungan). Analisis ditandai fakta atau dugaan." withDraft onGenerate={gen} />
    </div>
  );
}
