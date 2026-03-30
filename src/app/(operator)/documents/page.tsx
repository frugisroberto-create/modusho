import { ContentList } from "@/components/operator/content-list";

export default function DocumentsListPage() {
  return (
    <ContentList
      contentType="DOCUMENT"
      detailPath="documents"
      title="Documenti"
      description="Consulta i documenti disponibili per la tua struttura"
    />
  );
}
