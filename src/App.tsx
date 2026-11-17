import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAdmin } from "./lib/auth";
import Login from "./features/admin/Login";
import AdminLayout from "./features/admin/AdminLayout";
import Dashboard from "./features/admin/Dashboard";
import ChipList from "./features/admin/ChipList";
import ChipNew from "./features/admin/ChipNew";
import ChipDetail from "./features/admin/ChipDetail";
import ActivationPage from "./features/activation/ActivationPage";
import LibraryPage from "./features/library/LibraryPage";
import { Spinner } from "./components/ui";

const ViewerPage = lazy(() => import("./features/library/ViewerPage"));

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
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:id" element={<Suspense fallback={<Spinner />}><ViewerPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </AuthProvider>
  );
}
