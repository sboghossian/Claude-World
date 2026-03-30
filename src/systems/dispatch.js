"use strict";

const { ProviderError } = require("./providers/base");

/**
 * DispatchManager — routes AI tasks to registered provider adapters.
 * Runs exclusively in the Electron main process.
 */
class DispatchManager {
  /**
   * @param {import('../../electron/key-store')} keyStore
   * @param {object} db  Database wrapper (raw better-sqlite3 or the app's Database class)
   */
  constructor(keyStore, db) {
    this.keyStore = keyStore;
    this.db = db;
    /** @type {Map<string, import('./providers/base').ProviderAdapter>} */
    this._providers = new Map();
    /** @type {string|null} */
    this._defaultProvider = null;
  }

  // ── Provider registration ───────────────────────────────────────────

  /**
   * Register a provider adapter.  The first provider registered
   * becomes the default unless changed explicitly.
   *
   * @param {string} name
   * @param {import('./providers/base').ProviderAdapter} adapter
   */
  registerProvider(name, adapter) {
    this._providers.set(name, adapter);
    if (!this._defaultProvider) {
      this._defaultProvider = name;
    }
    console.log(`[dispatch] Registered provider: ${name}`);
  }

  /**
   * Set the default provider by name.
   * @param {string} name
   */
  setDefaultProvider(name) {
    if (!this._providers.has(name)) {
      throw new Error(`Provider "${name}" is not registered`);
    }
    this._defaultProvider = name;
  }

  // ── Provider queries ────────────────────────────────────────────────

  /**
   * List all registered providers with their configuration status.
   * @returns {Array<{name: string, configured: boolean, defaultModel: string, isDefault: boolean}>}
   */
  listProviders() {
    const result = [];
    for (const [name, adapter] of this._providers) {
      result.push({
        name,
        configured: adapter.isConfigured(),
        defaultModel: adapter.getDefaultModel(),
        isDefault: name === this._defaultProvider,
      });
    }
    return result;
  }

  /**
   * Ping a specific provider.
   * @param {string} providerName
   * @returns {Promise<{ok: boolean, latencyMs: number, error?: string}>}
   */
  async ping(providerName) {
    const adapter = this._providers.get(providerName);
    if (!adapter) {
      return {
        ok: false,
        latencyMs: 0,
        error: `Unknown provider "${providerName}"`,
      };
    }
    if (!adapter.isConfigured()) {
      return {
        ok: false,
        latencyMs: 0,
        error: `No API key configured for "${providerName}"`,
      };
    }
    return adapter.ping();
  }

  // ── Dispatch (non-streaming) ────────────────────────────────────────

  /**
   * Dispatch a task to the best available provider and return the full response.
   *
   * @param {object} task
   * @param {string}        task.worldId
   * @param {string}        [task.zoneId]
   * @param {string}        [task.agentId]
   * @param {string|null}   [task.provider]     null = auto-select
   * @param {string|null}   [task.model]        null = provider default
   * @param {Array}         task.messages       [{role, content}]
   * @param {string|null}   [task.systemPrompt]
   * @param {number}        [task.maxTokens]    default 4096
   * @returns {Promise<object>} response object
   */
  async dispatch(task) {
    const { adapter, providerName } = this._resolveProvider(task.provider);
    const model = task.model || adapter.getDefaultModel();
    const maxTokens = task.maxTokens || 4096;

    const start = Date.now();
    const result = await adapter.complete(task.messages, {
      model,
      systemPrompt: task.systemPrompt || null,
      maxTokens,
    });
    const latencyMs = Date.now() - start;

    const costUsd = adapter.calculateCost(
      result.inputTokens,
      result.outputTokens,
      result.model,
    );

    // Record spending in key store
    this._recordCost(providerName, costUsd);

    return {
      text: result.text,
      provider: providerName,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      latencyMs,
    };
  }

  // ── Dispatch (streaming) ────────────────────────────────────────────

  /**
   * Stream a task response.  Yields objects:
   *   { type: 'text', text: '...' }
   *   { type: 'done', provider, model, inputTokens, outputTokens, costUsd, latencyMs }
   *
   * @param {object} task  same shape as dispatch()
   * @yields {object}
   */
  async *stream(task) {
    const { adapter, providerName } = this._resolveProvider(task.provider);
    const model = task.model || adapter.getDefaultModel();
    const maxTokens = task.maxTokens || 4096;

    const start = Date.now();

    for await (const chunk of adapter.stream(task.messages, {
      model,
      systemPrompt: task.systemPrompt || null,
      maxTokens,
    })) {
      if (chunk.type === "text") {
        yield chunk;
      } else if (chunk.type === "done") {
        const latencyMs = Date.now() - start;
        const costUsd = adapter.calculateCost(
          chunk.inputTokens,
          chunk.outputTokens,
          chunk.model,
        );

        this._recordCost(providerName, costUsd);

        yield {
          type: "done",
          provider: providerName,
          model: chunk.model,
          inputTokens: chunk.inputTokens,
          outputTokens: chunk.outputTokens,
          costUsd,
          latencyMs,
        };
      }
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /**
   * Resolve which provider adapter to use for a request.
   * @param {string|null|undefined} requested
   * @returns {{adapter: import('./providers/base').ProviderAdapter, providerName: string}}
   */
  _resolveProvider(requested) {
    const providerName = requested || this._defaultProvider;
    if (!providerName) {
      throw new ProviderError("dispatch", "No providers registered");
    }
    const adapter = this._providers.get(providerName);
    if (!adapter) {
      throw new ProviderError("dispatch", `Unknown provider "${providerName}"`);
    }
    if (!adapter.isConfigured()) {
      throw new ProviderError(
        providerName,
        `No API key configured for "${providerName}". Add one in Settings > API Keys.`,
      );
    }
    return { adapter, providerName };
  }

  /**
   * Record cost in key store and log it.
   * @param {string} provider
   * @param {number} costUsd
   */
  _recordCost(provider, costUsd) {
    if (costUsd > 0 && this.keyStore) {
      try {
        this.keyStore.recordSpend(provider, costUsd);
      } catch (err) {
        console.warn(
          `[dispatch] Failed to record spend for ${provider}:`,
          err.message,
        );
      }
    }
  }
}

module.exports = DispatchManager;
