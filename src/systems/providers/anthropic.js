"use strict";

const Anthropic = require("@anthropic-ai/sdk");
const {
  ProviderAdapter,
  ProviderError,
  RateLimitError,
  AuthenticationError,
} = require("./base");

// ── Pricing (USD per 1 M tokens) ─────────────────────────────────────
const PRICING = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

class AnthropicAdapter extends ProviderAdapter {
  /**
   * @param {import('../../../electron/key-store')} keyStore
   */
  constructor(keyStore) {
    super("anthropic", keyStore);
  }

  /** Lazily create / return the SDK client. */
  _getClient() {
    if (!this._client) {
      const apiKey = this._getApiKey();
      this._client = new Anthropic({ apiKey });
    }
    return this._client;
  }

  /** Reset client so a new key is picked up next time. */
  _resetClient() {
    this._client = null;
  }

  getDefaultModel() {
    return DEFAULT_MODEL;
  }

  /**
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @param {string} model
   * @returns {number} USD
   */
  calculateCost(inputTokens, outputTokens, model) {
    const pricing = PRICING[model] || PRICING[DEFAULT_MODEL];
    return (
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output
    );
  }

  /**
   * Non-streaming completion.
   */
  async complete(messages, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const maxTokens = options.maxTokens || 4096;
    const client = this._getClient();

    const params = {
      model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (options.systemPrompt) {
      params.system = options.systemPrompt;
    }

    try {
      const response = await client.messages.create(params);

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Streaming completion -- yields text chunks.
   */
  async *stream(messages, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const maxTokens = options.maxTokens || 4096;
    const client = this._getClient();

    const params = {
      model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (options.systemPrompt) {
      params.system = options.systemPrompt;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let responseModel = model;

    try {
      const stream = client.messages.stream(params);

      for await (const event of stream) {
        if (event.type === "message_start" && event.message) {
          responseModel = event.message.model || model;
          if (event.message.usage) {
            inputTokens = event.message.usage.input_tokens || 0;
          }
        }
        if (event.type === "content_block_delta" && event.delta?.text) {
          yield { type: "text", text: event.delta.text };
        }
        if (event.type === "message_delta" && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
      }

      // Final metadata chunk
      yield {
        type: "done",
        model: responseModel,
        inputTokens,
        outputTokens,
      };
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Health check -- send a tiny request.
   */
  async ping() {
    const start = Date.now();
    try {
      const client = this._getClient();
      await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Map SDK errors to our typed errors.
   * @param {Error} err
   */
  _handleError(err) {
    // Reset client so stale state doesn't linger
    this._resetClient();

    const status = err.status || err.statusCode || null;

    if (status === 429) {
      const retryAfter = err.headers?.["retry-after"];
      throw new RateLimitError(
        "anthropic",
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
      );
    }
    if (status === 401) {
      throw new AuthenticationError("anthropic");
    }
    if (status === 400) {
      throw new ProviderError("anthropic", `Bad request: ${err.message}`, {
        status: 400,
        retryable: false,
      });
    }
    if (status === 500 || status === 502 || status === 503) {
      throw new ProviderError("anthropic", `Server error: ${err.message}`, {
        status,
        retryable: true,
      });
    }

    // Unknown / network errors
    throw new ProviderError("anthropic", err.message || "Unknown error", {
      status,
      retryable: false,
    });
  }
}

module.exports = AnthropicAdapter;
