// ---------------------------------------------------------------------------
// VantaTR Scenario Studio — illustrative benefits-modeling engine.
//
// Everything here runs on hardcoded sample data. No backend, no persistence.
// All assumptions are surfaced in the on-screen "Assumptions" drawer so the
// math is never a black box.
// ---------------------------------------------------------------------------

/** Editable "Company Profile" basics. */
export type CompanyProfile = {
  name: string;
  employees: number;
  avgSalary: number;
  /** Current benefits spend per participating employee per year. */
  spendPerEmployee: number;
  /** Baseline plan-participation rate, 0–1. */
  participation: number;
};

/** The fictional sample employer. Hardcoded, never sourced from real data. */
export const SAMPLE_COMPANY: CompanyProfile = {
  name: "Meridian National Group",
  employees: 340_000,
  avgSalary: 52_000,
  spendPerEmployee: 9_800,
  participation: 0.68,
};

// ---------------------------------------------------------------------------
// Assumptions — every constant the model leans on, in one visible place.
// ---------------------------------------------------------------------------

export const ASSUMPTIONS = {
  /** Employer share of FICA (Social Security 6.2% + Medicare 1.45%). */
  employerFicaRate: 0.0765,
  /**
   * Average pre-tax dollars redirected per participant per year when a
   * tax-advantaged plan architecture is fully adopted. Scales linearly with
   * the architecture-adoption lever.
   */
  redirectionPerParticipantAtFullAdoption: 3_000,
  /**
   * Net efficiency of curated self-funded / level-funded plans versus a
   * fully-insured traditional plan, expressed as a share of covered benefits
   * spend on the self-funded portion of the population.
   */
  selfFundedEfficiency: 0.08,
  /** Illustrative annual cost per participant for each optional enrichment. */
  addOnCostPerParticipant: {
    mentalHealth: 85,
    familyBuilding: 140,
    studentLoan: 110,
  },
} as const;

export const ADD_ONS = [
  {
    key: "mentalHealth" as const,
    label: "Enhanced mental health",
    blurb: "Expanded therapy access + coaching network",
    cost: ASSUMPTIONS.addOnCostPerParticipant.mentalHealth,
  },
  {
    key: "familyBuilding" as const,
    label: "Family building",
    blurb: "Fertility, adoption & surrogacy support",
    cost: ASSUMPTIONS.addOnCostPerParticipant.familyBuilding,
  },
  {
    key: "studentLoan" as const,
    label: "Student loan support",
    blurb: "Employer contribution toward loan paydown",
    cost: ASSUMPTIONS.addOnCostPerParticipant.studentLoan,
  },
];

export type AddOnKey = (typeof ADD_ONS)[number]["key"];

// ---------------------------------------------------------------------------
// Design levers — the inputs the executive drives live.
// ---------------------------------------------------------------------------

export type Levers = {
  /** Pre-tax benefit participation rate, 0–1. */
  participation: number;
  /** Tax-advantaged plan architecture adoption, 0–1. */
  architecture: number;
  /** Share of population on curated self-funded / level-funded plans, 0–1. */
  planMix: number;
  /** Share of savings reinvested into richer rewards vs. taken as cost cut, 0–1. */
  reinvestment: number;
  /** Optional enrichment toggles. */
  addOns: Record<AddOnKey, boolean>;
};

export const DEFAULT_LEVERS: Levers = {
  participation: SAMPLE_COMPANY.participation,
  architecture: 0.35,
  planMix: 0.3,
  reinvestment: 0.5,
  addOns: {
    mentalHealth: false,
    familyBuilding: false,
    studentLoan: false,
  },
};

// ---------------------------------------------------------------------------
// Scenario presets.
// ---------------------------------------------------------------------------

export type PresetKey = "conservative" | "balanced" | "aggressive";

export const PRESETS: Record<
  PresetKey,
  { label: string; blurb: string; levers: Levers }
> = {
  conservative: {
    label: "Conservative",
    blurb: "Low-disruption tuning. Bank most of the savings.",
    levers: {
      participation: 0.7,
      architecture: 0.25,
      planMix: 0.2,
      reinvestment: 0.3,
      addOns: { mentalHealth: true, familyBuilding: false, studentLoan: false },
    },
  },
  balanced: {
    label: "Balanced",
    blurb: "Meaningful redesign. Split savings evenly.",
    levers: {
      participation: 0.76,
      architecture: 0.55,
      planMix: 0.5,
      reinvestment: 0.5,
      addOns: { mentalHealth: true, familyBuilding: true, studentLoan: false },
    },
  },
  aggressive: {
    label: "Aggressive",
    blurb: "Full architecture shift. Reinvest heavily in people.",
    levers: {
      participation: 0.85,
      architecture: 0.9,
      planMix: 0.8,
      reinvestment: 0.7,
      addOns: { mentalHealth: true, familyBuilding: true, studentLoan: true },
    },
  },
};

// ---------------------------------------------------------------------------
// The model.
// ---------------------------------------------------------------------------

export type Outcome = {
  participants: number;
  currentCost: number;
  redirectedPreTaxDollars: number;
  ficaSavings: number;
  planMixSavings: number;
  totalSavings: number;
  savingsPerEmployee: number;
  rewardsReinvestment: number;
  costReduction: number;
  addOnCost: number;
  netRewardsBudget: number;
  /** Redesigned program cost after reinvestment + enrichment layered on. */
  redesignedNetCost: number;
};

export function computeOutcome(
  company: CompanyProfile,
  levers: Levers,
): Outcome {
  const participants = company.employees * levers.participation;

  // Current annual program cost = enrolled population × per-head spend.
  const currentCost = participants * company.spendPerEmployee;

  // Pre-tax dollars redirected into tax-advantaged vehicles.
  const redirectedPreTaxDollars =
    participants *
    ASSUMPTIONS.redirectionPerParticipantAtFullAdoption *
    levers.architecture;

  // Employer FICA savings on those redirected dollars.
  const ficaSavings = redirectedPreTaxDollars * ASSUMPTIONS.employerFicaRate;

  // Plan-architecture efficiency from self-funded / level-funded mix.
  const planMixSavings =
    currentCost * levers.planMix * ASSUMPTIONS.selfFundedEfficiency;

  const totalSavings = ficaSavings + planMixSavings;
  const savingsPerEmployee = totalSavings / company.employees;

  // Reinvestment split.
  const rewardsReinvestment = totalSavings * levers.reinvestment;
  const costReduction = totalSavings * (1 - levers.reinvestment);

  // Optional enrichments funded from the reinvestment pool.
  const addOnPerParticipant = ADD_ONS.reduce(
    (sum, a) => (levers.addOns[a.key] ? sum + a.cost : sum),
    0,
  );
  const addOnCost = participants * addOnPerParticipant;
  const netRewardsBudget = rewardsReinvestment - addOnCost;

  // Redesigned net cost = retained spend + what's reinvested back into people.
  const redesignedNetCost = currentCost - totalSavings + rewardsReinvestment;

  return {
    participants,
    currentCost,
    redirectedPreTaxDollars,
    ficaSavings,
    planMixSavings,
    totalSavings,
    savingsPerEmployee,
    rewardsReinvestment,
    costReduction,
    addOnCost,
    netRewardsBudget,
    redesignedNetCost,
  };
}

// ---------------------------------------------------------------------------
// Formatters.
// ---------------------------------------------------------------------------

export function formatUSD(value: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
