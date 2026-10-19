import { PART_A_QUESTIONS, type PartAAnswer, type PartAQuestion } from './types';

export interface PartAInput {
  signed: boolean;
  answers: Partial<Record<PartAQuestion, PartAAnswer>>;
}

/**
 * Part A (conflict + credentials) must be signed and complete.
 * Any "yes" or blank answer is a hard STOP. Records must not be released.
 */
export function evaluatePartA(input: PartAInput): { passed: boolean; code: string; message: string } {
  if (!input.signed) {
    return {
      passed: false,
      code: 'attestation_unsigned',
      message: 'Part A is not signed. Records stay unreleased.',
    };
  }
  for (const question of PART_A_QUESTIONS) {
    const answer = input.answers[question];
    if (answer !== 'yes' && answer !== 'no') {
      return {
        passed: false,
        code: 'attestation_blank',
        message: `Part A answer "${question}" is blank. Records stay unreleased.`,
      };
    }
    if (answer === 'yes') {
      return {
        passed: false,
        code: 'attestation_yes',
        message: `Part A answer "${question}" is yes. Records stay unreleased.`,
      };
    }
  }
  return {
    passed: true,
    code: 'attestation_passed',
    message: 'Part A is signed and every answer is no.',
  };
}
