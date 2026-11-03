import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { api, fmtDate } from "@/lib/api";
import { PageHeader, Card, Empty } from "@/components/common";

export default function Activity() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/activity", { params: { limit: 500 } }).then((r) => setRows(r.data)); }, []);
  const list = rows.filter((r) => `${r.user_name} ${r.action} ${r.entity} ${r.detail}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader eyebrow="Audit" title="Riwayat Aktivitas" subtitle="Pencatatan seluruh aktivitas pengguna: pembuatan, perubahan, pengajuan, persetujuan, ekspor, dan validasi.">
        <Input data-testid="activity-search-input" placeholder="Cari aktivitas…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64 bg-white" />
      </PageHeader>
      {list.length === 0 ? <Empty>Tidak ada aktivitas.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="bg-[#F3F7F2] text-left text-xs uppercase tracking-wider text-slate-500"><th className="px-5 py-3">Waktu</th><th className="px-3">Pengguna</th><th className="px-3">Aktivitas</th><th className="px-3">Objek</th><th className="px-3">Detail</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} className="border-t border-[#EEF3EF]" data-testid={`activity-row-${r.id}`}>
                <td className="whitespace-nowrap px-5 py-2.5 text-xs text-slate-500">{fmtDate(r.created_at, true)}</td>
                <td className="px-3 font-medium">{r.user_name}</td><td className="px-3 capitalize">{r.action}</td>
                <td className="px-3 text-slate-600">{r.entity}</td><td className="px-3 text-slate-600">{r.detail}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
