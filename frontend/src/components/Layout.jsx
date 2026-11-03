import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, ListChecks, Table2, Presentation, Microscope, Download, Layers, Users, BellRing, History, Menu, Bell, LogOut, KeyRound } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { api, ROLES, fmtDate } from "@/lib/api";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";

const NAV = [
  { group: "SPM" },
  { to: "/dashboard/spm", label: "Dashboard SPM", icon: LayoutDashboard, id: "dashboard-spm" },
  { to: "/laporan-spm", label: "Laporan SPM", icon: FileText, id: "laporan-spm" },
  { to: "/master/spm", label: "Data SPM", icon: Layers, id: "master-spm" },
  { group: "Program" },
  { to: "/dashboard/program", label: "Dashboard Program", icon: LayoutDashboard, id: "dashboard-program" },
  { to: "/laporan-program", label: "Laporan Program", icon: FileText, id: "laporan-program" },
  { to: "/master/program", label: "Program & Indikator", icon: Layers, id: "master-program" },
  { group: "Evaluasi & Alat" },
  { to: "/tindak-lanjut", label: "Tindak Lanjut", icon: ListChecks, id: "tindak-lanjut" },
  { to: "/analisis", label: "SWOT & Fishbone", icon: Microscope, id: "analisis" },
  { to: "/presentasi", label: "Presentasi", icon: Presentation, id: "presentasi" },
  { to: "/tabel", label: "Tabel Fleksibel", icon: Table2, id: "tabel" },
  { to: "/ekspor", label: "Ekspor", icon: Download, id: "ekspor" },
  { to: "/pengguna", label: "Pengguna", icon: Users, id: "pengguna", roles: ["admin"] },
  { to: "/pengingat", label: "Pengingat & Integrasi", icon: BellRing, id: "pengingat" },
  { to: "/aktivitas", label: "Riwayat Aktivitas", icon: History, id: "aktivitas", roles: ["admin", "kepala"] },
];

const SideNav = ({ role, onNavigate }) => (
  <nav className="flex h-full flex-col">
    <div className="px-5 pb-6 pt-6">
      <img src="/logo.png" alt="MELATI Program Hub" className="h-14 w-auto object-contain" data-testid="sidebar-logo" />
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-800/70">UPT Puskesmas Melati</div>
    </div>
    <div className="flex-1 space-y-1 overflow-y-auto px-3">
      {NAV.filter((n) => !n.roles || n.roles.includes(role)).map((n) => n.group ? (
        <div key={n.group} className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800/60">{n.group}</div>
      ) : (
        <NavLink key={n.to} to={n.to} onClick={onNavigate} data-testid={`sidebar-nav-${n.id}`}
          className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${isActive ? "bg-[#1A4D3A] text-white shadow-sm" : "text-slate-700 hover:bg-[#E6F0E8] hover:text-[#1A4D3A]"}`}>
          <n.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
          {n.label}
        </NavLink>
      ))}
    </div>
    <div className="m-3 rounded-xl bg-[#EEF4EF] p-3 text-[11px] leading-relaxed text-emerald-900/80">
      Alur laporan: <b>Draf → Diajukan → Perlu perbaikan / Disetujui</b>
    </div>
  </nav>
);

const Notifications = () => {
  const [data, setData] = useState({ items: [], unread: 0 });
  const nav = useNavigate();
  const load = () => api.get("/notifications").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  const open = async (n) => { await api.post(`/notifications/${n.id}/read`); load(); if (n.link) nav(n.link); };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button data-testid="notification-bell" className="relative rounded-full p-2 text-slate-700 transition-colors hover:bg-[#E6F0E8]">
          <Bell className="h-5 w-5" />
          {data.unread > 0 && <span data-testid="notification-unread-count" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{data.unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-display font-semibold text-[#12372A]">Notifikasi</span>
          <button data-testid="notification-read-all" className="text-xs font-medium text-emerald-700 hover:underline" onClick={async () => { await api.post("/notifications/read-all"); load(); }}>Tandai semua dibaca</button>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {data.items.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Belum ada notifikasi</div>}
          {data.items.map((n) => (
            <button key={n.id} onClick={() => open(n)} data-testid={`notification-item-${n.id}`} className={`block w-full border-b px-4 py-3 text-left transition-colors hover:bg-[#F3F7F2] ${n.read ? "" : "bg-emerald-50/60"}`}>
              <div className="text-sm font-semibold text-slate-800">{n.title}</div>
              <div className="text-xs text-slate-600">{n.message}</div>
              <div className="mt-1 text-[10px] text-slate-400">{fmtDate(n.created_at, true)}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[#F8FAF7]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[#DCE7DF] bg-white lg:block"><SideNav role={user.role} /></aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0"><SideNav role={user.role} onNavigate={() => setOpen(false)} /></SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#DCE7DF] bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-[#E6F0E8] lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button"><Menu className="h-5 w-5" /></button>
            <img src="/logo-mark.png" alt="" className="h-8 w-8 lg:hidden" />
            <span className="hidden text-sm text-slate-500 sm:inline">Pelaporan & Evaluasi SPM dan Program</span>
          </div>
          <div className="flex items-center gap-2">
            <Notifications />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="user-menu-button" className="flex items-center gap-2 rounded-full border border-[#DCE7DF] bg-white py-1 pl-1 pr-3 transition-colors hover:bg-[#F3F7F2]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A4D3A] text-xs font-bold text-white">{user.name.slice(0, 2).toUpperCase()}</span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-xs font-semibold leading-tight text-slate-800">{user.name}</span>
                    <span className="block text-[10px] leading-tight text-emerald-700" data-testid="user-role-label">{ROLES[user.role]}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="change-password-menu" onClick={() => setPw(true)}><KeyRound className="mr-2 h-4 w-4" />Ubah kata sandi</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="logout-button" onClick={async () => { await logout(); nav("/login"); }}><LogOut className="mr-2 h-4 w-4" />Keluar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10"><Outlet /></main>
      </div>
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
    </div>
  );
}
