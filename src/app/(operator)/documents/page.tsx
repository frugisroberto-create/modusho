import { ContentList } from "@/components/operator/content-list";

export default function DocumentsListPage() {
  return (
    <ContentList
      contentType="DOCUMENT"
      detailPath="documents"
      title="Documenti"
      description="Consulta i documenti operativi disponibili per la tua struttura"
      searchPlaceholder="Cerca un documento..."
      createPath="/library/new"
      createLabel="Nuovo documento"
    />
  );
}
