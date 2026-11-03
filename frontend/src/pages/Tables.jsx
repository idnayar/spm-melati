import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Upload, LayoutTemplate, Trash2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errMsg, fmtDate } from "@/lib/api";
import { parseExcel, newKey } from "@/lib/tableUtils";
import { PageHeader, Card, Empty } from "@/components/common";

const TableCard = ({ t, onOpen, onDelete, onUse }) => (
  <Card className="flex flex-col gap-3 transition-shadow hover:shadow-md" data-testid={`table-card-${t.id}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2"><Table2 className="h-4 w-4 text-emerald-700" /><span className="font-display font-semibold text-[#12372A]">{t.name}</span></div>
      <button onClick={onDelete} data-testid={`delete-table-${t.id}`} className="text-slate-400 transition-colors hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
    </div>
    <div className="text-xs text-slate-500">{t.columns.length} kolom · {t.rows.length} baris · {t.owner_name} · {fmtDate(t.updated_at)}</div>
    <div className="mt-auto flex gap-2">
      <Button size="sm" variant="outline" className="btn-soft" data-testid={`open-table-${t.id}`} onClick={onOpen}>Buka</Button>
      {onUse && <Button size="sm" className="btn-primary" data-testid={`use-template-${t.id}`} onClick={onUse}>Gunakan template</Button>}
    </div>
  </Card>
);

export default function Tables() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const fileRef = useRef();
  const load = () => api.get("/tables").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async (body) => {
    try { const { data } = await api.post("/tables", body); nav(`/tabel/${data.id}`); } catch (e) { toast.error(errMsg(e)); }
  };
  const blank = () => {
    const cols = [{ key: newKey(), name: "Uraian", type: "text", formula: "" }, { key: newKey(), name: "Sasaran", type: "number", formula: "" }, { key: newKey(), name: "Capaian", type: "number", formula: "" }, { key: newKey(), name: "Persentase", type: "formula", formula: "[Capaian]/[Sasaran]*100" }];
    create({ name: "Tabel baru", columns: cols, rows: [{}], summary: {} });
  };
  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { const t = await parseExcel(f); if (!t.columns.length) throw new Error("Berkas kosong"); toast.success(`Impor ${t.rows.length} baris`); create({ ...t, summary: {} }); }
    catch (err) { toast.error(`Gagal impor: ${err.message}`); }
    e.target.value = "";
  };
  const del = async (t) => { if (!window.confirm(`Hapus ${t.name}?`)) return; try { await api.delete(`/tables/${t.id}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const tables = rows.filter((t) => !t.is_template);
  const templates = rows.filter((t) => t.is_template);

  return (
    <div>
      <PageHeader eyebrow="Data pendukung" title="Tabel Fleksibel" subtitle="Buat tabel sendiri: tambah baris, kolom, tipe data, dan perhitungan sederhana. Simpan sebagai template atau impor dari Excel.">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} data-testid="import-excel-input" />
        <Button variant="outline" className="btn-soft rounded-full" data-testid="import-excel-button" onClick={() => fileRef.current.click()}><Upload className="mr-1 h-4 w-4" />Impor Excel</Button>
        <Button className="btn-primary rounded-full" data-testid="create-table-button" onClick={blank}><Plus className="mr-1 h-4 w-4" />Tabel baru</Button>
      </PageHeader>
      <Tabs defaultValue="tabel">
        <TabsList className="bg-[#E6EEE8]"><TabsTrigger value="tabel" data-testid="tab-tables">Tabel ({tables.length})</TabsTrigger><TabsTrigger value="template" data-testid="tab-templates"><LayoutTemplate className="mr-1 h-3.5 w-3.5" />Template ({templates.length})</TabsTrigger></TabsList>
        <TabsContent value="tabel" className="pt-4">
          {tables.length === 0 ? <Empty>Belum ada tabel. Buat tabel baru atau impor dari Excel.</Empty> : (
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{tables.map((t) => <TableCard key={t.id} t={t} onOpen={() => nav(`/tabel/${t.id}`)} onDelete={() => del(t)} />)}</div>
          )}
        </TabsContent>
        <TabsContent value="template" className="pt-4">
          {templates.length === 0 ? <Empty>Belum ada template. Buka sebuah tabel lalu pilih “Simpan sebagai template”.</Empty> : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map((t) => <TableCard key={t.id} t={t} onOpen={() => nav(`/tabel/${t.id}`)} onDelete={() => del(t)}
                onUse={() => create({ name: `${t.name} (salinan)`, columns: t.columns, rows: t.rows.map(() => ({})), summary: t.summary, description: t.description })} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
