import { spawnSync } from "node:child_process";

const environment = process.env.AMF_ENVIRONMENT?.toLowerCase();
if (environment === "production") throw new Error("engineering_gate_refuses_production");

const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim();
if (!branch || branch === "main" || branch === "master") throw new Error(`engineering_gate_refuses_branch:${branch || "detached"}`);

for (const [command, args] of [
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
] as Array<[string, string[]]>) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env, timeout: 15 * 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
