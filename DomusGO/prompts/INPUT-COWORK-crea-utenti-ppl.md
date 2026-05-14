# INPUT COWORK — Creazione automatica utenti Patria Palace Hotel

## Obiettivo

Creare nel database di ModusHO **26 utenti OPERATOR** assegnati alla struttura **Patria Palace Hotel (codice PPL)**, ciascuno con reparto specifico, usando i dati forniti in questo documento.

---

## Metodo di implementazione

Creare uno script TypeScript `prisma/seed-ppl-users.ts` che:

1. Recupera l'ID della property PPL dal database
2. Recupera gli ID dei reparti per la property PPL
3. Per ogni utente: hash della password con `bcrypt` + `prisma.user.upsert` + `prisma.propertyAssignment.create`
4. Lo script deve essere **idempotente** (upsert su email, skip se l'utente esiste già)

Lanciare con:
```bash
npx tsx prisma/seed-ppl-users.ts
```

---

## Dati struttura di riferimento

```
Property code : PPL
Property name : Patria Palace Hotel
Città         : Lecce
```

---

## Codici reparto (già presenti in DB)

| Codice | Nome reparto          |
|--------|-----------------------|
| FO     | Front Office          |
| FB     | F&B                   |
| SP     | Spa & Esperienze      |
| RM     | Room Division         |

---

## Configurazione utenti (ruolo e permessi)

Tutti gli utenti hanno:

```
role       = OPERATOR
canView    = true
canEdit    = false
canApprove = false
isActive   = true
contentPermissions = [] (nessuno — OPERATOR non ha permessi di editing)
```

Ogni utente ha **una sola PropertyAssignment**:
- `propertyId` = ID della property PPL
- `departmentId` = ID del reparto corrispondente al codice indicato

---

## Lista utenti (26 record)

```typescript
const users = [
  // ── Front Office (FO) ──────────────────────────────────────────
  { name: "Alessia Leo",                   email: "alessia.leo2000@libero.it",           password: "&av#C6IlmQl2", dept: "FO" },
  { name: "Angelo Antonazzo",              email: "angelo.a95@live.it",                  password: "vXfRUdO7*lpS", dept: "FO" },
  { name: "Davide Fasano",                 email: "dvd11089@hotmail.it",                 password: "L*J0nF4kvb!E", dept: "FO" },
  { name: "Tommaso Russo",                 email: "thomaslecce@gmail.com",               password: "k&kh8YbDYCJR", dept: "FO" },
  { name: "Jacopo Vitti",                  email: "vittijacopo@yahoo.it",                password: "*xHf4kTolxt3", dept: "FO" },
  { name: "Charity Karonya Sakari",        email: "charitysakari@gmail.com",             password: "cI4ELOTo*KXk", dept: "FO" },
  { name: "Raffaella Valente",             email: "valenteraffaella78@gmail.com",        password: "G5@a5fVIN2W#", dept: "FO" },
  { name: "Elisa Gianfreda",              email: "elisagianfre@hotmail.it",             password: "XCQ41%GN!Eib", dept: "FO" },
  { name: "Asia Cazzella",                email: "asiacazzella@gmail.com",              password: "UViKg!9q!FK6", dept: "FO" },
  { name: "Marino Gesmundo",              email: "mariges@tiscali.it",                  password: "fTKma$@y01hw", dept: "FO" },

  // ── F&B — Cucina e Sala (FB) ───────────────────────────────────
  { name: "Ilaria Perrone",                email: "ilariaperrone1403@libero.it",         password: "RkAlLV#1Ewyx", dept: "FB" },
  { name: "Serena Leone",                  email: "srnln89@gmail.com",                   password: "0#Jn@r!iM6cK", dept: "FB" },
  { name: "Davide Gatto",                  email: "davidegatto94@gmail.com",             password: "#MbBxD$YGv32", dept: "FB" },
  { name: "Felicia Salerno",               email: "liciasalerno2017@gmail.com",          password: "fs6t5oB&I92M", dept: "FB" },
  { name: "Fabio Ippolito",                email: "fabio_ippolito@libero.it",            password: "0tw*abPpKCZb", dept: "FB" },
  { name: "Giorgio Castriota Scanderbeg",  email: "castriota.giorgio97@gmail.com",       password: "9nYK2iQ8q*L3", dept: "FB" },
  { name: "Gabriele Giannone",             email: "gabrieleegiannonee@gmail.com",        password: "C6Mw$RkrBMdy", dept: "FB" },
  { name: "Francesco D'Adamo",             email: "francescodadamo99@libero.it",         password: "B!CsMN2FHGV&", dept: "FB" },

  // ── Spa & Benessere (SP) ───────────────────────────────────────
  { name: "Patrizia Cosmo",               email: "patriziacosmo@gmail.com",             password: "rakTUwFMH*U5", dept: "SP" },

  // ── Room Division / Housekeeping (RM) ─────────────────────────
  { name: "Ida Colucci",                   email: "tarantoida1968@gmail.com",            password: "sTz*Vdk3@Ldw", dept: "RM" },
  { name: "Simona Asselta",                email: "asseltasimona@gmail.com",             password: "&EHEyg1MJp!G", dept: "RM" },
  { name: "Vanessa Monaco",                email: "Vanessa1812@libero.it",               password: "*pUopmG37QI@", dept: "RM" },
  { name: "Beatrice Chirizzi",             email: "beatricechirizzi@gmail.com",          password: "@21w#oqmcogM", dept: "RM" },
  { name: "Dola Ram",                      email: "dolatmuwal5@gmail.com",               password: "Y9m%CPyc8OwZ", dept: "RM" },
  { name: "Mariolina De Franceschi",       email: "defranceschimariolina@gmail.com",     password: "vT7FtMwsYO!o", dept: "RM" },
  { name: "Cristina Perrone",              email: "cristinaperrone35@gmail.com",         password: "pYI#7Iil5*x3", dept: "RM" },
  { name: "Annamaria Ventura",             email: "venturaannamaria107@gmail.com",       password: "pVnUNCQxg01!", dept: "RM" },
  { name: "Mihaela Serban",                email: "mserban799@gmail.com",                password: "%Ox8OXgNAUIn", dept: "RM" },
  { name: "Martina Toma",                  email: "tomamartina50@gmail.com",             password: "G0R3p50pC#eb", dept: "RM" },
];
```

---

## Script completo da implementare

```typescript
// prisma/seed-ppl-users.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const users = [
  { name: "Alessia Leo",                   email: "alessia.leo2000@libero.it",           password: "&av#C6IlmQl2", dept: "FO" },
  { name: "Angelo Antonazzo",              email: "angelo.a95@live.it",                  password: "vXfRUdO7*lpS", dept: "FO" },
  { name: "Davide Fasano",                 email: "dvd11089@hotmail.it",                 password: "L*J0nF4kvb!E", dept: "FO" },
  { name: "Tommaso Russo",                 email: "thomaslecce@gmail.com",               password: "k&kh8YbDYCJR", dept: "FO" },
  { name: "Jacopo Vitti",                  email: "vittijacopo@yahoo.it",                password: "*xHf4kTolxt3", dept: "FO" },
  { name: "Charity Karonya Sakari",        email: "charitysakari@gmail.com",             password: "cI4ELOTo*KXk", dept: "FO" },
  { name: "Raffaella Valente",             email: "valenteraffaella78@gmail.com",        password: "G5@a5fVIN2W#", dept: "FO" },
  { name: "Ilaria Perrone",                email: "ilariaperrone1403@libero.it",         password: "RkAlLV#1Ewyx", dept: "FB" },
  { name: "Serena Leone",                  email: "srnln89@gmail.com",                   password: "0#Jn@r!iM6cK", dept: "FB" },
  { name: "Davide Gatto",                  email: "davidegatto94@gmail.com",             password: "#MbBxD$YGv32", dept: "FB" },
  { name: "Felicia Salerno",               email: "liciasalerno2017@gmail.com",          password: "fs6t5oB&I92M", dept: "FB" },
  { name: "Fabio Ippolito",                email: "fabio_ippolito@libero.it",            password: "0tw*abPpKCZb", dept: "FB" },
  { name: "Giorgio Castriota Scanderbeg",  email: "castriota.giorgio97@gmail.com",       password: "9nYK2iQ8q*L3", dept: "FB" },
  { name: "Gabriele Giannone",             email: "gabrieleegiannonee@gmail.com",        password: "C6Mw$RkrBMdy", dept: "FB" },
  { name: "Francesco D'Adamo",             email: "francescodadamo99@libero.it",         password: "B!CsMN2FHGV&", dept: "FB" },
  { name: "Mauro Caputo",                 email: "maurocaputo010705@icloud.com",        password: "%bXCA4tObJg8", dept: "FB" },
  { name: "Martina Rosario Daniele",      email: "danielemartina68@gmail.com",          password: "UXciOG!0#C*m", dept: "FB" },
  { name: "Matteo Gravina",               email: "gravinamatteo421@gmail.com",          password: "MS1qYYKBAK#2", dept: "FB" },
  { name: "Marco Simone",                 email: "simarck99@gmail.com",                 password: "Hyd6haYT%MYv", dept: "FB" },
  { name: "Patrizia Cosmo",               email: "patriziacosmo@gmail.com",             password: "rakTUwFMH*U5", dept: "SP" },
  { name: "Ida Colucci",                   email: "tarantoida1968@gmail.com",            password: "sTz*Vdk3@Ldw", dept: "RM" },
  { name: "Simona Asselta",                email: "asseltasimona@gmail.com",             password: "&EHEyg1MJp!G", dept: "RM" },
  { name: "Vanessa Monaco",                email: "Vanessa1812@libero.it",               password: "*pUopmG37QI@", dept: "RM" },
  { name: "Beatrice Chirizzi",             email: "beatricechirizzi@gmail.com",          password: "@21w#oqmcogM", dept: "RM" },
  { name: "Dola Ram",                      email: "dolatmuwal5@gmail.com",               password: "Y9m%CPyc8OwZ", dept: "RM" },
  { name: "Mariolina De Franceschi",       email: "defranceschimariolina@gmail.com",     password: "vT7FtMwsYO!o", dept: "RM" },
  { name: "Cristina Perrone",              email: "cristinaperrone35@gmail.com",         password: "pYI#7Iil5*x3", dept: "RM" },
  { name: "Annamaria Ventura",             email: "venturaannamaria107@gmail.com",       password: "pVnUNCQxg01!", dept: "RM" },
  { name: "Mihaela Serban",                email: "mserban799@gmail.com",                password: "%Ox8OXgNAUIn", dept: "RM" },
  { name: "Martina Toma",                  email: "tomamartina50@gmail.com",             password: "G0R3p50pC#eb", dept: "RM" },
];

async function main() {
  console.log("🏨 Creazione utenti Patria Palace Hotel (PPL)...\n");

  // 1. Recupera property PPL
  const property = await prisma.property.findUnique({ where: { code: "PPL" } });
  if (!property) throw new Error("Property PPL non trovata. Eseguire prima il seed principale.");
  console.log(`✓ Property trovata: ${property.name} (${property.id})`);

  // 2. Recupera tutti i reparti della property PPL
  const departments = await prisma.department.findMany({
    where: { propertyId: property.id },
  });
  const deptMap: Record<string, string> = {};
  for (const d of departments) {
    deptMap[d.code] = d.id;
  }
  console.log(`✓ Reparti trovati: ${Object.keys(deptMap).join(", ")}\n`);

  let created = 0;
  let skipped = 0;

  for (const userData of users) {
    const deptId = deptMap[userData.dept];
    if (!deptId) {
      console.warn(`  ⚠️  Reparto ${userData.dept} non trovato per ${userData.name} — skip`);
      skipped++;
      continue;
    }

    const passwordHash = await bcrypt.hash(userData.password, 12);

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},  // non sovrascrive se esiste già
      create: {
        email:        userData.email,
        name:         userData.name,
        passwordHash,
        role:         "OPERATOR",
        canView:      true,
        canEdit:      false,
        canApprove:   false,
        isActive:     true,
      },
    });

    // PropertyAssignment — crea solo se non esiste
    const existing = await prisma.propertyAssignment.findFirst({
      where: { userId: user.id, propertyId: property.id, departmentId: deptId },
    });

    if (!existing) {
      await prisma.propertyAssignment.create({
        data: { userId: user.id, propertyId: property.id, departmentId: deptId },
      });
      created++;
      console.log(`  ✓ Creato: ${userData.name} (${userData.dept}) — ${userData.email}`);
    } else {
      skipped++;
      console.log(`  — Skip: ${userData.name} — già esistente`);
    }
  }

  console.log(`\n✅ Completato: ${created} creati, ${skipped} saltati.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

---

## Comando di esecuzione

Dal terminale, nella root del progetto ModusHO:

```bash
npx tsx prisma/seed-ppl-users.ts
```

---

## Note operative

- Lo script è **idempotente**: può essere rieseguito senza creare duplicati
- Se un utente esiste già (stessa email), viene saltato senza modifiche
- Le password sono già in chiaro nello script — vengono hashate con bcrypt (cost 12) durante l'esecuzione
- Il campo `contentPermissions` è vuoto per design: gli OPERATOR non hanno permessi di editing
- `Dola Ram`: cognome non disponibile, registrato con nome completo nel campo `name`
- `Felicia Salerno`: account Gmail registrato come "Licia" — il nome nel sistema è "Felicia" come dichiarato nella email originale

---

## Checklist post-esecuzione

- [ ] Lanciare `npx tsx prisma/seed-ppl-users.ts` e verificare output — 26 creati, 0 errori
- [ ] Verificare su ModusHO che gli utenti compaiano nel pannello di amministrazione
- [ ] Verificare che ogni utente sia visibile solo nel reparto corretto
- [ ] Inviare le email con le credenziali (vedi file `modusho_utenti_ppl.xlsx`)
