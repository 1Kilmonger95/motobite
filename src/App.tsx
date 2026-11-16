import { Navigate, Route, Routes } from "react-router-dom";

function Placeholder({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<Placeholder title="Panel administrativo (Etapa 3)" />} />
      <Route path="/a/:token" element={<Placeholder title="Activación (Etapa 5)" />} />
      <Route path="/library" element={<Placeholder title="Mis documentos (Etapa 7)" />} />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}
