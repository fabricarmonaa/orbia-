import winston from "winston";
import path from "path";

// Formato JSON limpio para produccion y logs en Cloud (Datadog, CloudWatch, etc)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console limpio para entornos de desarrollo
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf((info: any) => {
    const { timestamp, level, message, ...meta } = info;
    let out = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length && !meta.stack) {
      // Ignorar objetos vacios
      const cleanMeta = { ...meta };
      delete cleanMeta.service;
      delete cleanMeta.timestamp;
      if (Object.keys(cleanMeta).length) {
         out += ` \n${JSON.stringify(cleanMeta, null, 2)}`;
      }
    }
    if (meta.stack) out += `\n${meta.stack}`;
    return out;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: { service: "orbia-backend" },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === "production" ? jsonFormat : consoleFormat,
    }),
  ],
});

/**
 * Registra eventos de seguridad o alta criticidad.
 */
export function logSecurity(event: string, context: Record<string, any>) {
  logger.warn(`Security Event: ${event}`, { security: true, ...context });
}
