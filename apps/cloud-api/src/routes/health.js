/**
 * @fileoverview Health check routes.
 * @module cloud-api/routes/health
 */

'use strict';

const { Router } = require('express');
const os = require('node:os');
const { getDbLatency } = require('../db/client');
const { APP_VERSION } = require('@glimpse/shared/constants');

const router = Router();

/**
 * GET /health — Quick health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    version: APP_VERSION,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/detailed — Detailed system health with DB latency,
 * memory usage, CPU load, and system info.
 */
router.get('/detailed', async (req, res) => {
  const memUsage = process.memoryUsage();
  const dbLatency = await getDbLatency();
  const cpus = os.cpus();
  const loadAvg = os.loadavg();

  /* Calculate CPU usage percentage across all cores */
  const totalCpuTime = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc + total;
  }, 0);

  const idleCpuTime = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  const cpuUsagePercent = ((1 - idleCpuTime / totalCpuTime) * 100).toFixed(1);

  res.json({
    status: dbLatency >= 0 ? 'ok' : 'degraded',
    version: APP_VERSION,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    db: {
      status: dbLatency >= 0 ? 'connected' : 'unreachable',
      latencyMs: dbLatency,
    },
    memory: {
      rssBytes: memUsage.rss,
      rssMb: (memUsage.rss / 1048576).toFixed(1),
      heapUsedBytes: memUsage.heapUsed,
      heapUsedMb: (memUsage.heapUsed / 1048576).toFixed(1),
      heapTotalBytes: memUsage.heapTotal,
      heapTotalMb: (memUsage.heapTotal / 1048576).toFixed(1),
      externalBytes: memUsage.external,
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || 'unknown',
      usagePercent: parseFloat(cpuUsagePercent),
      loadAverage: {
        '1m': loadAvg[0]?.toFixed(2),
        '5m': loadAvg[1]?.toFixed(2),
        '15m': loadAvg[2]?.toFixed(2),
      },
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      totalMemoryMb: (os.totalmem() / 1048576).toFixed(0),
      freeMemoryMb: (os.freemem() / 1048576).toFixed(0),
    },
    process: {
      pid: process.pid,
      env: process.env.NODE_ENV || 'development',
    },
  });
});

module.exports = router;
