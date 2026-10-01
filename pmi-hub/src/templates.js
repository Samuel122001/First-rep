// Standard library for new PMI projects. Timing is in days relative to
// Day 1 (closing): [start, end]. Negative values are before closing.
// The tasks are a generic PMI playbook.

// `until` = last day offset (relative to Day 1) that belongs to the phase;
// null = open-ended. Used to file template tasks and to pick a default phase.
export const DEFAULT_PHASES = [
  { id: 'ph_pre', name: 'Pre-close', until: 0 },
  { id: 'ph_d30', name: 'Day 1–30', until: 30 },
  { id: 'ph_d100', name: 'Day 31–100', until: 100 },
  { id: 'ph_post', name: 'Beyond Day 100', until: null },
];

export function phaseForOffset(endOffset) {
  return DEFAULT_PHASES.find((p) => p.until == null || endOffset <= p.until).id;
}

const T = (key, title, start, end, extra = {}) => ({ key, title, start, end, ...extra });

export const LIBRARY = [
  {
    key: 'gov',
    name: 'PMO & Governance',
    desc: 'Steering committee, meeting cadence, integration goals and follow-up.',
    preselect: true,
    tasks: [
      T('gov1', 'Appoint PMI lead and workstream leads', -30, -14),
      T('gov2', 'Define integration goals and value drivers', -21, 0),
      T('gov3', 'Set up steering committee and meeting cadence', -14, 0),
      T('gov4', 'Day 1 checklist complete', -7, 0, { milestone: true }),
      T('gov5', '30-day review with steering committee', 30, 30, { milestone: true }),
      T('gov6', '100-day review', 100, 100, { milestone: true }),
    ],
  },
  {
    key: 'ma',
    name: 'M&A & IC',
    desc: 'Due diligence, SPA, signing and closing.',
    preselect: false,
    tasks: [
      T('ma1', 'Due diligence and negotiation', -90, -30, { description: 'Incl. finance, operations and commercial.' }),
      T('ma2', 'Legal document list compiled and shared', -60, -50),
      T('ma3', 'SPA draft review', -45, -10),
      T('ma4', 'SPA signing', 0, 0, { milestone: true }),
      T('ma5', 'Notary and registration of ownership', 0, 7),
      T('ma6', 'Post-closing conditions follow-up (earn-out etc.)', 30, 365),
    ],
  },
  {
    key: 'comm',
    name: 'Communication',
    desc: 'Internal and external communication about the acquisition.',
    preselect: true,
    tasks: [
      T('comm1', 'Stakeholder communication plan', -21, -3),
      T('comm2', 'Announce the acquisition internally', 0, 0, { milestone: true }),
      T('comm3', 'Publish and send out press release', 0, 14, { dependsOnKeys: ['com2'], description: 'Contingent on top clients having been informed (Commercial).' }),
      T('comm4', 'Update website and social media', 7, 30),
    ],
  },
  {
    key: 'com',
    name: 'Commercial',
    desc: 'Clients, sales, contracts and the commercial organisation.',
    preselect: true,
    tasks: [
      T('com1', 'Map customer portfolio and top clients', -30, 0),
      T('com2', 'Communicate the acquisition to top clients', 0, 14),
      T('com3', 'Set commercial organisation and account ownership', 0, 30),
      T('com4', 'Review contracts with change of control clauses', -30, 14),
      T('com5', 'Plug tender funnel into group bid support', 14, 60),
    ],
  },
  {
    key: 'ops',
    name: 'Operations',
    desc: 'Delivery processes, systems and stable operations.',
    preselect: true,
    tasks: [
      T('ops1', 'Map delivery processes and order workflows', 0, 30),
      T('ops2', 'Move reporting lines', 0, 30),
      T('ops3', 'SOPs and knowledge capture before any exits', 0, 45),
      T('ops4', 'Stabilise delivery', 0, 60),
      T('ops5', 'Training in group systems', 30, 90),
    ],
  },
  {
    key: 'fin',
    name: 'Finance',
    desc: 'Banking, accounting, budget and reporting.',
    preselect: true,
    tasks: [
      T('fin1', 'Prepare new bank accounts and payment flows', -30, 0),
      T('fin2', 'Invoices paid to the new bank account', 0, 7),
      T('fin3', 'Establish balance sheet at closing', 0, 21),
      T('fin4', 'Meeting with tax advisors', 0, 21),
      T('fin5', 'Add to the MBR and QBR cycle', 0, 45),
      T('fin6', 'Fold into group budget and forecast', 0, 60),
      T('fin7', 'Accounting handover', 30, 120),
    ],
  },
  {
    key: 'ppl',
    name: 'People',
    desc: 'Organisation, key people, terms and onboarding.',
    preselect: true,
    tasks: [
      T('ppl1', 'Confirm key people and retained core', -30, 0),
      T('ppl2', 'Welcome meeting and remote onboarding', 0, 14),
      T('ppl3', 'Fold into All Hands', 0, 30),
      T('ppl4', 'Employment terms and contracts', 0, 45),
      T('ppl5', 'Payroll and benefits', 0, 60),
      T('ppl6', 'Conduct onboarding sessions', 14, 60),
    ],
  },
  {
    key: 'tech',
    name: 'Tech',
    desc: 'Access, security, asset inventory and migration.',
    preselect: true,
    tasks: [
      T('tech1', 'Collect access to domains and accounts', 0, 7),
      T('tech2', 'Asset inventory', 0, 30, { description: 'Licenses, domains, mailboxes, file shares, backups.' }),
      T('tech3', 'Tech baseline review', 0, 45),
      T('tech4', 'Review IT vendors and contracts', 14, 60),
      T('tech5', 'Migration to group systems', 30, 120),
    ],
  },
  {
    key: 'data',
    name: 'Analytics',
    desc: 'Data sources, KPIs and dashboards.',
    preselect: false,
    tasks: [
      T('data1', 'Map data sources and flows', 0, 45),
      T('data2', 'Define KPI set and map to data sources', 0, 45),
      T('data3', 'Build dashboards', 30, 120),
    ],
  },
  {
    key: 'legal',
    name: 'Legal & Compliance',
    desc: 'Corporate housekeeping, contracts, GDPR and insurance.',
    preselect: false,
    tasks: [
      T('legal1', 'Board, signatories and registrations', 0, 14),
      T('legal2', 'Contract inventory', -14, 30),
      T('legal3', 'Insurance', 0, 30),
      T('legal4', 'GDPR and data processing agreements', 0, 60),
    ],
  },
  {
    key: 'brand',
    name: 'Brand & Marketing',
    desc: 'Brand strategy and rebranding.',
    preselect: false,
    tasks: [
      T('brand1', 'Decide brand strategy', 14, 60),
      T('brand2', 'Execute rebranding', 60, 180),
    ],
  },
  {
    key: 'fac',
    name: 'Office & Facilities',
    desc: 'Office solution and leases.',
    preselect: false,
    tasks: [
      T('fac1', 'Decide on office solution', -30, 30),
      T('fac2', 'Lease termination or transfer', 30, 120),
    ],
  },
];
