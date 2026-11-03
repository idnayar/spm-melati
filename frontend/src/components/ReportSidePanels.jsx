import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, MessageSquare, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, errMsg, fmtDate, fmtNum, STATUS } from "@/lib/api";
import { Card, Field, SimpleSelect, Empty, NA } from "@/components/common";

const TYPE = {
  komentar: { label: "Komentar", cls: "bg-slate-100 text-slate-700" },
  arahan: { label: "Arahan", cls: "bg-sky-100 text-sky-800" },
  perbaikan: { label: "Permintaan perbaikan", cls: "bg-amber-100 text-amber-800" },
  persetujuan: { label: "Persetujuan", cls: "bg-emerald-100 text-emerald-800" },
};

export const ReviewBar = ({ report, user, onDone }) => {
  const [note, setNote] = useState("");
  if (!["kepala", "admin"].includes(user.role) || report.status !== "diajukan") return null;
  const act = async (action) => {
    try { await api.post(`/reports/${report.id}/review`, { action, note }); toast.success(action === "setujui" ? "Laporan disetujui" : "Permintaan perbaikan dikirim ke PJ"); setNote(""); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card className="border-sky-200 bg-sky-50/60" data-testid="review-bar">
      <div className="mb-2 font-display font-semibold text-[#12372A]">Tinjauan Kepala Puskesmas</div>
      <Textarea data-testid="review-note-input" rows={2} placeholder="Catatan (wajib untuk permintaan perbaikan)" value={note} onChange={(e) => setNote(e.target.value)} className="bg-white" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="btn-primary" data-testid="approve-report-button" onClick={() => act("setujui")}><CheckCircle2 className="mr-1 h-4 w-4" />Setujui</Button>
        <Button variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-50" data-testid="request-revision-button" onClick={() => act("perbaikan")}><RotateCcw className="mr-1 h-4 w-4" />Minta perbaikan</Button>
      </div>
    </Card>
  );
};

export const FeedbackPanel = ({ report, user, onDone }) => {
  const isLead = ["kepala", "admin"].includes(user.role);
  const [f, setF] = useState({ type: "komentar", text: "", followup_title: "", followup_deadline: "" });
  const send = async () => {
    try {
      await api.post(`/reports/${report.id}/feedback`, { ...f, followup_deadline: f.followup_deadline || null });
      toast.success(f.type === "arahan" ? "Arahan dikirim & tindak lanjut dibuat" : "Komentar dikirim");
      setF({ type: "komentar", text: "", followup_title: "", followup_deadline: "" }); onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="space-y-3">
        <div className="font-display font-semibold text-[#12372A]">Tulis masukan</div>
        {isLead && <SimpleSelect testid="feedback-type-select" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: "komentar", label: "Komentar" }, { value: "arahan", label: "Arahan (buat tindak lanjut)" }]} />}
        <Textarea data-testid="feedback-text-input" rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Tulis komentar atau arahan…" className="bg-white" />
        {f.type === "arahan" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Judul tindak lanjut"><Input data-testid="followup-title-input" value={f.followup_title} onChange={(e) => setF({ ...f, followup_title: e.target.value })} /></Field>
            <Field label="Tenggat"><Input data-testid="followup-deadline-input" type="date" value={f.followup_deadline} onChange={(e) => setF({ ...f, followup_deadline: e.target.value })} /></Field>
          </div>
        )}
        <Button className="btn-primary" data-testid="send-feedback-button" disabled={!f.text.trim()} onClick={send}>Kirim</Button>
      </Card>
      <div className="space-y-3">
        {report.feedback.length === 0 && <Empty>Belum ada masukan.</Empty>}
        {report.feedback.map((x) => (
          <Card key={x.id} className="p-4" data-testid={`feedback-item-${x.id}`}>
            <div className="mb-1 flex items-center gap-2 text-xs">
              {x.type === "arahan" ? <Compass className="h-3.5 w-3.5 text-sky-700" /> : <MessageSquare className="h-3.5 w-3.5 text-slate-500" />}
              <span className={`rounded-full px-2 py-0.5 font-semibold ${TYPE[x.type]?.cls}`}>{TYPE[x.type]?.label}</span>
              <span className="font-medium text-slate-700">{x.author_name}</span><span className="text-slate-400">{fmtDate(x.created_at, true)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{x.text}</p>
            {x.followup_id && <p className="mt-1 text-xs text-sky-700">→ Tindak lanjut otomatis dibuat</p>}
          </Card>
        ))}
      </div>
    </div>
  );
};

export const RevisionList = ({ report }) => {
  const [view, setView] = useState(null);
  const inds = Object.fromEntries(report.program.indicators.map((i) => [i.id, i.name]));
  if (!report.revisions.length) return <Empty>Belum ada revisi tersimpan. Revisi tercatat saat simpan draf manual, pengajuan, dan peninjauan.</Empty>;
  return (
    <div className="relative space-y-3 border-l-2 border-[#CFE0D4] pl-6">
      {report.revisions.map((v) => (
        <div key={v.id} className="relative" data-testid={`revision-item-${v.version}`}>
          <span className="absolute -left-[31px] top-3 h-3 w-3 rounded-full border-2 border-white bg-[#1A4D3A]" />
          <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div><div className="text-sm font-semibold">Versi {v.version} · {STATUS[v.status]?.label}</div><div className="text-xs text-slate-500">{v.user_name} · {fmtDate(v.created_at, true)} · {v.note}</div></div>
            <Button size="sm" variant="outline" className="btn-soft" data-testid={`view-revision-${v.version}`} onClick={() => setView(v)}>Lihat</Button>
          </Card>
        </div>
      ))}
      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Versi {view?.version}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-3 text-sm">
              {view.snapshot.items.map((it) => (
                <div key={it.indicator_id} className="rounded-lg bg-[#F7FAF7] p-2"><b>{inds[it.indicator_id] || "Indikator"}</b>: sasaran {fmtNum(it.sasaran) ?? <NA />}, target {fmtNum(it.target, true) ?? <NA />}, capaian {fmtNum(it.capaian) ?? <NA />}</div>
              ))}
              {["kendala", "upaya", "hasil_upaya", "rtl", "dukungan"].map((k) => <p key={k}><b className="capitalize">{k.replace("_", " ")}:</b> {view.snapshot[k] || "-"}</p>)}
            </div>
          )}
          <DialogFooter><Button onClick={() => setView(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
