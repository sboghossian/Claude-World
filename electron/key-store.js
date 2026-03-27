const { safeStorage } = require('electron');

class KeyStore {
  /**
   * Manages encrypted API key storage using Electron's safeStorage
   * and better-sqlite3 for persistence.
   *
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    if (!db) {
      throw new Error('KeyStore requires a database instance');
    }
    this.db = db;
    this._ensureTable();
  }

  /** Create the api_keys table if it does not exist */
  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        provider     TEXT PRIMARY KEY,
        encrypted_key BLOB NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        added_at     TEXT NOT NULL DEFAULT (datetime('now')),
        last_used    TEXT,
        total_spent  REAL NOT NULL DEFAULT 0.0,
        is_active    INTEGER NOT NULL DEFAULT 1
      )
    `);
  }

  /**
   * Store an API key (encrypted at rest via OS keychain).
   *
   * @param {string} provider   e.g. 'anthropic', 'openai', 'google'
   * @param {string} apiKey     the raw API key
   * @param {string} [displayName]
   */
  store(provider, apiKey, displayName) {
    if (!provider || typeof provider !== 'string') {
      throw new Error('provider must be a non-empty string');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('apiKey must be a non-empty string');
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS-level encryption is not available on this system. Cannot store API keys securely.'
      );
    }

    const encrypted = safeStorage.encryptString(apiKey);

    this.db
      .prepare(
        `INSERT OR REPLACE INTO api_keys (provider, encrypted_key, display_name, added_at, is_active)
         VALUES (?, ?, ?, datetime('now'), 1)`
      )
      .run(provider, encrypted, displayName || provider);
  }

  /**
   * Retrieve a decrypted API key for a provider.
   * Returns null if no active key is found.
   *
   * @param {string} provider
   * @returns {string|null}
   */
  get(provider) {
    const row = this.db
      .prepare('SELECT encrypted_key FROM api_keys WHERE provider = ? AND is_active = 1')
      .get(provider);

    if (!row) return null;

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS-level encryption is not available — cannot decrypt key');
    }

    // Update last_used timestamp
    this.db
      .prepare("UPDATE api_keys SET last_used = datetime('now') WHERE provider = ?")
      .run(provider);

    return safeStorage.decryptString(Buffer.from(row.encrypted_key));
  }

  /**
   * List all stored keys — returns metadata ONLY, never the raw key.
   *
   * @returns {Array<{provider: string, display_name: string, added_at: string, last_used: string|null, total_spent: number, is_active: number}>}
   */
  list() {
    return this.db
      .prepare(
        'SELECT provider, display_name, added_at, last_used, total_spent, is_active FROM api_keys ORDER BY provider'
      )
      .all();
  }

  /**
   * Delete a stored key.
   *
   * @param {string} provider
   */
  delete(provider) {
    if (!provider || typeof provider !== 'string') {
      throw new Error('provider must be a non-empty string');
    }
    const result = this.db
      .prepare('DELETE FROM api_keys WHERE provider = ?')
      .run(provider);

    if (result.changes === 0) {
      console.warn(`[key-store] No key found for provider "${provider}"`);
    }
  }

  /**
   * Record spending against a provider key.
   *
   * @param {string} provider
   * @param {number} amount  USD amount
   */
  recordSpend(provider, amount) {
    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('amount must be a non-negative number');
    }
    this.db
      .prepare('UPDATE api_keys SET total_spent = total_spent + ? WHERE provider = ?')
      .run(amount, provider);
  }

  /**
   * Deactivate a key without deleting it.
   *
   * @param {string} provider
   */
  deactivate(provider) {
    this.db
      .prepare('UPDATE api_keys SET is_active = 0 WHERE provider = ?')
      .run(provider);
  }

  /**
   * Reactivate a previously deactivated key.
   *
   * @param {string} provider
   */
  activate(provider) {
    this.db
      .prepare('UPDATE api_keys SET is_active = 1 WHERE provider = ?')
      .run(provider);
  }
}

module.exports = KeyStore;
