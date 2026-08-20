# Migrazioni

## 0_init — baseline dello stato di fatto

Questa migrazione NON è mai stata eseguita contro il database di
produzione, e non deve esserlo. Descrive lo stato di fatto già
esistente al 2026-08-20 ed è registrata come già applicata tramite
`prisma migrate resolve --applied 0_init`.

Contesto: fino a questa data il progetto non aveva alcun tracciamento
delle migrazioni. Lo schema veniva modificato applicando file SQL a
mano (vedi prisma/manual/). Questo aveva prodotto uno scostamento fra
schema e database tale per cui `prisma migrate diff` generava 17
istruzioni distruttive su dati reali.

Da qui in avanti ogni modifica di schema passa da una migrazione
tracciata. Non applicare più SQL a mano in produzione.
