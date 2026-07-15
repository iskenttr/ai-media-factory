import os from "node:os";
import type { ServerMetrics } from "../types";

export async function getServerMetrics(): Promise<ServerMetrics> {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as Record<string, number>)[type];
    }
    totalIdle += cpu.times.idle;
  }

  const cpuUsage = ((totalTick - totalIdle) / totalTick) * 100;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsage = (usedMem / totalMem) * 100;

  const diskUsage = await getDiskUsage();

  return {
    cpuUsage: isNaN(cpuUsage) ? 0 : cpuUsage,
    ramUsage,
    diskUsage,
    loadAverage: os.loadavg(),
    os: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
    hostname: os.hostname(),
  };
}

async function getDiskUsage(): Promise<number> {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return (usedMem / totalMem) * 100;
  } catch {
    return 0;
  }
}

export function getUptime(): number {
  return process.uptime();
}

export function getHostname(): string {
  return os.hostname();
}
