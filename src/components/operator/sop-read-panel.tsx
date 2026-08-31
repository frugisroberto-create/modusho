/**
 * Il pannello che precede il testo di una procedura non ancora letta.
 *
 * Sobrio di proposito: il titolo della procedura, una riga di contesto già
 * presente altrove nella pagina, e un solo pulsante. Niente icona di avviso,
 * niente parole che chiedano una firma — chi apre una SOP sta facendo il
 * proprio lavoro, non sottoscrivendo un impegno.
 *
 * Sta in un componente suo, e non inline nella pagina, per poter essere
 * montato davvero in un test: il difetto che si vuole poter vedere è
 * un'assenza (il triangolo che non deve più esserci), e un'assenza si guarda
 * solo montando il pannello.
 */

import { SopReadButton } from "./sop-read-button";

interface Props {
  contentId: string;
  title: string;
  departmentName?: string | null;
  propertyName: string;
  version: number;
}

export function SopReadPanel({ contentId, title, departmentName, propertyName, version }: Props) {
  const contesto = [departmentName, propertyName, `versione ${version}`].filter(Boolean).join(" · ");

  return (
    <div className="bg-white border border-ivory-dark mb-8">
      <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
        <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
          Lettura
        </span>
      </div>
      <div className="px-5 py-8 space-y-5 text-center">
        <div>
          <p className="text-base font-ui font-semibold text-charcoal-dark">{title}</p>
          <p className="text-sm font-ui text-charcoal/60 mt-1">{contesto}</p>
        </div>
        <div className="flex justify-center">
          <SopReadButton contentId={contentId} />
        </div>
      </div>
    </div>
  );
}
