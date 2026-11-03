import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, CalendarClock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, errMsg, FU_STATUS, fmtDate } from "@/lib/api";
import { PageHeader, Card, Field, SimpleSelect, ProgramSelect, usePrograms, FuBadge, Empty } from "@/components/common";
import { useAuth } from "@/context/AuthContext";

const FuDialog = ({ data, onClose, programs, onSaved, canDelete }) => {
  const [f, setF] = useState(data);
  useEffect(() => setF(data), [data]);
  if (!f) return null;
  const save = async () => {
    try {
      const body = { program_id: f.program_id, title: f.title, description: f.description || "", pj_user_id: f.pj_user_id || null, deadline: f.deadline || null, status: f.status || "belum", result: f.result || "" };
      if (f.id) await api.put(`/followups/${f.id}`, body); else await api.post("/followups", body);
      toast.success("Tindak lanjut disimpan"); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async () => { if (!window.confirm("Hapus tindak lanjut?")) return; await api.delete(`/followups/${f.id}`); onSaved(); onClose(); };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? "Perbarui tindak lanjut" : "Tindak lanjut baru"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!f.id && <Field label="SPM / Program"><ProgramSelect testid="fu-program-select" programs={programs} value={f.program_id} onChange={(v) => setF({ ...f, program_id: v })} /></Field>}
          <Field label="Judul"><Input data-testid="fu-title-input" value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Uraian / arahan"><Textarea rows={3} value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><SimpleSelect testid="fu-status-select" value={f.status || "belum"} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(FU_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} /></Field>
            <Field label="Tenggat"><Input data-testid="fu-deadline-input" type="date" value={(f.deadline || "").slice(0, 10)} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
          </div>
          <Field label="Hasil tindak lanjut"><Textarea data-testid="fu-result-input" rows={3} value={f.result || ""} onChange={(e) => setF({ ...f, result: e.target.value })} placeholder="Tuliskan hasil yang sudah dicapai" /></Field>
        </div>
        <DialogFooter className="gap-2">
          {f.id && canDelete && <Button variant="outline" className="text-rose-600" data-testid="fu-delete-button" onClick={del}><Trash2 className="mr-1 h-4 w-4" />Hapus</Button>}
          <Button className="btn-primary" data-testid="fu-save-button" disabled={!f.title || !f.program_id} onClick={save}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function FollowUps() {
  const { user } = useAuth();
  const [programs] = usePrograms();
  const [programId, setProgramId] = useState("");
  const [rows, setRows] = useState([]);
  const [dlg, setDlg] = useState(null);
  const load = () => api.get("/followups", { params: { program_id: programId || undefined } }).then((r) => setRows(r.data));
  useEffect(() => { load(); }, [programId]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = async (f, status) => { try { await api.put(`/followups/${f.id}`, { ...f, status }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const selectable = user.role === "pj" ? programs.filter((p) => p.pj_user_id === user.id) : programs;

  return (
    <div>
      <PageHeader eyebrow="Pemantauan" title="Tindak Lanjut" subtitle="Pantau arahan Kepala Puskesmas dan rencana tindak lanjut: belum dikerjakan, sedang dikerjakan, selesai — lengkap dengan hasil dan tenggat.">
        <ProgramSelect programs={programs} value={programId} onChange={setProgramId} allowAll testid="fu-filter-program" />
        <Button className="btn-primary rounded-full" data-testid="add-followup-button" onClick={() => setDlg({ status: "belum", program_id: selectable[0]?.id })}><Plus className="mr-1 h-4 w-4" />Tambah</Button>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-3">
        {Object.entries(FU_STATUS).map(([k, s]) => {
          const list = rows.filter((r) => r.status === k);
          return (
            <div key={k} className="rounded-2xl bg-[#EEF4EF] p-3" data-testid={`fu-column-${k}`}>
              <div className="mb-3 flex items-center justify-between px-1"><FuBadge status={k} /><span className="font-mono text-xs text-slate-500">{list.length}</span></div>
              <div className="space-y-3">
                {list.length === 0 && <Empty>Kosong</Empty>}
                {list.map((f) => (
                  <Card key={f.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md" data-testid={`fu-card-${f.id}`} onClick={() => setDlg(f)}>
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{f.program_name}</div>
                    <div className="mt-1 font-medium text-slate-800">{f.title}</div>
                    {f.result && <div className="mt-2 line-clamp-2 text-xs text-slate-600">Hasil: {f.result}</div>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className={`flex items-center gap-1 ${f.overdue ? "font-semibold text-rose-600" : "text-slate-500"}`} data-testid={f.overdue ? "fu-overdue" : undefined}><CalendarClock className="h-3.5 w-3.5" />{f.deadline ? fmtDate(f.deadline) : "Tanpa tenggat"}{f.overdue && " · lewat"}</span>
                      <span className="text-slate-500">{f.pj_name}</span>
                    </div>
                    <div className="mt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {Object.keys(FU_STATUS).filter((x) => x !== k).map((x) => (
                        <button key={x} data-testid={`fu-move-${f.id}-${x}`} onClick={() => move(f, x)} className="rounded-full border border-[#CFE0D4] px-2 py-0.5 text-[10px] font-medium text-[#1A4D3A] hover:bg-[#EEF4EF]">→ {FU_STATUS[x].label}</button>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <FuDialog data={dlg} onClose={() => setDlg(null)} programs={selectable} onSaved={load} canDelete={["admin", "kepala"].includes(user.role)} />
    </div>
  );
}
