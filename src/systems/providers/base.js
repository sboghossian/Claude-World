"use strict";

/**
 * Abstract base class for AI provider adapters.
 * Each provider (Anthropic, OpenAI, etc.) extends this class
 * and implements the required methods.
 */
class ProviderAdapter {
  /**
   * @param {string} name       Provider identifier (e.g. 'anthropic', 'openai')
   * @param {import('../../../electron/key-store')} keyStore
   */
  constructor(name, keyStore) {
    if (new.target === ProviderAdapter) {
      throw new Error(
        "ProviderAdapter is abstract and cannot be instantiated directly",
      );
    }
    this.name = name;
    this.keyStore = keyStore;
    this._client = null;
  }

  /**
   * Check whether this provider has an active API key configured.
   * @returns {boolean}
   */
  isConfigured() {
    if (!this.keyStore) return false;
    const keys = this.keyStore.list();
    return keys.some((k) => k.provider === this.name && k.is_active);
  }

  /**
   * Retrieve the decrypted API key from the key store.
   * Throws if no key is configured.
   * @returns {string}
   */
  _getApiKey() {
    if (!this.keyStore) {
      throw new ProviderError(this.name, "Key store not available");
    }
    const key = this.keyStore.get(this.name);
    if (!key) {
      throw new ProviderError(
        this.name,
        `No API key configured for provider "${this.name}". Add one in Settings > API Keys.`,
      );
    }
    return key;
  }

  /**
   * Non-streaming completion.
   * @param {Array<{role: string, content: string}>} messages
   * @param {{model?: string, systemPrompt?: string, maxTokens?: number}} options
   * @returns {Promise<{text: string, model: string, inputTokens: number, outputTokens: number}>}
   */
  async complete(_messages, _options) {
    throw new Error(`${this.name}: complete() not implemented`);
  }

  /**
   * Streaming completion (async generator yielding text chunks).
   * @param {Array<{role: string, content: string}>} messages
   * @param {{model?: string, systemPrompt?: string, maxTokens?: number}} options
   * @yields {string} text chunks
   */
  async *stream(_messages, _options) {
    throw new Error(`${this.name}: stream() not implemented`);
  }

  /**
   * Calculate cost in USD given token counts and model.
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @param {string} model
   * @returns {number} cost in USD
   */
  calculateCost(_inputTokens, _outputTokens, _model) {
    throw new Error(`${this.name}: calculateCost() not implemented`);
  }

  /**
   * Health check -- send a minimal request to verify connectivity and key validity.
   * @returns {Promise<{ok: boolean, latencyMs: number, error?: string}>}
   */
  async ping() {
    throw new Error(`${this.name}: ping() not implemented`);
  }

  /**
   * Return the default model identifier for this provider.
   * @returns {string}
   */
  getDefaultModel() {
    throw new Error(`${this.name}: getDefaultModel() not implemented`);
  }
}

// ── Custom error types ────────────────────────────────────────────────

class ProviderError extends Error {
  /**
   * @param {string} provider
   * @param {string} message
   * @param {{status?: number, retryable?: boolean}} [meta]
   */
  constructor(provider, message, meta = {}) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = meta.status || null;
    this.retryable = meta.retryable || false;
  }
}

class RateLimitError extends ProviderError {
  /**
   * @param {string} provider
   * @param {number} [retryAfterMs]
   */
  constructor(provider, retryAfterMs) {
    super(provider, "Rate limit exceeded. Please wait before retrying.", {
      status: 429,
      retryable: true,
    });
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs || null;
  }
}

class AuthenticationError extends ProviderError {
  /** @param {string} provider */
  constructor(provider) {
    super(provider, "Invalid or expired API key. Check your key in Settings.", {
      status: 401,
      retryable: false,
    });
    this.name = "AuthenticationError";
  }
}

module.exports = {
  ProviderAdapter,
  ProviderError,
  RateLimitError,
  AuthenticationError,
};
