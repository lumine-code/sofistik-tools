const path = require("node:path");
const fs = require("node:fs");
const { updateDefinition } = require("@lumine-code/sofistik-env");

module.exports = {
  getVersion(version, filePath, editor) {
    return this.resolveEnvironment(version, filePath, editor).version;
  },

  environmentContext(filePath, editor) {
    const requestedPath =
      filePath || (this.context ? this.context.filePath : (editor || this.getEditor())?.getPath());
    return requestedPath ? { filePath: path.resolve(requestedPath) } : { readDefinition: false };
  },

  resolveEnvironment(version, filePath, editor) {
    const context = this.environmentContext(filePath, editor);
    const key = context.filePath || null;
    const snapshot = this.environments?.get(key);
    if (snapshot && (!version || String(version) === snapshot.version)) return snapshot;
    const resolver = this.environmentProvider || this.ensureEnvironment();
    const resolved = resolver.resolve({
      ...context,
      ...(snapshot
        ? { language: snapshot.language, edition: snapshot.edition, readDefinition: false }
        : {}),
      version,
    });
    if (!version) this.environments?.set(key, resolved);
    return resolved;
  },

  getLanguage(filePath, editor) {
    return this.resolveEnvironment(null, filePath, editor).language;
  },

  getSofPath(version, filePath, editor) {
    const resolved = this.resolveEnvironment(version, filePath, editor);
    if (resolved.installed) return resolved.installPath;
    lumine.notifications.addError(
      `SOFiSTiK environment "${resolved.root}" version "${resolved.version}" is not available`,
    );
  },

  getApplicationPath(name, environment) {
    const command = this.ensureEnvironment().applicationPath(environment, name);
    if (command) return command;
    lumine.notifications.addWarning(
      `SOFiSTiK ${environment.version || "release"} does not provide ${name}.`,
    );
    return null;
  },

  setVersion(version, filePath = this.environmentContext().filePath) {
    if (!filePath) {
      lumine.notifications.addWarning("Save a file before choosing its SOFiSTiK release.");
      return;
    }
    const definitionPath = path.join(path.dirname(path.resolve(filePath)), "sofistik.def");
    let text;
    try {
      text = fs.readFileSync(definitionPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      text = "";
    }
    fs.writeFileSync(
      definitionPath,
      updateDefinition(text, {
        version: String(version).toLowerCase() === "auto" ? null : version,
      }),
      "utf8",
    );
    this.helpList.invalidate();
    this.exampleList.invalidate();
  },
};
