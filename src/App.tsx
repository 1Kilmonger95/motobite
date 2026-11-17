import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAdmin } from "./lib/auth";
import Login from "./features/admin/Login";
import AdminLayout from "./features/admin/AdminLayout";
import Dashboard from "./features/admin/Dashboard";
import ChipList from "./features/admin/ChipList";
import ChipNew from "./features/admin/ChipNew";
import ChipDetail from "./features/admin/ChipDetail";
import ActivationPage from "./features/activation/ActivationPage";

function Placeholder({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="chips" element={<ChipList />} />
          <Route path="chips/new" element={<ChipNew />} />
          <Route path="chips/:id" element={<ChipDetail />} />
        </Route>
        <Route path="/a/:token" element={<ActivationPage />} />
        <Route path="/library" element={<Placeholder title="Mis documentos (Etapa 7)" />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </AuthProvider>
  );
}
