// ============================================================================
// VantaUM Operations — Business Constants
// All calculations derive from these single-source-of-truth figures.
// ============================================================================

export const BIZ = {
  // Revenue
  PEPM: 12,                        // $ per employee per month
  MAX_LIVES: 584_000,

  // Auth volume
  AUTHS_PER_MEMBER_PER_YEAR: 1.5,
  FOLLOWUP_RATE: 0.18,             // 18% of auths generate a follow-up contact
  AI_AUTOMATION_RATE: 0.90,        // 90% AI-handled
  HUMAN_REVIEW_RATE: 0.10,         // 10% require human clinical review
  P2P_RATE: 0.05,                  // 5% require P2P physician review
  P2P_COST_PER_REVIEW: 250,        // $250 / P2P review

  // Tithe
  TITHE_RATE: 0.10,                // 10% off gross, first

  // Tax assumption (effective rate after tithe)
  EFFECTIVE_TAX_RATE: 0.37,

  // Principal target
  PRINCIPAL_NET_TARGET: 900_000,   // $900K net per principal
  NUM_PRINCIPALS: 2,               // Jonah + Jonathan

  // Compensation (double Houston market)
  COMP: {
    medical_delivery_lead: 500_000,
    clinician: 180_000,
    concierge_delivery_lead: 140_000,
    concierge_pl: 100_000,
  },

  // Headcount caps
  HEAD: {
    medical_delivery_lead: 1,
    clinicians: 10,
    concierge_delivery_leads: 3,
    concierge_pls: 30,
  },

  // Clinician capacity: 10 min/auth, 8h/day, 250 working days
  CLINICIAN_MINUTES_PER_AUTH: 10,
  CLINICIAN_WORKING_MINUTES_PER_YEAR: 8 * 60 * 250,

  // Concierge PL capacity: handles follow-up contacts
  // Each PL works ~2,000 contacts/year (phone-heavy, 30 min/contact)
  CONTACTS_PER_PL_PER_YEAR: 2_000,
} as const;

// ============================================================================
// Core calculation engine — pure functions, no side effects
// ============================================================================

export function calcRevenue(lives: number) {
  const grossMonthly = lives * BIZ.PEPM;
  const grossAnnual = grossMonthly * 12;
  const titheMonthly = grossMonthly * BIZ.TITHE_RATE;
  const titheAnnual = titheMonthly * 12;
  const netBeforeTax = grossAnnual - titheAnnual;
  const taxLiability = netBeforeTax * BIZ.EFFECTIVE_TAX_RATE;
  const netAfterTax = netBeforeTax - taxLiability;
  return { grossMonthly, grossAnnual, titheMonthly, titheAnnual, netBeforeTax, taxLiability, netAfterTax };
}

export function calcAuths(lives: number) {
  const authsPerYear = lives * BIZ.AUTHS_PER_MEMBER_PER_YEAR;
  const authsPerMonth = authsPerYear / 12;
  const aiHandled = authsPerYear * BIZ.AI_AUTOMATION_RATE;
  const clinicianReview = authsPerYear * BIZ.HUMAN_REVIEW_RATE;
  const p2pReview = authsPerYear * BIZ.P2P_RATE;
  const contacts = authsPerYear * BIZ.FOLLOWUP_RATE;
  const contactsPerMonth = contacts / 12;
  const p2pCostAnnual = p2pReview * BIZ.P2P_COST_PER_REVIEW;
  return { authsPerYear, authsPerMonth, aiHandled, clinicianReview, p2pReview, contacts, contactsPerMonth, p2pCostAnnual };
}

export function calcHeadcount(lives: number) {
  const auths = calcAuths(lives);

  // Clinicians needed based on review volume
  const clinicianMinutesNeeded = auths.clinicianReview * BIZ.CLINICIAN_MINUTES_PER_AUTH;
  const cliniciansNeeded = Math.ceil(clinicianMinutesNeeded / BIZ.CLINICIAN_WORKING_MINUTES_PER_YEAR);
  const clinicians = Math.min(cliniciansNeeded, BIZ.HEAD.clinicians);

  // PLs needed based on contact volume
  const plsNeeded = Math.ceil(auths.contacts / BIZ.CONTACTS_PER_PL_PER_YEAR);
  const concierge_pls = Math.min(plsNeeded, BIZ.HEAD.concierge_pls);

  // Delivery leads: 1 per 10 PLs (round up)
  const deliveryLeadsNeeded = Math.max(1, Math.ceil(concierge_pls / 10));
  const concierge_delivery_leads = Math.min(deliveryLeadsNeeded, BIZ.HEAD.concierge_delivery_leads);

  // Medical delivery lead: needed once clinicians > 0
  const medical_delivery_lead = clinicians > 0 ? 1 : 0;

  return { medical_delivery_lead, clinicians, concierge_delivery_leads, concierge_pls };
}

export function calcDeliveryCost(lives: number) {
  const hc = calcHeadcount(lives);
  const auths = calcAuths(lives);

  const medLeadCost = hc.medical_delivery_lead * BIZ.COMP.medical_delivery_lead;
  const clinicianCost = hc.clinicians * BIZ.COMP.clinician;
  const deliveryLeadCost = hc.concierge_delivery_leads * BIZ.COMP.concierge_delivery_lead;
  const plCost = hc.concierge_pls * BIZ.COMP.concierge_pl;

  const totalStaffAnnual = medLeadCost + clinicianCost + deliveryLeadCost + plCost;
  const totalStaffMonthly = totalStaffAnnual / 12;
  const p2pAnnual = auths.p2pCostAnnual;
  const totalDeliveryAnnual = totalStaffAnnual + p2pAnnual;
  const totalDeliveryMonthly = totalDeliveryAnnual / 12;

  return {
    medLeadCost, clinicianCost, deliveryLeadCost, plCost,
    totalStaffAnnual, totalStaffMonthly,
    p2pAnnual, totalDeliveryAnnual, totalDeliveryMonthly,
  };
}

export function calcConstellationPL(lives: number) {
  const rev = calcRevenue(lives);
  const delivery = calcDeliveryCost(lives);

  // Principal draws (gross, pre-tax)
  const principalDrawGross = BIZ.PRINCIPAL_NET_TARGET / (1 - BIZ.EFFECTIVE_TAX_RATE);
  const principalDrawsTotal = principalDrawGross * BIZ.NUM_PRINCIPALS;

  // Ops buffer: 5% of gross revenue
  const opsBuffer = rev.grossAnnual * 0.05;

  const totalCosts = delivery.totalDeliveryAnnual + principalDrawsTotal + opsBuffer;
  const netToConstellation = rev.netAfterTax - delivery.totalDeliveryAnnual - opsBuffer;
  const netPerPrincipal = (netToConstellation - principalDrawsTotal) / BIZ.NUM_PRINCIPALS;

  return {
    principalDrawGross,
    principalDrawsTotal,
    opsBuffer,
    totalCosts,
    netToConstellation,
    netPerPrincipal,
    revenueCoversDelivery: rev.grossAnnual >= delivery.totalDeliveryAnnual,
    principalsAtTarget: netToConstellation >= principalDrawsTotal,
  };
}

// ── Milestone targets (lives required) ──────────────────────────────────────

export const MILESTONES = [
  {
    key: 'breakeven',
    label: 'Break Even',
    description: 'Delivery costs covered by revenue',
    lives: livesForBreakeven(),
  },
  {
    key: 'house',
    label: 'House Covered',
    description: '$20K/mo personal overhead covered per principal',
    lives: livesForNetMonthly(20_000 * BIZ.NUM_PRINCIPALS * 12),
  },
  {
    key: '11_pls',
    label: '11 PLs Funded',
    description: 'First 11 Concierge Practice Leads on payroll',
    lives: livesFor11PLs(),
  },
  {
    key: 'principals_900k',
    label: 'Principals at $900K',
    description: 'Jonah + Jonathan each net $900K after tithe & taxes',
    lives: livesForPrincipals900k(),
  },
  {
    key: 'full_scale',
    label: 'Full Scale',
    description: '584,000 lives — full constellation deployment',
    lives: BIZ.MAX_LIVES,
  },
] as const;

function livesForBreakeven(): number {
  // Binary search: find lives where gross >= total delivery cost
  for (let l = 1000; l <= BIZ.MAX_LIVES; l += 500) {
    const rev = calcRevenue(l);
    const del = calcDeliveryCost(l);
    if (rev.grossAnnual >= del.totalDeliveryAnnual) return l;
  }
  return BIZ.MAX_LIVES;
}

function livesForNetMonthly(annualNet: number): number {
  for (let l = 1000; l <= BIZ.MAX_LIVES; l += 500) {
    const rev = calcRevenue(l);
    if (rev.netAfterTax >= annualNet) return l;
  }
  return BIZ.MAX_LIVES;
}

function livesFor11PLs(): number {
  for (let l = 1000; l <= BIZ.MAX_LIVES; l += 500) {
    const hc = calcHeadcount(l);
    if (hc.concierge_pls >= 11) return l;
  }
  return BIZ.MAX_LIVES;
}

function livesForPrincipals900k(): number {
  for (let l = 1000; l <= BIZ.MAX_LIVES; l += 500) {
    const pl = calcConstellationPL(l);
    if (pl.netToConstellation >= BIZ.PRINCIPAL_NET_TARGET * BIZ.NUM_PRINCIPALS) return l;
  }
  return BIZ.MAX_LIVES;
}
