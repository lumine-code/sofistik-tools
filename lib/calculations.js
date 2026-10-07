const { BufferedProcess } = require("lumine");
const path = require("node:path");
const fs = require("node:fs");
const { editorContext } = require("./command-context");
const { documentStructure, nearestDirective, programHeaders } = require("./document-structure");

function onlyChildren(text) {
  return /^@[ \t]+only-children\b/im.test(text);
}

function unchanged(context) {
  const { editor, filePath, snapshot } = context;
  return (
    !!editor &&
    !editor.isDestroyed() &&
    editor.getPath() === filePath &&
    editor.getText() === snapshot
  );
}

module.exports = {
  async saveCalculationSource(context, active = () => this.isActive()) {
    if (!active() || !unchanged(context)) return false;
    await context.editor.save();
    if (!active()) return false;
    if (!unchanged(context) || context.editor.getBuffer().getFileState() !== "unmodified") {
      lumine.notifications.addWarning(
        "This program changed while saving. Refresh the action before running it.",
      );
      return false;
    }
    return true;
  },

  async runCalc(parser, parameters = [], version) {
    const context = this.context || editorContext(this.getEditor());
    if (!context.filePath) {
      if (context.editor)
        lumine.notifications.addWarning("Save this file before running a SOFiSTiK calculation.");
      return;
    }
    const operation = this.context ? this : this.operation(context);
    const sources = onlyChildren(context.snapshot) ? [] : [context.filePath];
    for (const match of context.snapshot.matchAll(/^@[ \t]+child:(.+)$/gim)) {
      sources.push(path.resolve(path.dirname(context.filePath), match[1].trim()));
    }
    const uniqueSources = [...new Set(sources)];
    // Every child keeps its own adjacent definition; freeze those identities
    // before saving any editor, including open child buffers.
    const tasks = uniqueSources.map((filePath) => ({
      filePath,
      environment: operation.resolveEnvironment(version, filePath, context.editor),
      source: filePath === context.filePath ? context : null,
    }));
    for (const task of tasks) {
      if (!task.source) {
        const editor = lumine.workspace
          .getTextEditors()
          .find((candidate) => candidate.getPath() === task.filePath);
        if (editor) task.source = editorContext(editor);
      }
    }
    if (!(await operation.saveCalculationSource(context))) return;
    for (const task of tasks) {
      if (!operation.isActive()) return;
      if (
        task.source &&
        task.source !== context &&
        !(await operation.saveCalculationSource(task.source))
      )
        return;
    }
    if (!unchanged(context) || tasks.some((task) => task.source && !unchanged(task.source))) {
      lumine.notifications.addWarning(
        "A calculation source changed while saving the other files. Run the action again.",
      );
      return;
    }
    for (const task of tasks) {
      if (!operation.isActive()) return;
      if (!fs.existsSync(task.filePath)) {
        operation.reportMissingFile(task.filePath);
        continue;
      }
      const command = operation.getApplicationPath(`${parser}.exe`, task.environment);
      if (!command) continue;
      operation.createCalculationProcess({
        command,
        args: [task.filePath, ...parameters],
        options: { cwd: path.dirname(task.filePath) },
      });
    }
  },

  async runCalcCurrentNow(parser, version) {
    const context = this.context || editorContext(this.getEditor());
    if (!context.editor) return;
    if (!context.filePath) {
      lumine.notifications.addWarning("Save this file before running a SOFiSTiK program.");
      return;
    }
    if (onlyChildren(context.snapshot)) {
      lumine.notifications.addWarning("Cannot run a program in a file declaring @ only-children.");
      return;
    }
    const operation = this.context ? this : this.operation(context);
    const environment = operation.resolveEnvironment(version, context.filePath, context.editor);
    const mode = context.editor.getBuffer().getLanguageMode();
    await mode.ready;
    await mode.atTransactionEnd?.();
    if (!operation.isActive() || !unchanged(context)) return;
    const directives = documentStructure(context.editor, context.snapshot).filter((directive) =>
      ["PROG", "SYS", "APPLY"].includes(directive.kind),
    );
    const directive = nearestDirective(directives, context.position);
    if (!directive) {
      lumine.notifications.addWarning("No calculation directive above the cursor.");
      return;
    }
    if (!directive.active) {
      lumine.notifications.addWarning("Enable this SOFiSTiK directive before running it.");
      return;
    }
    if (directives.filter((item) => item.row === directive.row).length > 1) {
      lumine.notifications.addWarning(
        "Separate calculation directives onto different lines before running one.",
      );
      return;
    }
    if (!(await operation.saveCalculationSource(context))) return;
    const command = operation.getApplicationPath(`${parser}.exe`, environment);
    if (!command) return;
    return operation.createCalculationProcess({
      command,
      args: [context.filePath, `-run:${directive.row + 1}`, "-e"],
      options: { cwd: path.dirname(context.filePath) },
    });
  },

  async runProgramAt(editor, row, snapshot, filePath) {
    const provider = this.owner.codeLensProvider;
    const revision = provider?.revision;
    const active = () =>
      this.isActive() && provider?.enabledFor(editor) && provider.revision === revision;
    if (!active()) return;
    if (!filePath) {
      lumine.notifications.addWarning("Save this file before running a SOFiSTiK program.");
      return;
    }
    const context = editorContext(editor, Object.freeze([row, 0]));
    if (
      context.snapshot !== snapshot ||
      context.filePath !== filePath ||
      !programHeaders(editor, snapshot).some((header) => header.row === row)
    ) {
      lumine.notifications.addWarning(
        "This program changed. Wait for Code Lens to refresh before running it.",
      );
      return;
    }
    if (onlyChildren(snapshot)) {
      lumine.notifications.addWarning("Cannot run a program in a file declaring @ only-children.");
      return;
    }
    const operation = this.operation(context);
    const environment = operation.resolveEnvironment(null, filePath, editor);
    if (!(await operation.saveCalculationSource(context, active))) return;
    const command = operation.getApplicationPath("wps.exe", environment);
    if (!command) return;
    return operation.createCalculationProcess({
      command,
      args: [filePath, `-run:${row + 1}`, "-e"],
      options: { cwd: path.dirname(filePath) },
    });
  },

  createCalculationProcess(options) {
    return new BufferedProcess(options);
  },
};
