import { SopForm } from "@/components/hoo/sop-form";

export default function NewSopPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Nuova SOP</h1>
      <SopForm mode="create" />
    </div>
  );
}
