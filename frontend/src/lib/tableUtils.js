import * as XLSX from "xlsx";

export const newKey = () => Math.random().toString(36).slice(2, 9);

export function evalRow(row, columns) {
  const byName = {};
  const out = {};
  columns.forEach((c) => {
    let v = row[c.key];
    if (c.type === "formula") {
      const expr = (c.formula || "").replace(/\[([^\]]+)\]/g, (_, n) => {
        const x = byName[n.trim()];
        return x === null || x === undefined || x === "" || isNaN(Number(x)) ? "NaN" : `(${Number(x)})`;
      });
      if (!/^[\d+\-*/().\sNa]*$/.test(expr) || !expr.trim()) v = null;
      else {
        try {
          // eslint-disable-next-line no-new-func
          const r = Function(`"use strict";return (${expr})`)();
          v = Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
        } catch { v = null; }
      }
    } else if (c.type === "number") v = v === "" || v === undefined || v === null ? null : Number(v);
    byName[c.name] = v;
    out[c.key] = v;
  });
  return out;
}

export function summarize(values, fn) {
  const nums = values.filter((v) => v !== null && v !== undefined && v !== "" && !isNaN(Number(v))).map(Number);
  if (fn === "count") return values.filter((v) => v !== null && v !== undefined && v !== "").length;
  if (!nums.length) return null;
  if (fn === "sum") return nums.reduce((a, b) => a + b, 0);
  if (fn === "avg") return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  if (fn === "min") return Math.min(...nums);
  if (fn === "max") return Math.max(...nums);
  return null;
}

export async function parseExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer());
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const [head = [], ...body] = aoa.filter((r) => r.some((c) => c !== ""));
  const columns = head.map((h, i) => {
    const vals = body.map((r) => r[i]).filter((v) => v !== "");
    const numeric = vals.length > 0 && vals.every((v) => !isNaN(Number(v)));
    return { key: newKey(), name: String(h || `Kolom ${i + 1}`), type: numeric ? "number" : "text", formula: "" };
  });
  const rows = body.map((r) => Object.fromEntries(columns.map((c, i) => [c.key, r[i] === "" ? null : r[i]])));
  return { name: file.name.replace(/\.(xlsx|xls|csv)$/i, ""), columns, rows };
}

export function exportTableXlsx(t) {
  const rows = t.rows.map((r) => evalRow(r, t.columns));
  const aoa = [t.columns.map((c) => c.name), ...rows.map((r) => t.columns.map((c) => r[c.key] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tabel");
  XLSX.writeFile(wb, `${t.name || "tabel"}.xlsx`);
}
