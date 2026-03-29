import { PrismaClient, Role, ContentStatus, ContentType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEPARTMENT_CODES = [
  { name: "Front Office", code: "FO" },
  { name: "Room Division", code: "RM" },
  { name: "F&B", code: "FB" },
  { name: "Maintenance", code: "MT" },
  { name: "Spa & Esperienze", code: "SP" },
  { name: "Back of House", code: "QA" },
];

const PROPERTIES = [
  { name: "The Nicolaus Hotel", code: "NCL", tagline: "Your business destination", city: "Bari", description: "Cuore business di Bari. 174 camere, centro congressi, 4 location banqueting, Skyline Rooftop, wellness area, museo verticale d'arte.", website: "thenicolaushotel.com" },
  { name: "Hi Hotel Bari", code: "HIB", tagline: "Welcome modern travellers", city: "Bari", description: "Smart e design oriented. 88 camere, ristorante Basilico, concept lifestyle per modern travellers.", website: "hihotelbari.com" },
  { name: "Patria Palace Hotel", code: "PPL", tagline: "Your main door to Salento", city: "Lecce", description: "Hotel di lusso a Lecce, membro Leading Hotels of the World. Esperienza poetica, ristorante stellato, vista senza pari.", website: "patriapalace.com" },
  { name: "I Turchesi Club Village", code: "TCV", tagline: "The Summer place to be", city: "Castellaneta Marina", description: "Villaggio turistico stagionale. Piscina più grande d'Italia, sport, mare, costa pugliese.", website: "iturchesi.com" },
  { name: "Hotel Delfino Taranto", code: "DEL", tagline: "Sea the Difference", city: "Taranto", description: "Hotel business/leisure vista mare a Taranto. Camere, suite, sale MICE e banqueting.", website: "hoteldelfino.com" },
  { name: "Mercure Roma West", code: "MRW", tagline: "No place is like Rome", city: "Roma", description: "Franchising Accor a Roma. Soggiorni business, MICE, area wellness. Standard brand Accor obbligatori.", website: "mercureromawest.com" },
];

type Assignment = { propertyCode: string; departmentCode?: string };

interface UserSeed {
  email: string;
  name: string;
  role: Role;
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
  assignments: Assignment[];
  contentTypes: ContentType[];
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("test1234", 12);

  // Create properties
  const properties: Record<string, string> = {};
  for (const prop of PROPERTIES) {
    const created = await prisma.property.upsert({
      where: { code: prop.code },
      update: { tagline: prop.tagline, description: prop.description, website: prop.website },
      create: prop,
    });
    properties[prop.code] = created.id;
    console.log(`  Property: ${created.name} (${created.code})`);
  }

  // Create departments for each property
  const departments: Record<string, Record<string, string>> = {};
  for (const prop of PROPERTIES) {
    departments[prop.code] = {};
    for (const dept of DEPARTMENT_CODES) {
      const created = await prisma.department.upsert({
        where: {
          propertyId_code: {
            propertyId: properties[prop.code],
            code: dept.code,
          },
        },
        update: {},
        create: {
          name: dept.name,
          code: dept.code,
          propertyId: properties[prop.code],
        },
      });
      departments[prop.code][dept.code] = created.id;
    }
    console.log(`  Departments for ${prop.code}: ${DEPARTMENT_CODES.length} created`);
  }

  // Create users
  const users: UserSeed[] = [
    {
      email: "super@modusho.test",
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      canView: true, canEdit: true, canApprove: true,
      assignments: [],
      contentTypes: ["SOP", "DOCUMENT", "MEMO"],
    },
    {
      email: "admin@modusho.test",
      name: "Admin Generale",
      role: Role.ADMIN,
      canView: true, canEdit: true, canApprove: true,
      assignments: [
        { propertyCode: "NCL" },
        { propertyCode: "HIB" },
        { propertyCode: "PPL" },
      ],
      contentTypes: ["SOP", "DOCUMENT", "MEMO"],
    },
    {
      email: "hm.nicolaus@modusho.test",
      name: "Hotel Manager Nicolaus",
      role: Role.HOTEL_MANAGER,
      canView: true, canEdit: true, canApprove: true,
      assignments: [{ propertyCode: "NCL" }],
      contentTypes: ["MEMO", "SOP", "DOCUMENT"],
    },
    {
      email: "hm.hi@modusho.test",
      name: "Hotel Manager Hi Hotel",
      role: Role.HOTEL_MANAGER,
      canView: true, canEdit: true, canApprove: true,
      assignments: [{ propertyCode: "HIB" }],
      contentTypes: ["MEMO", "SOP", "DOCUMENT"],
    },
    {
      email: "hm.patria@modusho.test",
      name: "Hotel Manager Patria Palace",
      role: Role.HOTEL_MANAGER,
      canView: true, canEdit: true, canApprove: true,
      assignments: [{ propertyCode: "PPL" }],
      contentTypes: ["MEMO", "SOP", "DOCUMENT"],
    },
    {
      email: "hod.fo.nicolaus@modusho.test",
      name: "HOD Front Office NCL",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "NCL", departmentCode: "FO" }],
      contentTypes: ["SOP", "DOCUMENT"],
    },
    {
      email: "hod.fo.patria@modusho.test",
      name: "HOD Front Office Patria",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "PPL", departmentCode: "FO" }],
      contentTypes: ["SOP", "DOCUMENT"],
    },
    {
      email: "hod.rm.patria@modusho.test",
      name: "HOD Room Division Patria",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "PPL", departmentCode: "RM" }],
      contentTypes: ["SOP", "DOCUMENT"],
    },
    {
      email: "hod.fb.patria@modusho.test",
      name: "HOD F&B Patria",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "PPL", departmentCode: "FB" }],
      contentTypes: ["SOP", "DOCUMENT"],
    },
    {
      email: "hod.sp.patria@modusho.test",
      name: "HOD Spa & Esperienze Patria",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "PPL", departmentCode: "SP" }],
      contentTypes: ["SOP", "DOCUMENT"],
    },
    {
      email: "hod.qa.patria@modusho.test",
      name: "HOD Back of House Patria",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "PPL", departmentCode: "QA" }],
      contentTypes: ["SOP", "DOCUMENT"],
    },
    {
      email: "hod.fb.hi@modusho.test",
      name: "HOD F&B Hi Hotel",
      role: Role.HOD,
      canView: true, canEdit: true, canApprove: false,
      assignments: [{ propertyCode: "HIB", departmentCode: "FB" }],
      contentTypes: ["SOP", "MEMO"],
    },
    {
      email: "op.fo.nicolaus@modusho.test",
      name: "Operatore Front Office NCL",
      role: Role.OPERATOR,
      canView: true, canEdit: false, canApprove: false,
      assignments: [{ propertyCode: "NCL", departmentCode: "FO" }],
      contentTypes: [],
    },
    {
      email: "op.hk.nicolaus@modusho.test",
      name: "Operatore Housekeeping NCL",
      role: Role.OPERATOR,
      canView: true, canEdit: false, canApprove: false,
      assignments: [{ propertyCode: "NCL", departmentCode: "RM" }],
      contentTypes: [],
    },
    {
      email: "op.fb.hi@modusho.test",
      name: "Operatore F&B Hi Hotel",
      role: Role.OPERATOR,
      canView: true, canEdit: false, canApprove: false,
      assignments: [{ propertyCode: "HIB", departmentCode: "FB" }],
      contentTypes: [],
    },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        role: userData.role,
        canView: userData.canView,
        canEdit: userData.canEdit,
        canApprove: userData.canApprove,
      },
      create: {
        email: userData.email,
        name: userData.name,
        passwordHash,
        role: userData.role,
        canView: userData.canView,
        canEdit: userData.canEdit,
        canApprove: userData.canApprove,
      },
    });

    // Property assignments
    for (const assignment of userData.assignments) {
      const propertyId = properties[assignment.propertyCode];
      const departmentId = assignment.departmentCode
        ? departments[assignment.propertyCode][assignment.departmentCode]
        : null;

      const existing = await prisma.propertyAssignment.findFirst({
        where: { userId: user.id, propertyId, departmentId },
      });

      if (!existing) {
        await prisma.propertyAssignment.create({
          data: { userId: user.id, propertyId, departmentId },
        });
      }
    }

    // Content type permissions
    for (const ct of userData.contentTypes) {
      await prisma.userContentPermission.upsert({
        where: { userId_contentType: { userId: user.id, contentType: ct } },
        update: {},
        create: { userId: user.id, contentType: ct },
      });
    }

    console.log(`  User: ${user.email} (${userData.role}) canEdit=${userData.canEdit} canApprove=${userData.canApprove} contentTypes=[${userData.contentTypes.join(",")}]`);
  }

  // Create test contents with status history
  console.log("\n  Creating test contents...");

  const adminUser = await prisma.user.findUnique({ where: { email: "admin@modusho.test" } });
  const hmNicolaus = await prisma.user.findUnique({ where: { email: "hm.nicolaus@modusho.test" } });
  const hmHi = await prisma.user.findUnique({ where: { email: "hm.hi@modusho.test" } });

  if (!adminUser || !hmNicolaus || !hmHi) {
    throw new Error("Required users not found for content seeding");
  }

  async function createContentWithHistory(params: {
    type: "SOP" | "DOCUMENT" | "MEMO";
    title: string;
    body: string;
    finalStatus: ContentStatus;
    propertyCode: string;
    departmentCode?: string;
    statusPath: { status: ContentStatus; byUserId: string; note?: string; daysAgo: number }[];
  }) {
    const propertyId = properties[params.propertyCode];
    const departmentId = params.departmentCode
      ? departments[params.propertyCode][params.departmentCode]
      : null;

    // Check if content already exists by title + property
    const existing = await prisma.content.findFirst({
      where: { title: params.title, propertyId },
    });
    if (existing) return existing;

    const content = await prisma.content.create({
      data: {
        type: params.type,
        title: params.title,
        body: params.body,
        status: params.finalStatus,
        propertyId,
        departmentId,
        createdById: adminUser!.id,
        updatedById: params.statusPath[params.statusPath.length - 1].byUserId,
        publishedAt: params.finalStatus === "PUBLISHED"
          ? new Date(Date.now() - params.statusPath[params.statusPath.length - 1].daysAgo * 86400000)
          : null,
      },
    });

    let prevStatus: ContentStatus | null = null;
    for (const step of params.statusPath) {
      await prisma.contentStatusHistory.create({
        data: {
          contentId: content.id,
          fromStatus: prevStatus,
          toStatus: step.status,
          changedById: step.byUserId,
          changedAt: new Date(Date.now() - step.daysAgo * 86400000),
          note: step.note,
        },
      });
      prevStatus = step.status;
    }

    return content;
  }

  await createContentWithHistory({
    type: "SOP", title: "Procedura Check-in Ospiti VIP",
    body: "<h2>Obiettivo</h2><p>Garantire un'accoglienza personalizzata e senza errori per gli ospiti VIP.</p><h2>Procedura</h2><ol><li>Verificare la prenotazione nel PMS almeno 2 ore prima</li><li>Preparare la welcome card personalizzata</li><li>Coordinare con F&B per il welcome amenity</li><li>Assegnare la camera verificando le preferenze</li><li>Informare il Duty Manager</li><li>Accogliere l'ospite per nome</li><li>Accompagnare in camera personalmente</li></ol>",
    finalStatus: "PUBLISHED", propertyCode: "NCL", departmentCode: "FO",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 20 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 18 },
      { status: "REVIEW_ADMIN", byUserId: hmNicolaus.id, note: "Approvato dall'HM", daysAgo: 15 },
      { status: "PUBLISHED", byUserId: adminUser.id, daysAgo: 14 },
    ],
  });

  await createContentWithHistory({
    type: "SOP", title: "Gestione Reclami Front Office",
    body: "<h2>Obiettivo</h2><p>Gestire ogni reclamo in modo strutturato e tracciabile.</p><ol><li>Ascoltare senza interrompere</li><li>Registrare nel log</li><li>Classificare gravità</li><li>Per alta/critica: avvisare Duty Manager</li><li>Proporre soluzione entro 15 minuti</li><li>Follow-up entro 2 ore</li><li>Chiudere nel log</li></ol>",
    finalStatus: "PUBLISHED", propertyCode: "NCL", departmentCode: "FO",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 10 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 8 },
      { status: "REVIEW_ADMIN", byUserId: hmNicolaus.id, daysAgo: 6 },
      { status: "PUBLISHED", byUserId: adminUser.id, daysAgo: 5 },
    ],
  });

  await createContentWithHistory({
    type: "SOP", title: "Pulizia Camera Standard",
    body: "<h2>Sequenza operativa</h2><ol><li>Bussare e annunciare</li><li>Aprire finestre</li><li>Rimuovere biancheria</li><li>Pulire bagno</li><li>Rifare letto</li><li>Spolverare</li><li>Aspirare e lavare</li><li>Controllo finale</li></ol>",
    finalStatus: "PUBLISHED", propertyCode: "NCL", departmentCode: "RM",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 25 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 22 },
      { status: "REVIEW_ADMIN", byUserId: hmNicolaus.id, daysAgo: 20 },
      { status: "PUBLISHED", byUserId: adminUser.id, daysAgo: 19 },
    ],
  });

  await createContentWithHistory({
    type: "SOP", title: "Procedura Evacuazione Emergenza",
    body: "<p>Contenuto in fase di revisione.</p>",
    finalStatus: "REVIEW_HM", propertyCode: "NCL", departmentCode: "FO",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 5 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 3 },
    ],
  });

  await createContentWithHistory({
    type: "SOP", title: "Procedura Late Check-out",
    body: "<p>Procedura per la gestione delle richieste di late check-out.</p>",
    finalStatus: "DRAFT", propertyCode: "NCL", departmentCode: "FO",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 12 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 10 },
      { status: "RETURNED", byUserId: hmNicolaus.id, note: "Mancano le tariffe per fascia oraria", daysAgo: 8 },
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 8 },
    ],
  });

  await createContentWithHistory({
    type: "DOCUMENT", title: "Policy Sicurezza Alimentare HACCP",
    body: "<h2>Ambito</h2><p>Si applica a tutti i reparti che gestiscono alimenti.</p><ul><li>Igiene personale</li><li>Temperatura: controllo 2 volte/giorno</li><li>Stoccaggio FIFO</li><li>Schede allergeni</li></ul>",
    finalStatus: "PUBLISHED", propertyCode: "NCL",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 30 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 28 },
      { status: "REVIEW_ADMIN", byUserId: hmNicolaus.id, daysAgo: 25 },
      { status: "PUBLISHED", byUserId: adminUser.id, daysAgo: 3 },
    ],
  });

  await createContentWithHistory({
    type: "SOP", title: "Servizio Colazione Buffet",
    body: "<h2>Orari</h2><p>Apertura: 07:00. Chiusura: 10:30 (feriali), 11:00 (weekend).</p><ol><li>Buffet pronto entro 06:45</li><li>Verificare scorte</li><li>Stazioni etichettate con allergeni</li><li>Tovagliato pulito</li></ol>",
    finalStatus: "PUBLISHED", propertyCode: "HIB", departmentCode: "FB",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 15 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 12 },
      { status: "REVIEW_ADMIN", byUserId: hmHi.id, daysAgo: 8 },
      { status: "PUBLISHED", byUserId: adminUser.id, daysAgo: 6 },
    ],
  });

  await createContentWithHistory({
    type: "SOP", title: "Gestione Prenotazioni Ristorante",
    body: "<p>Procedura per la gestione delle prenotazioni al ristorante.</p>",
    finalStatus: "REVIEW_ADMIN", propertyCode: "HIB", departmentCode: "FB",
    statusPath: [
      { status: "DRAFT", byUserId: adminUser.id, daysAgo: 7 },
      { status: "REVIEW_HM", byUserId: adminUser.id, daysAgo: 5 },
      { status: "REVIEW_ADMIN", byUserId: hmHi.id, note: "Procedura verificata, inoltro per approvazione", daysAgo: 2 },
    ],
  });

  // Memo
  const existingMemo = await prisma.content.findFirst({ where: { title: "Chiusura piscina per manutenzione", propertyId: properties["NCL"] } });
  if (!existingMemo) {
    const memoContent = await prisma.content.create({
      data: {
        type: "MEMO", title: "Chiusura piscina per manutenzione",
        body: "<p>La piscina esterna sarà chiusa per manutenzione dal 1 al 5 aprile. Informare gli ospiti al check-in.</p>",
        status: "PUBLISHED", propertyId: properties["NCL"],
        createdById: hmNicolaus.id, updatedById: hmNicolaus.id,
        publishedAt: new Date(Date.now() - 2 * 86400000),
      },
    });
    await prisma.memo.create({
      data: { contentId: memoContent.id, propertyId: properties["NCL"], isPinned: true, expiresAt: new Date(Date.now() + 10 * 86400000) },
    });
    await prisma.contentStatusHistory.create({
      data: { contentId: memoContent.id, fromStatus: null, toStatus: "PUBLISHED", changedById: hmNicolaus.id, changedAt: new Date(Date.now() - 2 * 86400000) },
    });
  }

  const existingMemo2 = await prisma.content.findFirst({ where: { title: "Aggiornamento turni Pasqua 2026", propertyId: properties["NCL"] } });
  if (!existingMemo2) {
    const memoContent2 = await prisma.content.create({
      data: {
        type: "MEMO", title: "Aggiornamento turni Pasqua 2026",
        body: "<p>I turni per il periodo pasquale sono stati pubblicati. Verificare e segnalare problemi entro il 30 marzo.</p>",
        status: "PUBLISHED", propertyId: properties["NCL"],
        createdById: hmNicolaus.id, updatedById: hmNicolaus.id,
        publishedAt: new Date(Date.now() - 1 * 86400000),
      },
    });
    await prisma.memo.create({
      data: { contentId: memoContent2.id, propertyId: properties["NCL"], isPinned: false, expiresAt: new Date(Date.now() + 5 * 86400000) },
    });
    await prisma.contentStatusHistory.create({
      data: { contentId: memoContent2.id, fromStatus: null, toStatus: "PUBLISHED", changedById: hmNicolaus.id, changedAt: new Date(Date.now() - 1 * 86400000) },
    });
  }

  console.log("  Contents and status history created");
  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
