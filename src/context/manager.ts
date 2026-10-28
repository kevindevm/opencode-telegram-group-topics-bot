import type { ContextInfo } from "../keyboard/types.js";

class ContextStateManager {
  private readonly contextByScope = new Map<string, ContextInfo>();

  update(tokensUsed: number, tokensLimit: number, scopeKey: string = "global"): void {
    // Never publish used > limit: at saturation the button must read 100%,
    // not 104% or a frozen older value.
    const clampedUsed =
      tokensLimit > 0 ? Math.min(Math.max(0, tokensUsed), tokensLimit) : Math.max(0, tokensUsed);
    this.contextByScope.set(scopeKey, { tokensUsed: clampedUsed, tokensLimit });
  }

  clear(scopeKey: string = "global"): void {
    this.contextByScope.delete(scopeKey);
  }

  get(scopeKey: string = "global"): ContextInfo | null {
    return this.contextByScope.get(scopeKey) ?? null;
  }
}

export const contextStateManager = new ContextStateManager();
