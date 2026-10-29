const { currentSource, sourceMatches } = require("./source-snapshot");
const { collect } = require("./source-traversal");
const { scanManualDestination } = require("./source-metadata");
const path = require("node:path");
const { syntaxUnavailable } = require("./syntax-availability");
const fs = require("node:fs");
const { suffixForLanguage, otherSuffix } = require("./manuals");
const { documentStructure, nearestDirective, includeModule } = require("./document-structure");

module.exports = {
  async currentHelp(mode, version) {
    if (this.isActive?.() === false || this.context?.isSourceCurrent?.() === false) return;
    const editor = this.getEditor();
    if (!editor || syntaxUnavailable(editor)) return;
    const position = this.context?.position || editor.getCursorBufferPosition().toArray();
    const source = this.context?.snapshot ?? currentSource(editor);
    if (!sourceMatches(editor, source)) return;
    let structure = documentStructure(editor, source);
    if (structure?.then) structure = await structure;
    if (
      !structure ||
      this.isActive?.() === false ||
      this.context?.isSourceCurrent?.() === false ||
      editor.isDestroyed() ||
      !sourceMatches(editor, source)
    )
      return;
    const directive = nearestDirective(structure, position, ["PROG", "SYS", "APPLY"]);
    const module = directive
      ? directive.kind === "PROG" && directive.module
      : includeModule(editor);
    if (!module) {
      lumine.notifications.addWarning("No applicable SOFiSTiK module above the cursor");
      return;
    }
    const environment = this.resolveEnvironment(version, editor.getPath(), editor);
    const sofPath = this.getSofPath(version, editor.getPath(), editor);
    if (!sofPath) return;
    const prog = module.toUpperCase();
    const start = directive?.range[0] || [0, 0];
    const name = { WING: "wingraf", RESULTS: "resultviewer" }[prog] || prog.toLowerCase();
    const filePath = [
      `${name}${suffixForLanguage(environment.language)}.pdf`,
      `${name}.pdf`,
      `${name}${otherSuffix(environment.language)}.pdf`,
    ]
      .map((fileName) => path.join(sofPath, fileName))
      .find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      lumine.notifications.addWarning(`Cannot find the manual for program "${prog}"`);
      return;
    }
    return this.inViewer(
      { range: { start } },
      [start, position],
      filePath,
      prog,
      mode === 1,
      editor,
      environment,
    );
  },

  /**
   * Open or reuse a PDF view for SOFiSTiK help
   * @param {string} filePath - Path to the PDF file
   * @param {string} dest - Named destination whose page to open at the top
   * @param {boolean} reuse - If true, reuse existing SOFiSTiK viewer
   */
  async getViewer(filePath, dest, reuse) {
    const service = this.pdfViewService;
    if (!service?.open) throw new Error("The PDF view service is not available.");
    return service.open(filePath, {
      tag: "SOFiSTiK",
      reuse,
      dest,
      destinationMode: "page",
      split: "right",
      activatePane: false,
      ...(this.abortController?.signal ? { signal: this.abortController.signal } : {}),
    });
  },

  /**
   * Open help in PDF view, finding the command at cursor
   * @param {Object} object - Scan result object
   * @param {Array} range - Buffer range
   * @param {string} filePath - Path to the PDF file
   * @param {string} prog - Program/module name
   * @param {boolean} reuse - If true, reuse existing SOFiSTiK viewer
   */
  async inViewer(
    object,
    range,
    filePath,
    prog,
    reuse,
    editor = this.getEditor(),
    environment = this.resolveEnvironment(null, editor.getPath(), editor),
  ) {
    // The command nearest above the cursor within this module's scope selects
    // the destination whose page the PDF service opens at the top.
    let dest = null;
    const keywordContext = this.keywordContext(environment);
    const commands = keywordContext?.getModuleCommands(prog) || [];
    if (commands.length && editor.getBuffer().getLanguageMode().asynchronousSyntax) {
      const result = await editor.analyzeSyntax(
        require.resolve("./document-structure"),
        "manualDestination",
        { commands, range: [object.range.start, range[1]] },
      );
      if (!result || this.isActive?.() === false || editor.isDestroyed()) return;
      return this.getViewer(filePath, result.destination, reuse);
    }
    if (commands.length > 0) {
      const source = currentSource(editor);
      const buffer = editor.getBuffer(),
        mode = buffer.getLanguageMode(),
        revision = buffer.getTextRevision();
      const records = await collect(
        scanManualDestination(editor, source, commands, [object.range.start, range[1]]),
        source,
        {
          isCurrent: () =>
            !editor.isDestroyed() &&
            this.isActive?.() !== false &&
            !syntaxUnavailable(editor) &&
            buffer.getLanguageMode() === mode &&
            buffer.getTextRevision() === revision,
        },
      );
      if (!records) return;
      dest = records.at(-1) ?? null;
    }

    return this.getViewer(filePath, dest, reuse);
  },
};
