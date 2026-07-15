import { describe, expect, it } from "vitest";

import { validateAss } from "./ass-parser";

function validAss(text = "Merhaba, dünya") {
  return `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Style: Localized,DejaVu Sans,48

[Events]
Dialogue: 0,0:00:00.00,0:00:01.50,Localized,,0,0,0,,${text}
`;
}

describe("subtitle quality V3 ASS validation", () => {
  it("marks an omitted ASS document as not run", () => {
    expect(validateAss(undefined)).toEqual({
      status: "not_run",
      dialogueCount: 0,
      issues: [],
    });
  });

  it("accepts a valid dialogue and preserves commas in its text field", () => {
    expect(validateAss(validAss())).toEqual({
      status: "passed",
      dialogueCount: 1,
      issues: [],
    });
  });

  it("reports structural sections missing from an ASS document", () => {
    const result = validateAss("Dialogue: 0,0:00:00.00,0:00:01.00,Missing,,0,0,0,,Text");

    expect(result.status).toBe("failed");
    expect(result.dialogueCount).toBe(1);
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "ass_missing_script_info",
      "ass_missing_styles",
      "ass_missing_events",
      "ass_unknown_style",
    ]));
  });

  it("detects malformed dialogue fields, timestamps, styles, lines, tags, and controls", () => {
    const verticalTab = String.fromCharCode(11);
    const malformed = `${validAss().replace("Dialogue: 0,0:00:00.00,0:00:01.50,Localized,,0,0,0,,Merhaba, dünya\n", "")}
Dialogue: 0,broken,0:00:01.00,Unknown,,0,0,0,,{first\\Nsecond\\Nthird${verticalTab}
Dialogue: too,few,fields
`;
    const result = validateAss(malformed);
    const codes = result.issues.map((entry) => entry.code);

    expect(result.status).toBe("failed");
    expect(result.dialogueCount).toBe(2);
    expect(codes).toEqual(expect.arrayContaining([
      "ass_control_character",
      "ass_timestamp",
      "ass_unknown_style",
      "ass_line_count",
      "ass_override_balance",
      "ass_dialogue_format",
    ]));
    expect(result.issues.every((entry) => entry.severity === "critical")).toBe(true);
  });
});
