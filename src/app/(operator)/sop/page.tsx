import { ContentList } from "@/components/operator/content-list";

export default function SopListPage() {
  return (
    <ContentList
      contentType="SOP"
      detailPath="sop"
      title="Procedure operative (SOP)"
      description="Consulta e filtra le procedure operative visibili nel tuo perimetro"
      createPath="/hoo-sop/new"
      createLabel="Nuova SOP"
    />
  );
}
