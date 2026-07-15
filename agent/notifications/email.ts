import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CompletionNotification {
  taskId: string; taskTitle: string; status: string; branch: string; commitHash: string | null; durationMs: number;
  filesChanged: string[]; testResult: string; renderResult: string; baselineQualityScore: number | null; candidateQualityScore: number | null;
  qualityDelta: number | null; criticalErrors: number; artifactLocation: string; recommendedNextTask: string;
}

function content(notification: CompletionNotification) {
  return [
    `Task ID: ${notification.taskId}`, `Title: ${notification.taskTitle}`, `Status: ${notification.status}`, `Branch: ${notification.branch}`,
    `Commit: ${notification.commitHash ?? "none"}`, `Duration ms: ${notification.durationMs}`, `Files changed: ${notification.filesChanged.join(", ") || "none"}`,
    `Tests: ${notification.testResult}`, `Render: ${notification.renderResult}`, `Baseline quality: ${notification.baselineQualityScore ?? "not available"}`,
    `Candidate quality: ${notification.candidateQualityScore ?? "not available"}`, `Quality delta: ${notification.qualityDelta ?? "not available"}`,
    `Critical errors: ${notification.criticalErrors}`, `Artifacts: ${notification.artifactLocation}`, `Recommended next task: ${notification.recommendedNextTask}`,
  ].join("\n");
}

async function smtpSend(subject: string, body: string) {
  const host = process.env.SMTP_HOST;
  const username = process.env.SMTP_USERNAME;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  const to = process.env.EMAIL_TO;
  if (!host || !from || !to) throw new Error("smtp_configuration_incomplete");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";
  let socket: Socket | TLSSocket = secure ? tlsConnect({ host, port, servername: host }) : createConnection({ host, port });
  let buffer = "";
  const response = () => new Promise<string>((resolve, reject) => {
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      const complete = lines.findIndex((line) => /^\d{3} /.test(line));
      if (complete >= 0) {
        const value = lines.slice(0, complete + 1).join("\r\n");
        buffer = lines.slice(complete + 1).join("\r\n");
        cleanup(); resolve(value);
      }
    };
    const cleanup = () => { socket.off("error", onError); socket.off("data", onData); };
    socket.on("error", onError); socket.on("data", onData);
  });
  const command = async (value: string, expected: number) => {
    socket.write(`${value}\r\n`);
    const received = await response();
    if (!received.startsWith(String(expected))) throw new Error(`smtp_command_failed:${expected}:${received.slice(0, 100)}`);
  };
  const greeting = await response();
  if (!greeting.startsWith("220")) throw new Error("smtp_greeting_failed");
  await command("EHLO ai-media-factory-agent", 250);
  if (!secure && process.env.SMTP_STARTTLS !== "false") {
    await command("STARTTLS", 220);
    socket = tlsConnect({ socket, servername: host });
    await command("EHLO ai-media-factory-agent", 250);
  }
  if (username && password) await command(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`).toString("base64")}`, 235);
  await command(`MAIL FROM:<${from}>`, 250);
  for (const recipient of to.split(",").map((value) => value.trim()).filter(Boolean)) await command(`RCPT TO:<${recipient}>`, 250);
  await command("DATA", 354);
  const message = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body.replace(/^\./gm, "..").replace(/\n/g, "\r\n")}\r\n.`;
  await command(message, 250);
  await command("QUIT", 221);
  socket.end();
}

export async function sendCompletionNotification(root: string, notification: CompletionNotification) {
  const subject = `[AI Media Factory] ${notification.taskId}: ${notification.status}`;
  const body = content(notification);
  if (process.env.EMAIL_DRY_RUN !== "false" || !process.env.EMAIL_PROVIDER) {
    const directory = path.join(root, "agent/reports/email-previews");
    await mkdir(directory, { recursive: true });
    const preview = path.join(directory, `${notification.taskId}-${Date.now()}.eml`);
    await writeFile(preview, `Subject: ${subject}\n\n${body}\n`, { mode: 0o600 });
    return { delivered: false, dryRun: true, preview };
  }
  if (process.env.EMAIL_PROVIDER !== "smtp") throw new Error("unsupported_email_provider");
  await smtpSend(subject, body);
  return { delivered: true, dryRun: false, preview: null };
}
