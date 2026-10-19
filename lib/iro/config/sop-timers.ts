/**
 * SOP v0.4 timers that are not state rules.
 * State durations stay in state-settings. These are the workflow clocks
 * the spec states outright (reviewer due date, not a postal-code table).
 */
export const IRO_SOP_TIMERS = {
  reviewer_standard_business_days_before_deadline: 5,
  reviewer_expedited_hours_from_receipt: 48,
} as const;
