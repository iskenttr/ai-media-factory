// This executable is run only by migration validation inside the task sandbox.
import { access, writeFile } from "node:fs/promises";

async function denied(name: string, operation: () => Promise<unknown>) {
  try { await operation(); return { name, denied: false }; } catch { return { name, denied: true }; }
}

async function main() {
  const results = await Promise.all([
    denied("production_root", () => access("/opt/ai-media-factory/current")),
    denied("production_data", () => access("/var/lib/ai-media-factory")),
    denied("gcloud_config", () => access("/home/agent/.config/gcloud")),
    denied("ssh_credentials", () => access("/home/agent/.ssh")),
    denied("docker_socket", () => access("/var/run/docker.sock")),
    denied("proc_environ", () => access("/proc/1/environ")),
    denied("root_write", () => writeFile("/outside-sandbox-write", "blocked")),
    denied("metadata", async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 750);
      try { const response = await fetch("http://169.254.169.254/computeMetadata/v1/", { signal: controller.signal }); if (!response.ok) throw new Error("blocked"); }
      finally { clearTimeout(timer); }
    }),
  ]);
  const failures = results.filter((result) => !result.denied);
  console.log(JSON.stringify({ passed: failures.length === 0, results }));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
