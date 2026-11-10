export const CAUSE_OPTIONS = [
  { value: "didnt_understand", label: "Didn't understand the question" },
  { value: "stuck_no_approach", label: "Stuck, no approach" },
  { value: "slip", label: "Slip" },
  { value: "missing_fact", label: "Missing fact or formula" },
  { value: "wrong_concept", label: "Wrong concept used" },
  { value: "not_sure", label: "Not sure" },
] as const;

export const SLIP_SUBTYPE_OPTIONS = [
  { value: "calculation", label: "Calculation" },
  { value: "sign", label: "Sign" },
  { value: "misread", label: "Misread" },
  { value: "marking", label: "Marked wrong option" },
  { value: "units_rounding", label: "Units / rounding" },
] as const;

export type Cause = (typeof CAUSE_OPTIONS)[number]["value"];
export type SlipSubtype = (typeof SLIP_SUBTYPE_OPTIONS)[number]["value"];
export type AttemptResult = "right" | "wrong" | "couldnt_solve";

export type AttemptValidationInput = {
  result: AttemptResult | null;
  cause?: Cause | null;
  slipSubtype?: SlipSubtype | null;
  topicIds: string[];
};

export function validateAttempt(attempt: AttemptValidationInput): string[] {
  const errors: string[] = [];

  if (!attempt.result) {
    errors.push("Choose a result.");
    return errors;
  }

  if (attempt.result === "right") {
    if (attempt.cause || attempt.slipSubtype) {
      errors.push("Right answers cannot have a cause or slip subtype.");
    }
    return errors;
  }

  if (!attempt.cause) {
    errors.push("Choose a cause for this result.");
  }
  if (attempt.slipSubtype && attempt.cause !== "slip") {
    errors.push("A slip subtype is only allowed when the cause is Slip.");
  }
  if (
    (attempt.cause === "missing_fact" ||
      attempt.cause === "wrong_concept") &&
    attempt.topicIds.length === 0
  ) {
    errors.push("Choose at least one topic for this cause.");
  }

  return errors;
}

export function getCauseLabel(cause: Cause): string {
  return CAUSE_OPTIONS.find((option) => option.value === cause)?.label ?? cause;
}
