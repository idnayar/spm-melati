import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, FileSpreadsheet, FileDown, Presentation as PIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg, download, currentPeriod } from "@/lib/api";
import { PageHeader, Card, PeriodFilter, ProgramSelect, useMyPrograms, Empty, Field, SimpleSelect } from "@/components/common";

const FORMATS = [
  { f: "docx", label: "Word", icon: FileText },
  { f: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { f: "pdf", label: "PDF", icon: FileDown },
];

export default function Exports() {
  const [kind, setKind] = useState("spm");
  const programs = useMyPrograms(kind);
  const [per, setPer] = useState(currentPeriod());
  const [programId, setProgramId] = useState("");
  const [busy, setBusy] = useState("");
  const [pres, setPres] = useState([]);
  useEffect(() => { api.get("/presentations").then((r) => setPres(r.data)); }, []);

  const run = async (key, url, params) => {
    setBusy(key);
    try { await download(url, params); toast.success("Berkas diunduh"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };

  return (
    <div>
      <PageHeader eyebrow="Ekspor" title="Ekspor Laporan & Presentasi" subtitle="Unduh laporan satu SPM/program atau kolektif ke Word, Excel, dan PDF; presentasi ke PowerPoint yang dapat diedit dan PDF." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-5" data-testid="export-report-card">
          <div className="font-display text-lg font-semibold text-[#12372A]">Laporan</div>
          <Field label="Jenis laporan"><SimpleSelect testid="export-kind-select" value={kind} onChange={(v) => { setKind(v); setProgramId(""); }} options={[{ value: "spm", label: "SPM (Standar Pelayanan Minimal)" }, { value: "program", label: "Program" }]} /></Field>
          <Field label="Cakupan"><ProgramSelect programs={programs} value={programId} onChange={setProgramId} allowAll noun={kind === "spm" ? "SPM" : "Program"} testid="export-program-select" /></Field>
          <p className="-mt-3 text-xs text-slate-500">“Semua” menghasilkan laporan kolektif sesuai jenis laporan.</p>
          <Field label="Periode"><PeriodFilter value={per} onChange={setPer} /></Field>
          <div className="grid grid-cols-3 gap-3">
            {FORMATS.map(({ f, label, icon: Icon }) => (
              <Button key={f} variant="outline" data-testid={`export-report-${f}`} disabled={!!busy} className="btn-soft flex h-20 flex-col gap-1 rounded-xl"
                onClick={() => run(f, "/export/report", { format: f, ...per, kind, program_id: programId || undefined })}>
                {busy === f ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}{label}
              </Button>
            ))}
          </div>
        </Card>
        <Card className="space-y-4" data-testid="export-presentation-card">
          <div className="font-display text-lg font-semibold text-[#12372A]">Presentasi</div>
          {pres.length === 0 ? <Empty>Belum ada presentasi. Buat dari menu Presentasi.</Empty> : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {pres.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#EEF3EF] p-3">
                  <div className="flex min-w-0 items-center gap-2"><PIcon className="h-4 w-4 shrink-0 text-emerald-700" /><span className="truncate text-sm font-medium">{p.title}</span></div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" className="btn-soft h-8" data-testid={`export-pptx-${p.id}`} onClick={() => run(`pptx-${p.id}`, `/export/presentation/${p.id}`, { format: "pptx" })}>PPTX</Button>
                    <Button size="sm" variant="outline" className="btn-soft h-8" data-testid={`export-ppdf-${p.id}`} onClick={() => run(`pdf-${p.id}`, `/export/presentation/${p.id}`, { format: "pdf" })}>PDF</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
