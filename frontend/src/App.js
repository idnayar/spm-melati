import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";
import ReportEditor from "@/pages/ReportEditor";
import Programs from "@/pages/Programs";
import UsersPage from "@/pages/Users";
import Tables from "@/pages/Tables";
import TableEditor from "@/pages/TableEditor";
import FollowUps from "@/pages/FollowUps";
import Presentations from "@/pages/Presentations";
import PresentationEditor from "@/pages/PresentationEditor";
import Analysis from "@/pages/Analysis";
import Exports from "@/pages/Exports";
import Settings from "@/pages/Settings";
import Activity from "@/pages/Activity";

const Protected = ({ children }) => {
  const { user } = useAuth();
  if (user === null) return <div className="flex min-h-screen items-center justify-center text-sm text-emerald-800">Memuat…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Navigate to="/dashboard/spm" replace />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/spm" replace />} />
            <Route path="/dashboard/:kind" element={<Dashboard />} />
            <Route path="/laporan" element={<Navigate to="/laporan-spm" replace />} />
            <Route path="/laporan-spm" element={<Reports kind="spm" />} />
            <Route path="/laporan-program" element={<Reports kind="program" />} />
            <Route path="/laporan/:id" element={<ReportEditor />} />
            <Route path="/program" element={<Navigate to="/master/program" replace />} />
            <Route path="/master/:kind" element={<Programs />} />
            <Route path="/pengguna" element={<UsersPage />} />
            <Route path="/tabel" element={<Tables />} />
            <Route path="/tabel/:id" element={<TableEditor />} />
            <Route path="/tindak-lanjut" element={<FollowUps />} />
            <Route path="/presentasi" element={<Presentations />} />
            <Route path="/presentasi/:id" element={<PresentationEditor />} />
            <Route path="/analisis" element={<Analysis />} />
            <Route path="/ekspor" element={<Exports />} />
            <Route path="/pengingat" element={<Settings />} />
            <Route path="/aktivitas" element={<Activity />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard/spm" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
