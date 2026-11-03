import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, errMsg, MONTHS, STATUS, fmtDate, currentPeriod, TERM } from "@/lib/api";
import { PageHeader, Card, StatusBadge, ProgramSelect, usePrograms, SimpleSelect, Field, Empty } from "@/components/common";
import { useAuth } from "@/context/AuthContext";

const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => ({ value: y, label: String(y) }));

const NewReportDialog = ({ open, onOpenChange, programs, T }) => {
  const nav = useNavigate();
  const cp = currentPeriod();
  const [f, setF] = useState({ program_id: "", year: cp.year, month: cp.month });
  const create = async () => {
    if (!f.program_id) return toast.error(`Pilih ${T}`);
    try { const { data } = await api.post("/reports", f); nav(`/laporan/${data.id}`); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Buat laporan bulanan</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label={T}><ProgramSelect noun={T} testid="new-report-program-select" programs={programs} value={f.program_id} onChange={(v) => setF({ ...f, program_id: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bulan"><SimpleSelect testid="new-report-month-select" value={f.month} onChange={(v) => setF({ ...f, month: Number(v) })} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} /></Field>
            <Field label="Tahun"><SimpleSelect testid="new-report-year-select" value={f.year} onChange={(v) => setF({ ...f, year: Number(v) })} options={YEARS} /></Field>
          </div>
          <p className="text-xs text-slate-500">Jika laporan untuk {T} & bulan tersebut sudah ada, laporan itu yang akan dibuka.</p>
        </div>
        <DialogFooter><Button className="btn-primary" data-testid="new-report-submit" onClick={create}>Buat & buka</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function Reports({ kind }) {
  const T = TERM[kind];
  const { user } = useAuth();
  const nav = useNavigate();
  const [programs] = usePrograms(kind);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState({ year: new Date().getFullYear(), program_id: "", status: user.role === "kepala" ? "diajukan" : "" });
  const [open, setOpen] = useState(false);
  const myPrograms = user.role === "admin" ? programs : programs.filter((p) => p.pj_user_id === user.id);

  useEffect(() => {
    api.get("/reports", { params: { kind, year: filter.year, program_id: filter.program_id || undefined, status: filter.status || undefined } }).then((r) => setRows(r.data));
  }, [filter, kind]);

  return (
    <div>
      <PageHeader eyebrow="Pelaporan" title={`Laporan ${T}`} subtitle="Isi sasaran, target, capaian, kendala, upaya, hasil upaya, rencana tindak lanjut, dan dukungan yang dibutuhkan setiap bulan.">
        {myPrograms.length > 0 && <Button data-testid="create-report-button" className="btn-primary rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Buat laporan</Button>}
      </PageHeader>
      <div className="mb-5 flex flex-wrap gap-2">
        <ProgramSelect programs={programs} value={filter.program_id} onChange={(v) => setFilter({ ...filter, program_id: v })} allowAll testid="filter-program-select" />
        <SimpleSelect testid="filter-status-select" className="w-48" value={filter.status || "all"} onChange={(v) => setFilter({ ...filter, status: v === "all" ? "" : v })}
          options={[{ value: "all", label: "Semua status" }, ...["draf", "diajukan", "perlu_perbaikan", "disetujui"].map((s) => ({ value: s, label: STATUS[s].label }))]} />
        <SimpleSelect testid="filter-year-select" className="w-28" value={filter.year} onChange={(v) => setFilter({ ...filter, year: Number(v) })} options={YEARS} />
      </div>
      {rows.length === 0 ? <Empty>Belum ada laporan untuk filter ini.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="bg-[#F3F7F2] text-left text-xs uppercase tracking-wider text-slate-500"><th className="px-5 py-3">{T}</th><th className="px-3">Periode</th><th className="px-3">Status</th><th className="px-3">Diajukan</th><th className="px-3">Diperbarui</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => nav(`/laporan/${r.id}`)} data-testid={`report-row-${r.id}`} className="cursor-pointer border-t border-[#EEF3EF] transition-colors hover:bg-[#F7FAF7]">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.program_name}</td>
                  <td className="px-3">{MONTHS[r.month - 1]} {r.year}</td>
                  <td className="px-3"><StatusBadge status={r.status} /></td>
                  <td className="px-3 text-slate-600">{fmtDate(r.submitted_at, true)}</td>
                  <td className="px-3 text-slate-600">{fmtDate(r.updated_at, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <NewReportDialog open={open} onOpenChange={setOpen} programs={myPrograms} T={T} />
    </div>
  );
}
