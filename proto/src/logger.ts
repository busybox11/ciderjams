/** Console-style logger with a fixed `[ciderjams:<project>]` prefix. */
export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export function createLogger(project: string): Logger {
  const p = `[ciderjams:${project}]`;
  return {
    log: (...args) => console.log(p, ...args),
    info: (...args) => console.info(p, ...args),
    warn: (...args) => console.warn(p, ...args),
    error: (...args) => console.error(p, ...args),
    debug: (...args) => console.debug(p, ...args),
  };
}
