import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { currentPeriod } from "@/lib/api";
import { Field, PeriodFilter, ProgramSelect } from "@/components/common";

export const GenerateDialog = ({ open, onOpenChange, programs, title, description, onGenerate, withProblem, withDraft }) => {
  const [per, setPer] = useState(currentPeriod());
  const [programId, setProgramId] = useState("");
  const [masalah, setMasalah] = useState("");
  const [draft, setDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onGenerate({ ...per, program_id: programId, masalah, include_draft: draft }); onOpenChange(false); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label="SPM / Program"><ProgramSelect testid="generate-program-select" programs={programs} value={programId} onChange={setProgramId} /></Field>
          <Field label="Periode data"><PeriodFilter value={per} onChange={setPer} /></Field>
          {withProblem && <Field label="Masalah (opsional)" hint="Kosongkan agar sistem memilih indikator dengan kesenjangan terbesar terhadap target."><Textarea data-testid="generate-problem-input" rows={2} value={masalah} onChange={(e) => setMasalah(e.target.value)} /></Field>}
          {withDraft && (
            <label className="flex items-start gap-3 text-sm">
              <Switch data-testid="include-draft-switch" checked={draft} onCheckedChange={setDraft} />
              <span>Sertakan entri PJ yang masih draf<span className="block text-xs text-slate-500">Matikan untuk hanya memakai laporan yang sudah diajukan/disetujui.</span></span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button className="btn-primary" data-testid="generate-submit-button" disabled={!programId || busy} onClick={go}>
            {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Menyusun dari data…</> : "Buat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
