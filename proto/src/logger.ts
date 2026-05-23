export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  assert: (condition: boolean, message: string, ...args: unknown[]) => void;
}

// Colors for prefix and unique scopes
const PREFIX_COLOR = "color:#A991E3"; // purple for [ciderjams:
const SCOPE_COLORS = [
  "#2d8cf0", // blue
  "#e65145", // red
  "#f6c411", // yellow
  "#43cf81", // green
  "#cf43b0", // magenta
  "#cf9143", // orange
  "#43b9cf", // teal
  "#6c43cf", // purple
];

// Simple hash to pick color based on scope name
function pickScopeColor(scope: string | undefined): string {
  if (!scope) return "#888";
  let hash = 0;
  for (let i = 0; i < scope.length; i++) {
    hash = (hash << 5) - hash + scope.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const idx = Math.abs(hash) % SCOPE_COLORS.length;
  return SCOPE_COLORS[idx];
}

function hasConsoleColors() {
  //@ts-expect-error - window is not defined in Node
  return typeof window !== "undefined" || process?.stdout?.isTTY;
}

export function createLogger(project: string, scope?: string): Logger {
  const base = "[ciderjams:";
  const scopePart = project + (scope ? `:${scope}` : "");
  const close = "]";

  const scopeColor = pickScopeColor(scopePart);

  function formatArgs(args: unknown[]) {
    if (hasConsoleColors()) {
      return [
        `%c${base}%c${scopePart}%c${close}`,
        PREFIX_COLOR,
        `color:${scopeColor}`,
        PREFIX_COLOR,
        ...args,
      ];
    }
    return [base + scopePart + close, ...args];
  }

  return {
    log: (...args) => console.log(...formatArgs(args)),
    info: (...args) => console.info(...formatArgs(args)),
    warn: (...args) => console.warn(...formatArgs(args)),
    error: (...args) => console.error(...formatArgs(args)),
    debug: (...args) => console.debug(...formatArgs(args)),
    assert: (condition: boolean, message: string, ...args: unknown[]) => {
      if (!condition) {
        console.error(...formatArgs([`Assertion failed: ${message}`, ...args]));
      }
    },
  };
}
