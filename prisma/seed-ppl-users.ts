// prisma/seed-ppl-users.ts
// Creazione automatica utenti OPERATOR — Patria Palace Hotel (PPL)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
  { name: "Mauro Caputo",                  email: "maurocaputo010705@icloud.com",        password: "%bXCA4tObJg8", dept: "FB" },
  { name: "Martina Rosario Daniele",       email: "danielemartina68@gmail.com",          password: "UXciOG!0#C*m", dept: "FB" },
  { name: "Matteo Gravina",                email: "gravinamatteo421@gmail.com",          password: "MS1qYYKBAK#2", dept: "FB" },
  { name: "Marco Simone",                  email: "simarck99@gmail.com",                 password: "Hyd6haYT%MYv", dept: "FB" },

  // ── Spa & Benessere (SP) ───────────────────────────────────────
  { name: "Patrizia Cosmo",                email: "patriziacosmo@gmail.com",             password: "rakTUwFMH*U5", dept: "SP" },

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
  { name: "Simone De Matteis",            email: "simone.dematteis@libero.it",          password: "vTlMCh8Tppr#", dept: "FO" },
  { name: "Maurizio Rizzo",               email: "rizzomauriziohp@libero.it",           password: "N^CItHkOFu@7", dept: "FB" },
  { name: "Diletta Petio",                email: "mammadile@libero.it",                 password: "f4R7!zSy&wRd", dept: "SP" },
  { name: "Nicola Magi",                  email: "nicolamagi.63@gmail.com",             password: "n!b^kfVRgyS@", dept: "FO" },
  { name: "Alessia Occhilupo",            email: "alessiaocchilupo24@gmail.com",         password: "ZK@c7o%CCb$3", dept: "FO" },
];

async function main() {
  console.log("🏨 Creazione utenti Patria Palace Hotel...\n");

  const property = await prisma.property.findUnique({ where: { code: "HO3" } });
  if (!property) throw new Error("❌ Property HO3 (Patria Palace) non trovata.");
  console.log(`✓ Property: ${property.name} (${property.id})`);

  const departments = await prisma.department.findMany({ where: { propertyId: property.id } });
  const deptMap: Record<string, string> = {};
  for (const d of departments) deptMap[d.code] = d.id;
  console.log(`✓ Reparti: ${Object.keys(deptMap).join(", ")}\n`);

  let created = 0;
  let skipped = 0;
  let errors  = 0;

  for (const u of users) {
    const deptId = deptMap[u.dept];
    if (!deptId) {
      console.warn(`  ⚠️  Reparto ${u.dept} non trovato — skip: ${u.name}`);
      errors++;
      continue;
    }

    try {
      const passwordHash = await bcrypt.hash(u.password, 12);

      const user = await prisma.user.upsert({
        where:  { email: u.email },
        update: {},
        create: {
          email: u.email,
          name:  u.name,
          passwordHash,
          role:       "OPERATOR",
          canView:    true,
          canEdit:    false,
          canApprove: false,
          isActive:   true,
        },
      });

      const existing = await prisma.propertyAssignment.findFirst({
        where: { userId: user.id, propertyId: property.id, departmentId: deptId },
      });

      if (!existing) {
        await prisma.propertyAssignment.create({
          data: { userId: user.id, propertyId: property.id, departmentId: deptId },
        });
        created++;
        console.log(`  ✓  ${u.name.padEnd(32)} (${u.dept})  ${u.email}`);
      } else {
        skipped++;
        console.log(`  —  ${u.name.padEnd(32)} già esistente — skip`);
      }
    } catch (e) {
      console.error(`  ❌  Errore su ${u.name}:`, e);
      errors++;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅  Completato: ${created} creati  |  ${skipped} saltati  |  ${errors} errori`);
  console.log(`${"─".repeat(60)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
