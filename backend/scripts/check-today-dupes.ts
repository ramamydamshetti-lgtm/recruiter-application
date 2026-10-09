import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Row = {
  requirementId: string;
  roleTitle: string;
  sourceEmailSubject: string | null;
  sourceEmailGraphMessageId: string | null;
  sourceEmailInternetMessageId: string | null;
  clientId: string;
  createdAt: Date;
  client: { name: string };
};

function dupGroups(items: Row[], keyFn: (r: Row) => string) {
  const m = new Map<string, Row[]>();
  for (const r of items) {
    const k = keyFn(r);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return [...m.entries()].filter(([, v]) => v.length > 1);
}

async function main() {
  // Check explicit calendar days (server local) + combined window for downtime recovery pulls
  const days = [0, -1, -2].map((offset) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, label: start.toISOString().slice(0, 10) };
  });

  for (const { start, end, label } of days) {
    await reportWindow(start, end, label);
  }
}

async function reportWindow(start: Date, end: Date, label: string) {
  const today = await prisma.requirement.findMany({
    where: { isDeleted: false, createdAt: { gte: start, lt: end } },
    select: {
      requirementId: true,
      roleTitle: true,
      sourceEmailSubject: true,
      sourceEmailGraphMessageId: true,
      sourceEmailInternetMessageId: true,
      clientId: true,
      createdAt: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const emailSourced = today.filter(
    (r) => r.sourceEmailGraphMessageId || r.sourceEmailInternetMessageId || r.sourceEmailSubject,
  );

  const byGraph = dupGroups(emailSourced, (r) => r.sourceEmailGraphMessageId?.trim() || '');
  const byInternet = dupGroups(emailSourced, (r) => r.sourceEmailInternetMessageId?.trim() || '');
  const bySubjectRole = dupGroups(emailSourced, (r) => {
    const subj = (r.sourceEmailSubject || '').trim().toLowerCase();
    const role = (r.roleTitle || '').trim().toLowerCase();
    const client = (r.client?.name || r.clientId || '').trim().toLowerCase();
    return subj && role ? `${subj}|||${client}|||${role}` : '';
  });
  const bySubjectOnly = dupGroups(emailSourced, (r) => (r.sourceEmailSubject || '').trim().toLowerCase());
  const byRoleClient = dupGroups(emailSourced, (r) => {
    const role = (r.roleTitle || '').trim().toLowerCase();
    const client = (r.client?.name || r.clientId || '').trim().toLowerCase();
    return role && client ? `${client}|||${role}` : '';
  });

  console.log(JSON.stringify({
    date: label,
    todayTotal: today.length,
    emailSourcedToday: emailSourced.length,
    manualOrOtherToday: today.length - emailSourced.length,
    dupByGraphMessageId: byGraph.length,
    dupByInternetMessageId: byInternet.length,
    dupBySubjectClientRole: bySubjectRole.length,
    dupBySameEmailSubject: bySubjectOnly.length,
    dupBySameClientRoleTitle: byRoleClient.length,
  }, null, 2));

  if (byGraph.length) {
    console.log('\nDUPLICATE_GRAPH_MESSAGE_IDS:');
    for (const [, rows] of byGraph) {
      console.log(rows.map((r) => `${r.requirementId} | ${r.roleTitle} | ${r.sourceEmailSubject?.slice(0, 60)}`).join('\n'));
      console.log('---');
    }
  }

  if (bySubjectRole.length) {
    console.log('\nDUPLICATE_SUBJECT_CLIENT_ROLE:');
    for (const [, rows] of bySubjectRole) {
      console.log(rows.map((r) => `${r.requirementId} | ${r.client.name} | ${r.roleTitle}`).join('\n'));
      console.log('---');
    }
  }

  if (emailSourced.length) {
    console.log('\nEMAIL_SOURCED_LIST:');
    for (const r of emailSourced) {
      const t = r.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`${r.requirementId} | ${t} | ${r.client.name} | ${(r.roleTitle || '').slice(0, 50)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
