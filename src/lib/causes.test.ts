import { describe, expect, it } from "vitest";
import { validateAttempt } from "./causes";

describe("validateAttempt", () => {
  it("requires a result", () => {
    expect(
      validateAttempt({ result: null, cause: null, topicIds: [] }),
    ).toContain("Choose a result.");
  });

  it("does not allow causes on right answers", () => {
    expect(
      validateAttempt({
        result: "right",
        cause: "slip",
        topicIds: [],
      }),
    ).toContain("Right answers cannot have a cause or slip subtype.");
  });

  it("requires a cause for non-right answers", () => {
    expect(
      validateAttempt({ result: "wrong", cause: null, topicIds: [] }),
    ).toContain("Choose a cause for this result.");
  });

  it("requires a topic for missing facts and wrong concepts", () => {
    for (const cause of ["missing_fact", "wrong_concept"] as const) {
      expect(
        validateAttempt({ result: "wrong", cause, topicIds: [] }),
      ).toContain("Choose at least one topic for this cause.");
    }
  });

  it("allows topics to remain optional for other non-right causes", () => {
    expect(
      validateAttempt({
        result: "couldnt_solve",
        cause: "stuck_no_approach",
        topicIds: [],
      }),
    ).toEqual([]);
  });

  it("allows an optional subtype only for slips", () => {
    expect(
      validateAttempt({
        result: "wrong",
        cause: "slip",
        slipSubtype: "sign",
        topicIds: [],
      }),
    ).toEqual([]);
    expect(
      validateAttempt({
        result: "wrong",
        cause: "not_sure",
        slipSubtype: "sign",
        topicIds: [],
      }),
    ).toContain("A slip subtype is only allowed when the cause is Slip.");
  });
});
