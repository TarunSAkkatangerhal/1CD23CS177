const fs = require("fs");
const path = require("path");

const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logFile = path.join(logDir, "app.log");

function getTimestamp() {
  return new Date().toISOString();
}

function writeLog(level, service, message, meta = {}) {
  const entry = JSON.stringify({
    timestamp: getTimestamp(),
    level,
    service,
    message,
    ...meta,
  });
  fs.appendFileSync(logFile, entry + "\n");
}

const logger = {
  info: (service, message, meta) => writeLog("INFO", service, message, meta),
  error: (service, message, meta) => writeLog("ERROR", service, message, meta),
  warn: (service, message, meta) => writeLog("WARN", service, message, meta),
  debug: (service, message, meta) => writeLog("DEBUG", service, message, meta),
};

// Express middleware
function requestLogger(serviceName) {
  return (req, res, next) => {
    const start = Date.now();
    logger.info(serviceName, `Incoming ${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      ip: req.ip,
    });
    res.on("finish", () => {
      logger.info(serviceName, `Response sent`, {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration_ms: Date.now() - start,
      });
    });
    next();
  };
}

module.exports = { logger, requestLogger };