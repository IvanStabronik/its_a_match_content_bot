type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  [key: string]: unknown;
}

const SECRET_PATTERNS = [
  /bot\d{6,}:[A-Za-z0-9_-]{30,}/gi,
  /sk-[A-Za-z0-9]{20,}/gi,
  /CONTENT_BOT_TOKEN\s*=\s*\S+/gi,
  /OPENAI_API_KEY\s*=\s*\S+/gi,
];

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|key|password/i.test(k) && typeof v === 'string') {
        obj[k] = '[REDACTED]';
      } else {
        obj[k] = sanitize(v);
      }
    }
    return obj;
  }
  return value;
}

function write(level: LogLevel, module: string, message: string, extra?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message: sanitize(message) as string,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      entry[k] = sanitize(v);
    }
  }
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (module: string, message: string, extra?: Record<string, unknown>) =>
    write('debug', module, message, extra),
  info: (module: string, message: string, extra?: Record<string, unknown>) =>
    write('info', module, message, extra),
  warn: (module: string, message: string, extra?: Record<string, unknown>) =>
    write('warn', module, message, extra),
  error: (module: string, message: string, extra?: Record<string, unknown>) =>
    write('error', module, message, extra),
};
