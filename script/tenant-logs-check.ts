import fs from "fs";
const logger = fs.readFileSync("server/services/tenant-logger.ts", "utf8");
if (!logger.includes('_events_${ym')) throw new Error('monthly tenant log naming missing');
if (logger.includes('tenant_')) throw new Error('should not use tenant folder naming');
if (!logger.includes('LOG_ROOT')) throw new Error('logs root missing');
if (!logger.includes('RETENTION_MONTHS')) throw new Error('retention config missing');
console.log('tenant-logs-check: OK');
