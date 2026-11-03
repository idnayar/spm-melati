import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useParams } from "react-router-dom";
import { api, errMsg, METHODS, fmtNum, TERM } from "@/lib/api";
import { PageHeader, Card, Field, SimpleSelect, usePrograms, NA, Empty } from "@/components/common";
import { useAuth } from "@/context/AuthContext";

const ProgramDialog = ({ data, onClose, users, onSaved, admin, T, kind }) => {
  const [f, setF] = useState(data || {});
  const [label, setLabel] = useState("");
  useEffect(() => setF(data || {}), [data]);
  const labels = f.labels || [];
  const profile = f.profile || [];
  const addLabel = () => { const v = label.trim(); if (v && !labels.includes(v)) setF({ ...f, labels: [...labels, v] }); setLabel(""); };
  const setProf = (i, k, v) => setF({ ...f, profile: profile.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const save = async () => {
    try {
      const body = { name: f.name, code: f.code || "", description: f.description || "", pj_user_id: f.pj_user_id || null, labels, profile: profile.filter((x) => x.label?.trim()), kind: f.kind || kind };
      if (f.id) await api.put(`/programs/${f.id}`, body); else await api.post("/programs", body);
      toast.success(`Profil ${T} disimpan`); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={!!data} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? `Ubah profil ${T}` : `Tambah ${T}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label={`Nama ${T}`}><Input data-testid="program-name-input" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Kode"><Input data-testid="program-code-input" value={f.code || ""} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          </div>
          {admin && (
            <Field label="Penanggung jawab (PJ)">
              <SimpleSelect testid="program-pj-select" value={f.pj_user_id || undefined} placeholder="Pilih PJ" onChange={(v) => setF({ ...f, pj_user_id: v })} options={users.filter((u) => u.role === "pj").map((u) => ({ value: u.id, label: u.name }))} />
            </Field>
          )}
          <Field label="Deskripsi"><Textarea data-testid="program-description-input" value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label={`Label ${T}`}>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded-full bg-[#E6F0E8] px-2.5 py-0.5 text-xs font-medium text-[#1A4D3A]" data-testid={`program-label-chip-${l}`}>
                  {l}<button type="button" onClick={() => setF({ ...f, labels: labels.filter((x) => x !== l) })} data-testid={`remove-label-${l}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input data-testid="program-label-input" value={label} placeholder="mis. SPM, Prioritas, UKM Esensial" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }} />
              <Button type="button" variant="outline" className="btn-soft" data-testid="add-label-button" onClick={addLabel}>Tambah</Button>
            </div>
          </Field>
          <Field label={`Isian profil ${T}`} hint="Tambah butir sesuai kebutuhan, mis. Tujuan, Wilayah kerja, Sasaran utama, Mitra lintas sektor.">
            <div className="space-y-2">
              {profile.map((x, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr_auto] gap-2">
                  <Input data-testid={`profile-label-${i}`} placeholder="Judul" value={x.label} onChange={(e) => setProf(i, "label", e.target.value)} />
                  <Input data-testid={`profile-value-${i}`} placeholder="Isi" value={x.value} onChange={(e) => setProf(i, "value", e.target.value)} />
                  <Button type="button" size="icon" variant="ghost" data-testid={`profile-delete-${i}`} onClick={() => setF({ ...f, profile: profile.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="btn-soft" data-testid="add-profile-field-button" onClick={() => setF({ ...f, profile: [...profile, { label: "", value: "" }] })}><Plus className="mr-1 h-3.5 w-3.5" />Tambah butir profil</Button>
            </div>
          </Field>
        </div>
        <DialogFooter><Button className="btn-primary" data-testid="save-program-button" disabled={!f.name} onClick={save}>Simpan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const IndicatorDialog = ({ data, onClose, onSaved }) => {
  const [f, setF] = useState(data || {});
  useEffect(() => setF(data || {}), [data]);
  const n = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
  const save = async () => {
    try {
      const body = { name: f.name, unit: f.unit || "", target: n(f.target), sasaran: n(f.sasaran), method: f.method || "kumulatif", definition: f.definition || "", order: f.order || 0 };
      if (f.id) await api.put(`/indicators/${f.id}`, body); else await api.post(`/programs/${f.program_id}/indicators`, body);
      toast.success("Indikator disimpan"); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={!!data} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? "Ubah indikator" : "Tambah indikator"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Nama indikator"><Input data-testid="indicator-name-input" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Satuan"><Input data-testid="indicator-unit-input" value={f.unit || ""} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
            <Field label="Target (%)"><Input data-testid="indicator-target-input" type="number" value={f.target ?? ""} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
            <Field label="Sasaran awal"><Input data-testid="indicator-sasaran-input" type="number" value={f.sasaran ?? ""} onChange={(e) => setF({ ...f, sasaran: e.target.value })} /></Field>
          </div>
          <Field label="Metode perhitungan rekap" hint={METHODS[f.method || "kumulatif"].hint}>
            <SimpleSelect testid="indicator-method-select" value={f.method || "kumulatif"} onChange={(v) => setF({ ...f, method: v })} options={Object.entries(METHODS).map(([k, m]) => ({ value: k, label: m.label }))} />
          </Field>
          <Field label="Definisi operasional / rumus"><Textarea data-testid="indicator-definition-input" value={f.definition || ""} onChange={(e) => setF({ ...f, definition: e.target.value })} placeholder="mis. Jumlah ibu hamil K6 / jumlah sasaran ibu hamil × 100%" /></Field>
        </div>
        <DialogFooter><Button className="btn-primary" data-testid="save-indicator-button" disabled={!f.name} onClick={save}>Simpan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function Programs() {
  const { kind = "program" } = useParams();
  const T = TERM[kind] || "Program";
  const { user } = useAuth();
  const admin = user.role === "admin";
  const [allPrograms, reload] = usePrograms(kind);
  const programs = user.role === "pj" ? allPrograms.filter((p) => p.pj_user_id === user.id) : allPrograms;
  const canEdit = (p) => admin || (user.role === "pj" && p.pj_user_id === user.id);
  const [users, setUsers] = useState([]);
  const [pd, setPd] = useState(null);
  const [idlg, setIdlg] = useState(null);
  useEffect(() => { if (admin) api.get("/users").then((r) => setUsers(r.data)); }, [admin]);
  const del = async (url, msg) => { if (!window.confirm(msg)) return; try { await api.delete(url); toast.success("Dihapus"); reload(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div>
      <PageHeader eyebrow="Master data" title={user.role === "pj" ? `${T} Saya` : kind === "spm" ? "Data SPM" : "Program & Indikator"} subtitle={user.role === "pj" ? "Isi, tambah, hapus, dan beri label profil serta indikator yang Anda pegang." : "Kelola SPM/program, PJ, indikator, satuan, target, dan metode perhitungan. Target contoh dapat disesuaikan dengan ketentuan yang berlaku."}>
        {["admin", "pj"].includes(user.role) && <Button className="btn-primary rounded-full" data-testid="add-program-button" onClick={() => setPd({})}><Plus className="mr-1 h-4 w-4" />Tambah {T}</Button>}
      </PageHeader>
      {programs.length === 0 && <Empty>Belum ada {T}.</Empty>}
      <div className="stagger space-y-5">
        {programs.map((p) => (
          <Card key={p.id} className="p-0" data-testid={`program-card-${p.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6EEE8] px-5 py-4">
              <div>
                <div className="flex items-center gap-2"><span className="rounded-md bg-[#1A4D3A] px-2 py-0.5 font-mono text-[11px] text-white">{p.code || "—"}</span><span className="font-display text-lg font-semibold text-[#12372A]">{p.name}</span></div>
                <div className="mt-1 text-xs text-slate-500">PJ: {p.pj_name || "Belum ditetapkan"} {p.description && `· ${p.description}`}</div>
                {p.labels?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{p.labels.map((l) => <span key={l} data-testid={`program-label-${p.id}-${l}`} className="rounded-full bg-[#E6F0E8] px-2.5 py-0.5 text-[11px] font-medium text-[#1A4D3A]">{l}</span>)}</div>}
              </div>
              {canEdit(p) && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="btn-soft" data-testid={`add-indicator-${p.id}`} onClick={() => setIdlg({ program_id: p.id, method: "kumulatif" })}><Plus className="mr-1 h-3.5 w-3.5" />Indikator</Button>
                  <Button size="icon" variant="ghost" data-testid={`edit-program-${p.id}`} onClick={() => setPd(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" data-testid={`delete-program-${p.id}`} onClick={() => del(`/programs/${p.id}`, `Hapus ${T} ${p.name} beserta indikatornya?`)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                </div>
              )}
            </div>
            {p.profile?.length > 0 && (
              <dl className="grid gap-x-6 gap-y-2 border-b border-[#E6EEE8] bg-[#FAFCFA] px-5 py-3 text-sm sm:grid-cols-2" data-testid={`program-profile-${p.id}`}>
                {p.profile.map((x, k) => <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">{x.label}</dt><dd className="text-slate-700">{x.value || "-"}</dd></div>)}
              </dl>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500"><th className="px-5 py-2">Indikator</th><th className="px-3">Satuan</th><th className="px-3">Target</th><th className="px-3">Metode</th>{canEdit(p) && <th />}</tr></thead>
                <tbody>
                  {p.indicators.map((i) => (
                    <tr key={i.id} className="border-t border-[#EEF3EF]" data-testid={`indicator-row-${i.id}`}>
                      <td className="px-5 py-2.5"><div className="font-medium">{i.name}</div>{i.definition && <div className="text-xs text-slate-500">{i.definition}</div>}</td>
                      <td className="px-3">{i.unit || "-"}</td>
                      <td className="px-3">{fmtNum(i.target, true) ?? <NA />}</td>
                      <td className="px-3"><span className="rounded bg-[#EEF4EF] px-2 py-0.5 text-xs text-emerald-800">{METHODS[i.method]?.label}</span></td>
                      {canEdit(p) && <td className="whitespace-nowrap px-3 text-right">
                        <Button size="icon" variant="ghost" data-testid={`edit-indicator-${i.id}`} onClick={() => setIdlg(i)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" data-testid={`delete-indicator-${i.id}`} onClick={() => del(`/indicators/${i.id}`, `Hapus indikator ${i.name}?`)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
      <ProgramDialog data={pd} onClose={() => setPd(null)} users={users} onSaved={reload} admin={admin} T={T} kind={kind} />
      <IndicatorDialog data={idlg} onClose={() => setIdlg(null)} onSaved={reload} />
    </div>
  );
}
