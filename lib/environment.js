const fs = require("node:fs");
const path = require("node:path");

/**
 * Resolves where SOFiSTiK is installed and which release applies to a file.
 *
 * The installation folder is configuration this package owns, because this is
 * the package that launches the installed programs. The release comes from the
 * `sofistik.keywords` service, so tooling and autocomplete can never disagree
 * about which version is in play — but a caller that has already chosen one
 * says so and detection is skipped entirely.
 */
class SofistikEnvironmentProvider {
  constructor(options = {}) {
    // Read at call time, not at construction: this package provides the
    // environment service the moment it activates, which may be before the
    // keywords service it consumes has arrived.
    this.keywords = options.keywords || (() => null);
    this.config = options.config || (() => lumine.config);
    this.exists = options.exists || ((candidate) => fs.existsSync(candidate));
    this.defaultVersion = options.defaultVersion || "2026";
  }

  /**
   * The configured SOFiSTiK installation folder, the one holding the version
   * directories. Empty when it has not been configured.
   * @returns {string}
   */
  getRoot() {
    const root = this.config().get("sofistik-tools.envPath");
    return typeof root === "string" ? root.trim() : "";
  }

  /**
   * The release that applies, either the one asked for or the one detected.
   * @param {{editor?: object, filePath?: string, version?: string}} context
   * @returns {string}
   */
  getVersion(context = {}) {
    const { editor = null, filePath = null, version = null } = context;
    const keywords = this.keywords();
    if (!keywords) {
      // Without the language package there is nothing to detect with, so the
      // only release available is one the caller named.
      const asked = version === null || version === undefined ? "" : String(version).trim();
      return asked && asked.toLowerCase() !== "auto" ? asked : this.defaultVersion;
    }
    return String(keywords.withContext(editor, filePath, version).getVersion());
  }

  /**
   * Resolve the installation for a file or editor.
   * @param {{editor?: object, filePath?: string, version?: string}} context
   * @returns {{version: string, root: string, installPath: string, installed: boolean}}
   */
  resolve(context = {}) {
    const version = this.getVersion(context);
    const root = this.getRoot();
    if (!root) return { version, root: "", installPath: "", installed: false };
    const installPath = path.join(root, version, `SOFiSTiK ${version}`);
    return { version, root, installPath, installed: this.exists(installPath) };
  }
}

module.exports = { SofistikEnvironmentProvider };
