import { beforeEach, afterEach, vi } from "vitest";
import { ensureTestEnvironment } from "./helpers/test-environment.js";
import { resetSingletonState } from "./helpers/reset-singleton-state.js";

// Suite-wide budget: hooks and bodies touch real temp dirs and files,
// which stall under CI load and trip the default 5s/10s timeouts.
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

ensureTestEnvironment();

beforeEach(() => {
  ensureTestEnvironment();
  return resetSingletonState();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  ensureTestEnvironment();
  return resetSingletonState();
});
