/**
 * Post-processing dell'HTML di uno Standard Book prima del render.
 *
 * Le 25 sezioni LQA importate da scripts/lqa_sections.json contengono
 * tabelle con 5 colonne: #, Sottosezione, Standard (EN), Standard (IT), Classe.
 *
 * La colonna "Standard (EN)" è un duplicato non azionabile del "Standard (IT)"
 * e su mobile rende la tabella illeggibile (scroll orizzontale, testo troppo
 * compresso). Questa funzione la rimuove prima che il body arrivi al client.
 *
 * Struttura delle celle EN nei dati importati:
 *  - header:  <th ... >Standard (EN)</th>
 *  - body:    <td ... font-style:italic ... >testo inglese</td>
 *
 * `font-style:italic` è univoco di quella colonna nelle tabelle LQA — nessuna
 * altra colonna usa italic — quindi possiamo rimuovere quelle td con sicurezza.
 *
 * Altri Standard Book (es. Patria) usano strutture `<ul>/<li>` e non sono
 * toccati da questa funzione.
 */
export function stripEnColumnFromStandardBook(html: string): string {
  if (!html) return html;

  return html
    // 1. Rimuove l'header "Standard (EN)" ovunque compaia
    .replace(/<th\b[^>]*>\s*Standard \(EN\)\s*<\/th>/gi, "")
    // 2. Rimuove ogni <td> con font-style:italic (distintivo della colonna EN
    //    nelle tabelle LQA — nessuna altra cella usa italic inline)
    .replace(/<td\b[^>]*font-style:\s*italic[^>]*>[\s\S]*?<\/td>/gi, "");
}
