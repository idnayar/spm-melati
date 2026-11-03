import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, LayoutTemplate, Download, Upload, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, errMsg, fmtNum } from "@/lib/api";
import { evalRow, summarize, newKey, parseExcel, exportTableXlsx } from "@/lib/tableUtils";
import { Card, SimpleSelect, Field, NA } from "@/components/common";

const TYPES = [{ value: "text", label: "Teks" }, { value: "number", label: "Angka" }, { value: "date", label: "Tanggal" }, { value: "formula", label: "Rumus" }];
const SUMS = [{ value: "none", label: "—" }, { value: "sum", label: "Jumlah" }, { value: "avg", label: "Rata-rata" }, { value: "min", label: "Min" }, { value: "max", label: "Maks" }, { value: "count", label: "Hitung" }];

const ColumnMenu = ({ col, idx, update, remove }) => (
  <Popover>
    <PopoverTrigger asChild><button data-testid={`column-settings-${idx}`} className="rounded p-1 text-slate-400 hover:bg-[#E6EEE8] hover:text-[#1A4D3A]"><Settings2 className="h-3.5 w-3.5" /></button></PopoverTrigger>
    <PopoverContent className="w-72 space-y-3">
      <Field label="Nama kolom"><Input data-testid={`column-name-${idx}`} value={col.name} onChange={(e) => update({ ...col, name: e.target.value })} /></Field>
      <Field label="Tipe data"><SimpleSelect testid={`column-type-${idx}`} value={col.type} onChange={(v) => update({ ...col, type: v })} options={TYPES} /></Field>
      {col.type === "formula" && <Field label="Rumus" hint="Gunakan [Nama Kolom] dan + - * / ( ). Contoh: [Capaian]/[Sasaran]*100"><Input data-testid={`column-formula-${idx}`} value={col.formula} onChange={(e) => update({ ...col, formula: e.target.value })} /></Field>}
      <Button variant="outline" size="sm" className="w-full text-rose-600" data-testid={`delete-column-${idx}`} onClick={remove}><Trash2 className="mr-1 h-3.5 w-3.5" />Hapus kolom</Button>
    </PopoverContent>
  </Popover>
);

export default function TableEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const fileRef = useRef();
  useEffect(() => { api.get(`/tables/${id}`).then((r) => setT(r.data)).catch((e) => toast.error(errMsg(e))); }, [id]);
  const computed = useMemo(() => (t ? t.rows.map((r) => evalRow(r, t.columns)) : []), [t]);
  if (!t) return <div className="text-sm text-slate-500">Memuat…</div>;

  const setCol = (i, c) => setT({ ...t, columns: t.columns.map((x, j) => (j === i ? c : x)) });
  const setCell = (ri, key, v) => setT({ ...t, rows: t.rows.map((r, j) => (j === ri ? { ...r, [key]: v } : r)) });
  const body = (extra = {}) => ({ name: t.name, description: t.description || "", program_id: t.program_id || null, columns: t.columns, rows: t.rows, summary: t.summary || {}, is_template: t.is_template, ...extra });
  const save = async () => { try { await api.put(`/tables/${id}`, body()); toast.success("Tabel disimpan"); } catch (e) { toast.error(errMsg(e)); } };
  const saveTemplate = async () => { try { await api.post("/tables", body({ name: `Template ${t.name}`, is_template: true, rows: t.rows.map(() => ({})) })); toast.success("Template disimpan"); } catch (e) { toast.error(errMsg(e)); } };
  const onImport = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const x = await parseExcel(f); setT({ ...t, columns: x.columns, rows: x.rows, summary: {} }); toast.success(`Impor ${x.rows.length} baris — klik Simpan`); } catch (err) { toast.error(err.message); }
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <button onClick={() => nav("/tabel")} className="flex items-center gap-1 text-sm text-emerald-700 hover:underline" data-testid="back-to-tables"><ArrowLeft className="h-4 w-4" />Kembali</button>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input data-testid="table-name-input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} className="h-12 max-w-xl border-0 bg-transparent px-0 font-display text-3xl font-bold text-[#12372A] shadow-none focus-visible:ring-0" />
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} />
          <Button variant="outline" className="btn-soft" data-testid="table-import-button" onClick={() => fileRef.current.click()}><Upload className="mr-1 h-4 w-4" />Impor</Button>
          <Button variant="outline" className="btn-soft" data-testid="table-export-button" onClick={() => exportTableXlsx(t)}><Download className="mr-1 h-4 w-4" />Excel</Button>
          {!t.is_template && <Button variant="outline" className="btn-soft" data-testid="save-template-button" onClick={saveTemplate}><LayoutTemplate className="mr-1 h-4 w-4" />Simpan sebagai template</Button>}
          <Button className="btn-primary" data-testid="save-table-button" onClick={save}><Save className="mr-1 h-4 w-4" />Simpan</Button>
        </div>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F3F7F2]">
              <th className="w-10 px-2 text-xs text-slate-400">#</th>
              {t.columns.map((c, i) => (
                <th key={c.key} className="min-w-[150px] border-l border-[#E6EEE8] px-3 py-2 text-left">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{c.name}<span className="ml-1 font-normal normal-case text-emerald-700">· {TYPES.find((x) => x.value === c.type)?.label}</span></span>
                    <ColumnMenu col={c} idx={i} update={(nc) => setCol(i, nc)} remove={() => setT({ ...t, columns: t.columns.filter((_, j) => j !== i) })} />
                  </div>
                </th>
              ))}
              <th className="w-12 border-l border-[#E6EEE8] px-2">
                <button data-testid="add-column-button" onClick={() => setT({ ...t, columns: [...t.columns, { key: newKey(), name: `Kolom ${t.columns.length + 1}`, type: "text", formula: "" }] })} className="rounded p-1 text-emerald-700 hover:bg-[#E6EEE8]"><Plus className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri} className="border-t border-[#EEF3EF]" data-testid={`table-row-${ri}`}>
                <td className="px-2 text-center text-xs text-slate-400">{ri + 1}</td>
                {t.columns.map((c) => (
                  <td key={c.key} className="border-l border-[#EEF3EF] p-1">
                    {c.type === "formula" ? <div className="px-2 py-1.5">{computed[ri]?.[c.key] === null ? <NA /> : <span className="font-mono-num">{fmtNum(computed[ri]?.[c.key])}</span>}</div>
                      : <Input data-testid={`cell-${ri}-${c.key}`} type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"} value={r[c.key] ?? ""} onChange={(e) => setCell(ri, c.key, e.target.value)} className="h-8 border-transparent bg-transparent shadow-none hover:border-[#DCE7DF] focus-visible:bg-white" />}
                  </td>
                ))}
                <td className="border-l border-[#EEF3EF] text-center"><button data-testid={`delete-row-${ri}`} onClick={() => setT({ ...t, rows: t.rows.filter((_, j) => j !== ri) })} className="p-1 text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#CFE0D4] bg-[#F7FAF7]" data-testid="summary-row">
              <td className="px-2 text-[10px] font-bold uppercase text-emerald-800">Σ</td>
              {t.columns.map((c, i) => {
                const fn = t.summary?.[c.key] || "none";
                const val = fn === "none" ? null : summarize(computed.map((x) => x[c.key]), fn);
                return (
                  <td key={c.key} className="border-l border-[#EEF3EF] p-1">
                    <div className="flex items-center gap-2">
                      <SimpleSelect testid={`summary-fn-${i}`} className="h-8 w-28 text-xs" value={fn} onChange={(v) => setT({ ...t, summary: { ...t.summary, [c.key]: v } })} options={SUMS} />
                      {fn !== "none" && (val === null ? <NA /> : <span className="font-mono-num font-semibold">{fmtNum(val)}</span>)}
                    </div>
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </Card>
      <Button variant="outline" className="btn-soft" data-testid="add-row-button" onClick={() => setT({ ...t, rows: [...t.rows, {}] })}><Plus className="mr-1 h-4 w-4" />Tambah baris</Button>
    </div>
  );
}
