import type { AssValidationResult, DeterministicIssue } from "./contracts";

const ASS_TIME = /^\d+:\d{2}:\d{2}\.\d{2}$/;

function issue(code: string, message: string): DeterministicIssue {
  return { code, severity: "critical", message };
}

function validTimestamp(value: string) {
  if (!ASS_TIME.test(value)) return false;
  const [hours, minutes, rest] = value.split(":");
  const [seconds, centiseconds] = rest.split(".");
  return Number(hours) >= 0 && Number(minutes) < 60 && Number(seconds) < 60 && Number(centiseconds) < 100;
}

export function validateAss(assText: string | undefined): AssValidationResult {
  if (assText === undefined) return { status: "not_run", dialogueCount: 0, issues: [] };
  const issues: DeterministicIssue[] = [];
  if (!assText.includes("[Script Info]")) issues.push(issue("ass_missing_script_info", "ASS is missing [Script Info]."));
  if (!assText.includes("[V4+ Styles]")) issues.push(issue("ass_missing_styles", "ASS is missing [V4+ Styles]."));
  if (!assText.includes("[Events]")) issues.push(issue("ass_missing_events", "ASS is missing [Events]."));
  const styles = new Set(
    assText.split(/\r?\n/).filter((line) => line.startsWith("Style:")).map((line) => line.slice(6).split(",", 1)[0].trim()),
  );
  const dialogue = assText.split(/\r?\n/).filter((line) => line.startsWith("Dialogue:"));
  for (const [index, line] of dialogue.entries()) {
    if (/\u0000|\u0008|\u000b|\u000c/.test(line)) issues.push(issue("ass_control_character", `Dialogue ${index + 1} contains a control character.`));
    const fields = line.slice(9).split(",");
    if (fields.length < 10) {
      issues.push(issue("ass_dialogue_format", `Dialogue ${index + 1} has fewer than 10 fields.`));
      continue;
    }
    const [, start, end, style, , , , , , ...textParts] = fields;
    if (!validTimestamp(start.trim()) || !validTimestamp(end.trim())) issues.push(issue("ass_timestamp", `Dialogue ${index + 1} has an invalid timestamp.`));
    if (!styles.has(style.trim())) issues.push(issue("ass_unknown_style", `Dialogue ${index + 1} references an unknown style.`));
    const text = textParts.join(",");
    if (text.split(/\\N/i).length > 2) issues.push(issue("ass_line_count", `Dialogue ${index + 1} exceeds two lines.`));
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    if (opens !== closes) issues.push(issue("ass_override_balance", `Dialogue ${index + 1} has unbalanced override tags.`));
  }
  return { status: issues.length ? "failed" : "passed", dialogueCount: dialogue.length, issues };
}
