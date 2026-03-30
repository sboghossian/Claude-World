"use strict";

const OpenAI = require("openai");
const {
  ProviderAdapter,
  ProviderError,
  RateLimitError,
  AuthenticationError,
} = require("./base");

// ── Pricing (USD per 1 M tokens) ─────────────────────────────────────
const PRICING = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const DEFAULT_MODEL = "gpt-4o";

class OpenAIAdapter extends ProviderAdapter {
  /**
   * @param {import('../../../electron/key-store')} keyStore
   */
  constructor(keyStore) {
    super("openai", keyStore);
  }

  /** Lazily create / return the SDK client. */
  _getClient() {
    if (!this._client) {
      const apiKey = this._getApiKey();
      this._client = new OpenAI({ apiKey });
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
   * Convert our generic messages to the OpenAI chat format,
   * optionally prepending a system message.
   */
  _buildChatMessages(messages, systemPrompt) {
    const chatMessages = [];
    if (systemPrompt) {
      chatMessages.push({ role: "system", content: systemPrompt });
    }
    for (const m of messages) {
      chatMessages.push({ role: m.role, content: m.content });
    }
    return chatMessages;
  }

  /**
   * Non-streaming completion.
   */
  async complete(messages, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const maxTokens = options.maxTokens || 4096;
    const client = this._getClient();

    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: this._buildChatMessages(messages, options.systemPrompt),
      });

      const choice = response.choices[0];
      const text = choice?.message?.content || "";
      const usage = response.usage || {};

      return {
        text,
        model: response.model || model,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
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

    let inputTokens = 0;
    let outputTokens = 0;
    let responseModel = model;

    try {
      const stream = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: this._buildChatMessages(messages, options.systemPrompt),
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        responseModel = chunk.model || model;

        // Usage arrives in the final chunk
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: "text", text: delta.content };
        }
      }

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
      await client.chat.completions.create({
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
    this._resetClient();

    const status = err.status || err.statusCode || null;

    if (status === 429) {
      const retryAfter = err.headers?.["retry-after"];
      throw new RateLimitError(
        "openai",
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
      );
    }
    if (status === 401) {
      throw new AuthenticationError("openai");
    }
    if (status === 400) {
      throw new ProviderError("openai", `Bad request: ${err.message}`, {
        status: 400,
        retryable: false,
      });
    }
    if (status === 500 || status === 502 || status === 503) {
      throw new ProviderError("openai", `Server error: ${err.message}`, {
        status,
        retryable: true,
      });
    }

    throw new ProviderError("openai", err.message || "Unknown error", {
      status,
      retryable: false,
    });
  }
}

module.exports = OpenAIAdapter;
