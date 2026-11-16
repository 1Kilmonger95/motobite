import { Link, useNavigate } from "react-router-dom";
import ChipForm from "./ChipForm";

export default function ChipNew() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/chips" className="text-sm text-brand-600 underline">← Volver a chips</Link>
        <h1 className="mt-2 text-2xl font-bold">Registrar chip</h1>
      </div>
      <div className="card">
        <ChipForm onSaved={(chip) => navigate(`/admin/chips/${chip.id}`)} />
      </div>
    </div>
  );
}
