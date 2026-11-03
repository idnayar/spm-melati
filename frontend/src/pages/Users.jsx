import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, errMsg, ROLES } from "@/lib/api";
import { PageHeader, Card, Field, SimpleSelect } from "@/components/common";

const ROLE_CLS = { admin: "bg-violet-50 text-violet-800", pj: "bg-emerald-50 text-emerald-800", kepala: "bg-amber-50 text-amber-800" };

export default function UsersPage() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null);
  const load = () => api.get("/users").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const save = async () => {
    try {
      const body = { name: f.name, email: f.email, role: f.role, active: f.active !== false, password: f.password || null };
      if (f.id) await api.put(`/users/${f.id}`, body); else await api.post("/users", body);
      toast.success("Pengguna disimpan"); setF(null); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (u) => { if (!window.confirm(`Hapus ${u.name}?`)) return; try { await api.delete(`/users/${u.id}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div>
      <PageHeader eyebrow="Hak akses" title="Pengguna" subtitle="Admin mengelola aplikasi, PJ mengisi laporan SPM/program-nya, Kepala Puskesmas memantau dan memberi masukan.">
        <Button className="btn-primary rounded-full" data-testid="add-user-button" onClick={() => setF({ role: "pj", active: true })}><Plus className="mr-1 h-4 w-4" />Tambah pengguna</Button>
      </PageHeader>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead><tr className="bg-[#F3F7F2] text-left text-xs uppercase tracking-wider text-slate-500"><th className="px-5 py-3">Nama</th><th className="px-3">Email</th><th className="px-3">Peran</th><th className="px-3">Status</th><th /></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-[#EEF3EF]" data-testid={`user-row-${u.id}`}>
                <td className="px-5 py-3 font-medium">{u.name}</td><td className="px-3 text-slate-600">{u.email}</td>
                <td className="px-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_CLS[u.role]}`}>{ROLES[u.role]}</span></td>
                <td className="px-3 text-xs">{u.active === false ? "Nonaktif" : "Aktif"}</td>
                <td className="whitespace-nowrap px-3 text-right">
                  <Button size="icon" variant="ghost" data-testid={`edit-user-${u.id}`} onClick={() => setF({ ...u, password: "" })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" data-testid={`delete-user-${u.id}`} onClick={() => del(u)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={!!f} onOpenChange={() => setF(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{f?.id ? "Ubah pengguna" : "Tambah pengguna"}</DialogTitle></DialogHeader>
          {f && (
            <div className="space-y-3">
              <Field label="Nama"><Input data-testid="user-name-input" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Email"><Input data-testid="user-email-input" type="email" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Peran"><SimpleSelect testid="user-role-select" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={Object.entries(ROLES).map(([k, v]) => ({ value: k, label: v }))} /></Field>
              <Field label={f.id ? "Kata sandi baru (kosongkan jika tidak diubah)" : "Kata sandi"}><Input data-testid="user-password-input" type="password" value={f.password || ""} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><Switch data-testid="user-active-switch" checked={f.active !== false} onCheckedChange={(v) => setF({ ...f, active: v })} />Aktif</label>
            </div>
          )}
          <DialogFooter><Button className="btn-primary" data-testid="save-user-button" onClick={save}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
