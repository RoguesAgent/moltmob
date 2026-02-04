// ── Rate Limiter ──
// Sliding window rate limiter matching Moltbook behavior.
// Can be toggled on/off per-instance for fast testing vs realistic simulation.

import { RateLimitConfig, RateLimitRule, RateLimitState, ErrorResponse } from './types';

type EndpointKey = keyof RateLimitConfig['limits'];

export class RateLimiter {
  private config: RateLimitConfig;
  // Per-agent, per-endpoint state
  private state: Map<string, Map<EndpointKey, RateLimitState>> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /** Check if a request is allowed. Returns null if OK, ErrorResponse if rate limited. */
  check(agentId: string, endpoint: EndpointKey, now?: number): ErrorResponse | null {
    if (!this.config.enabled) return null;

    const rule = this.config.limits[endpoint];
    if (!rule || rule.max_requests === Infinity) return null;

    const currentTime = now ?? Date.now();
    const agentState = this.getAgentState(agentId);
    const endpointState = this.getEndpointState(agentState, endpoint);

    // Prune timestamps outside window
    const windowStart = currentTime - rule.window_ms;
    endpointState.timestamps = endpointState.timestamps.filter((t) => t > windowStart);

    if (endpointState.timestamps.length >= rule.max_requests) {
      // Calculate retry_after from oldest timestamp in window
      const oldestInWindow = endpointState.timestamps[0];
      const retryAfter = oldestInWindow + rule.window_ms - currentTime;

      return {
        success: false,
        error: `Rate limit exceeded for ${endpoint}. ${endpointState.timestamps.length}/${rule.max_requests} requests in ${rule.window_ms}ms window.`,
        code: 429,
        retry_after_ms: Math.max(0, retryAfter),
      };
    }

    return null;
  }

  /** Record a request (call after check passes). */
  record(agentId: string, endpoint: EndpointKey, now?: number): void {
    if (!this.config.enabled) return;

    const currentTime = now ?? Date.now();
    const agentState = this.getAgentState(agentId);
    const endpointState = this.getEndpointState(agentState, endpoint);
    endpointState.timestamps.push(currentTime);
  }

  /** Check and record in one call. Returns null if OK, ErrorResponse if blocked. */
  consume(agentId: string, endpoint: EndpointKey, now?: number): ErrorResponse | null {
    const error = this.check(agentId, endpoint, now);
    if (error) return error;
    this.record(agentId, endpoint, now);
    return null;
  }

  /** Get remaining requests for an agent on an endpoint. */
  remaining(agentId: string, endpoint: EndpointKey, now?: number): number {
    if (!this.config.enabled) return Infinity;

    const rule = this.config.limits[endpoint];
    if (!rule || rule.max_requests === Infinity) return Infinity;

    const currentTime = now ?? Date.now();
    const agentState = this.getAgentState(agentId);
    const endpointState = this.getEndpointState(agentState, endpoint);

    const windowStart = currentTime - rule.window_ms;
    const activeCount = endpointState.timestamps.filter((t) => t > windowStart).length;

    return Math.max(0, rule.max_requests - activeCount);
  }

  /** Reset all state (useful between tests). */
  reset(): void {
    this.state.clear();
  }

  /** Reset state for a specific agent. */
  resetAgent(agentId: string): void {
    this.state.delete(agentId);
  }

  /** Swap config at runtime (toggle rate limits on/off). */
  setConfig(config: RateLimitConfig): void {
    this.config = config;
  }

  /** Get current config. */
  getConfig(): RateLimitConfig {
    return this.config;
  }

  /** Check if rate limiting is enabled. */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ── Private ──

  private getAgentState(agentId: string): Map<EndpointKey, RateLimitState> {
    let agentMap = this.state.get(agentId);
    if (!agentMap) {
      agentMap = new Map();
      this.state.set(agentId, agentMap);
    }
    return agentMap;
  }

  private getEndpointState(
    agentState: Map<EndpointKey, RateLimitState>,
    endpoint: EndpointKey
  ): RateLimitState {
    let state = agentState.get(endpoint);
    if (!state) {
      state = { timestamps: [] };
      agentState.set(endpoint, state);
    }
    return state;
  }
}
