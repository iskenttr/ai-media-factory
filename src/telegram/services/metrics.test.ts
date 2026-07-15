import { describe, it, expect } from "vitest";
import { getServerMetrics, getUptime, getHostname } from "./metrics";
import os from "node:os";

describe("metrics service", () => {
  describe("getServerMetrics", () => {
    it("returns valid server metrics", async () => {
      const metrics = await getServerMetrics();

      expect(metrics).toHaveProperty("cpuUsage");
      expect(metrics).toHaveProperty("ramUsage");
      expect(metrics).toHaveProperty("diskUsage");
      expect(metrics).toHaveProperty("loadAverage");
      expect(metrics).toHaveProperty("os");
      expect(metrics).toHaveProperty("nodeVersion");
      expect(metrics).toHaveProperty("hostname");

      expect(typeof metrics.cpuUsage).toBe("number");
      expect(typeof metrics.ramUsage).toBe("number");
      expect(typeof metrics.diskUsage).toBe("number");
      expect(Array.isArray(metrics.loadAverage)).toBe(true);
      expect(metrics.loadAverage.length).toBe(3);
    });

    it("cpu usage is between 0 and 100", async () => {
      const metrics = await getServerMetrics();
      expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpuUsage).toBeLessThanOrEqual(100);
    });

    it("ram usage is between 0 and 100", async () => {
      const metrics = await getServerMetrics();
      expect(metrics.ramUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.ramUsage).toBeLessThanOrEqual(100);
    });

    it("node version matches process version", async () => {
      const metrics = await getServerMetrics();
      expect(metrics.nodeVersion).toBe(process.version);
    });

    it("hostname matches os.hostname", async () => {
      const metrics = await getServerMetrics();
      expect(metrics.hostname).toBe(os.hostname());
    });
  });

  describe("getUptime", () => {
    it("returns uptime in seconds", () => {
      const uptime = getUptime();
      expect(typeof uptime).toBe("number");
      expect(uptime).toBeGreaterThan(0);
    });

    it("uptime increases over time", async () => {
      const uptime1 = getUptime();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const uptime2 = getUptime();
      expect(uptime2).toBeGreaterThanOrEqual(uptime1);
    });
  });

  describe("getHostname", () => {
    it("returns the system hostname", () => {
      const hostname = getHostname();
      expect(typeof hostname).toBe("string");
      expect(hostname.length).toBeGreaterThan(0);
      expect(hostname).toBe(os.hostname());
    });
  });
});
