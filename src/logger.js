const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const RESERVED = new Set(["timestamp", "level", "logger", "message"]);

export function createLogger({
  name = process.env.APP_NAME || "light-service",
  level = process.env.LOG_LEVEL || "INFO",
  stream = process.stdout,
} = {}) {
  const threshold = LEVELS[level.toUpperCase()] ?? LEVELS.INFO;

  function write(levelName, message, extra = {}) {
    if (LEVELS[levelName] < threshold) return;
    const entry = { timestamp: new Date().toISOString(), level: levelName, logger: name, message };
    for (const [key, value] of Object.entries(extra)) {
      if (!RESERVED.has(key)) entry[key] = value;
    }
    stream.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (message, extra) => write("DEBUG", message, extra),
    info: (message, extra) => write("INFO", message, extra),
    warn: (message, extra) => write("WARN", message, extra),
    error: (message, extra) => write("ERROR", message, extra),
  };
}
