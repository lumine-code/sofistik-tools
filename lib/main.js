const { Disposable, CompositeDisposable, Point, BufferedProcess } = require("atom");
const { shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { findFiles } = require("./ripgrep");
const ExampleList = require("./example-list");
const HelpList = require("./help-list");
const VersionList = require("./version-list");
const TextView = require("./text-view");

/**
 * SOFiSTiK Tools Package
 * Provides integration with SOFiSTiK structural analysis software.
 * Supports calculation, help system, file cleaning, and external tool launching.
 */
module.exports = {
  /**
   * Activates the package and registers SOFiSTiK commands.
   */
  activate() {
    this.helpList = new HelpList(this);
    this.exampleList = new ExampleList(this);
    this.versionList = new VersionList();
    this.disposables = new CompositeDisposable();
    this.keywordsProvider = null;
    this.disposables.add(
      atom.commands.add('atom-text-editor[data-grammar="source sofistik"]', {
        "sofistik-tools:current-help": () => this.currentHelp(1),
        "sofistik-tools:separately-help": () => this.currentHelp(2),
        "sofistik-tools:calculation-wps": () => this.runCalc("wps"),
        "sofistik-tools:calculation-wps-immediately": () => this.runCalc("wps", "-run -e"),
        "sofistik-tools:calculation-wps-current": () => this.runCalcCurrentNow("wps"),
        "sofistik-tools:calculation-sps-immediately": () => this.runCalc("sps"),
        "sofistik-tools:export-plb-to-docx": () => this.exportPLB2DOCX(),
        "sofistik-tools:program-current-toggle": () => this.changeProg(),
        "sofistik-tools:program-all-toggle": () => this.changeProgs("all"),
        "sofistik-tools:program-all-on": () => this.changeProgs("all", "ON"),
        "sofistik-tools:program-all-off": () => this.changeProgs("all", "OFF"),
        "sofistik-tools:program-above-toggle": () => this.changeProgs("above"),
        "sofistik-tools:program-above-on": () => this.changeProgs("above", "ON"),
        "sofistik-tools:program-above-off": () => this.changeProgs("above", "OFF"),
        "sofistik-tools:program-below-toggle": () => this.changeProgs("below"),
        "sofistik-tools:program-below-on": () => this.changeProgs("below", "ON"),
        "sofistik-tools:program-below-off": () => this.changeProgs("below", "OFF"),
        "sofistik-tools:clear-urs-tags": () => this.cleanUrsTags(),
        "sofistik-tools:open-animator": () => this.editorOpenAnimator(),
        "sofistik-tools:open-animator-2018": () => this.editorOpenAnimator({ version: "2018" }),
        "sofistik-tools:open-report": () => this.editorOpenReport(),
        "sofistik-tools:save-report-as-pdf": () =>
          this.editorOpenReport({ parameters: ["-t", "-printto:PDF"] }),
        "sofistik-tools:save-pictures-as-pdf": () =>
          this.editorOpenReport({
            parameters: ["-g", "-picture:all", "-printto:PDF"],
          }),
        "sofistik-tools:open-protocol": () => this.editorOpenProtocol(),
        "sofistik-tools:open-viewer": () => this.editorOpenViewer(),
        "sofistik-tools:open-dbinfo": () => this.editorOpenDBNG(),
        "sofistik-tools:open-ssd": () => this.editorOpenSSD(),
        "sofistik-tools:open-wingraf": () => this.editorOpenWinGRAF(),
        "sofistik-tools:open-result-viewer": () => this.editorOpenResultViewer(),
        "sofistik-tools:open-teddy": () => this.editorOpenTeddy({ parameters: ["-0"] }),
        "sofistik-tools:open-teddy-single": () =>
          this.editorOpenTeddy({ parameters: ["-nosingle"] }),
        "sofistik-tools:open-teddy-1": () => this.editorOpenTeddy({ parameters: ["-1"] }),
        "sofistik-tools:open-teddy-2": () => this.editorOpenTeddy({ parameters: ["-2"] }),
        "sofistik-tools:open-teddy-3": () => this.editorOpenTeddy({ parameters: ["-3"] }),
        "sofistik-tools:open-teddy-4": () => this.editorOpenTeddy({ parameters: ["-4"] }),
        "sofistik-tools:open-sofiplus": () => this.editorOpenSOFiPLUS(),
        "sofistik-tools:export-cdb": () => this.editorOpenExportCDB(),
        "sofistik-tools:check-version": () => this.editorCheckVersion(),
      }),
      atom.commands.add("atom-workspace", {
        "sofistik-tools:ifc-export": () => this.ifcExport(),
        "sofistik-tools:ifc-import": () => this.ifcImport(),
        "sofistik-tools:open-cdbase.chm": () => this.openCHM(),
        "sofistik-tools:open-sof-daten": () => this.openSofistikDaten(),
      }),
      atom.commands.add(".tree-view", {
        "sofistik-tools:clean-glob": () => this.cleanCustomFilters(),
        "sofistik-tools:clean-1": () => this.cleanSelectedFolders("11"),
        "sofistik-tools:clean-1-recursively": () => this.cleanSelectedFolders("21"),
        "sofistik-tools:clean-2": () => this.cleanSelectedFolders("12"),
        "sofistik-tools:clean-2-recursively": () => this.cleanSelectedFolders("22"),
        "sofistik-tools:clean-3": () => this.cleanSelectedFolders("13"),
        "sofistik-tools:clean-3-recursively": () => this.cleanSelectedFolders("23"),
        "sofistik-tools:clean-4": () => this.cleanSelectedFolders("14"),
        "sofistik-tools:clean-4-recursively": () => this.cleanSelectedFolders("24"),
        "sofistik-tools:wing-fix": () => this.wingFixTreeS(),
        "sofistik-tools:wing-fix-recursively": () => this.wingFixTreeR(),
        "sofistik-tools:open-animator": () => this.treeOpenAnimator(),
        "sofistik-tools:open-animator-2018": () => this.treeOpenAnimator({ version: "2018" }),
        "sofistik-tools:open-report": () => this.treeOpenReport(),
        "sofistik-tools:save-report-as-pdf": () =>
          this.treeOpenReport({ parameters: ["-t", "-printto:PDF"] }),
        "sofistik-tools:save-pictures-as-pdf": () =>
          this.treeOpenReport({
            parameters: ["-g", "-picture:all", "-printto:PDF"],
          }),
        "sofistik-tools:open-protocol": () => this.treeOpenProtocol(),
        "sofistik-tools:open-viewer": () => this.treeOpenViewer(),
        "sofistik-tools:open-viewer-2025": () => this.treeOpenViewer({ version: "2025" }),
        "sofistik-tools:open-dbinfo": () => this.treeOpenDBNG(),
        "sofistik-tools:open-ssd": () => this.treeOpenSSD(),
        "sofistik-tools:open-wingraf": () => this.treeOpenWinGRAF(),
        "sofistik-tools:open-result-viewer": () => this.treeOpenResultViewer(),
        "sofistik-tools:open-teddy": () => this.treeOpenTeddy({ parameters: ["-0"] }),
        "sofistik-tools:open-teddy-single": () => this.treeOpenTeddy({ parameters: ["-nosingle"] }),
        "sofistik-tools:open-teddy-1": () => this.treeOpenTeddy({ parameters: ["-1"] }),
        "sofistik-tools:open-teddy-2": () => this.treeOpenTeddy({ parameters: ["-2"] }),
        "sofistik-tools:open-teddy-3": () => this.treeOpenTeddy({ parameters: ["-3"] }),
        "sofistik-tools:open-teddy-4": () => this.treeOpenTeddy({ parameters: ["-4"] }),
        "sofistik-tools:open-sofiplus": () => this.treeOpenSOFiPLUS(),
        "sofistik-tools:export-cdb": () => this.treeOpenExportCDB(),
        "sofistik-tools:check-version": () => this.treeCheckVersion(),
      }),
    );
    this.pdfViewService = null;
  },

  deactivate() {
    this.disposables.dispose();
    this.helpList.destroy();
    this.versionList.destroy();
  },

  consumeSofistikKeywords(service) {
    this.keywordsProvider = service.provider;
    return new Disposable(() => {
      this.keywordsProvider = null;
    });
  },

  consumePdfView(service) {
    this.pdfViewService = service;
    return new Disposable(() => {
      this.pdfViewService = null;
    });
  },

  getVersion(version, filePath, editor) {
    if (!version && this.keywordsProvider) {
      if (!editor) {
        editor = atom.workspace.getActiveTextEditor();
      }
      const ctx = this.keywordsProvider.withContext(editor, filePath);
      version = ctx.getVersion();
    }
    return version || "2026";
  },

  getSofPath(version, filePath, editor) {
    // TODO: scan dir for dat file, e.g. tree openers
    const envPath = atom.config.get("sofistik-tools.envPath");
    version = this.getVersion(version, filePath, editor);
    let sofPath = path.join(envPath, version, `SOFiSTiK ${version}`);
    if (fs.existsSync(sofPath)) {
      return sofPath;
    } else {
      atom.notifications.addError(
        `SOFiSTiK environment "${envPath}" version "${version}" is not available`,
      );
      return;
    }
  },

  async runCalc(parser, parameters = "", version) {
    let timeout = 0;
    const editor = atom.workspace.getActiveTextEditor();
    let editorPath = editor.getPath();
    if (!editorPath) {
      return;
    }
    let pathSrcs = [];
    let cmode = true;
    editor.scan(/^@ +only-children/gm, (item) => {
      cmode = false;
      item.stop();
    });
    if (cmode) {
      pathSrcs.push(editorPath);
    }
    editor.scan(/^@ child:(.+)$/gm, (item) => {
      timeout = 100;
      pathSrcs.push(path.join(path.dirname(editorPath), item.match[1].trim()));
    });
    editor.save(); // like teddy
    let sofPath = this.getSofPath(version, editorPath, editor);
    if (!sofPath) {
      return;
    }
    let parserPath = `${sofPath}\\${parser}.exe`;
    for (let pathSrc of pathSrcs) {
      if (!fs.existsSync(pathSrc)) {
        atom.notifications.addWarning(`File doesn't exists "${pathSrc.replace(/\\/g, "\\\\")}"`);
        continue;
      }
      new BufferedProcess({
        command: parserPath,
        args: [pathSrc, ...parameters.split(/\s+/).filter(Boolean)],
      });
      await new Promise((resolve) => setTimeout(resolve, timeout));
    }
  },

  runCalcCurrentNow(parser, version) {
    const editor = atom.workspace.getActiveTextEditor();
    let onlyChildren = false;
    editor.scan(/^@ +only-children/gm, (item) => {
      onlyChildren = true;
      item.stop();
    });
    if (onlyChildren) {
      atom.notifications.addInfo(
        "Cannot run current program, because `@ only-children` has been used",
      );
      return;
    }
    let pathSrc = editor.getPath();
    if (!pathSrc) {
      return;
    }
    editor.save();
    let range = [[0, 0], editor.getCursorBufferPosition()];
    let line;
    let sofPath = this.getSofPath(version, pathSrc, editor);
    if (!sofPath) {
      return;
    }
    editor.backwardsScanInBufferRange(/(?:prog|sys|apply|chapter) /gi, range, (object) => {
      line = object.range.start.row;
      new BufferedProcess({
        command: `${sofPath}\\${parser}.exe`,
        args: [pathSrc, `-run:${line + 1}`, "-e"],
      });
      object.stop();
      return;
    });
  },

  ifcExport(version) {
    const editor = atom.workspace.getActiveTextEditor();
    let sofPath = this.getSofPath(version, editor ? editor.getPath() : null, editor);
    if (!sofPath) {
      return;
    }
    new BufferedProcess({ command: `${sofPath}\\ifcexport_gui.exe` });
  },

  ifcImport(version) {
    const editor = atom.workspace.getActiveTextEditor();
    let sofPath = this.getSofPath(version, editor ? editor.getPath() : null, editor);
    if (!sofPath) {
      return;
    }
    new BufferedProcess({ command: `${sofPath}\\ifcimport_gui.exe` });
  },

  exportPLB2DOCX(version) {
    const editor = atom.workspace.getActiveTextEditor();
    let path0 = editor.getPath();
    let pathSrc = path0.replace(".dat", ".plb");
    let pathDst = path0.replace(".dat", ".docx");
    if (!fs.existsSync(pathSrc)) {
      atom.notifications.addWarning(`File doesn't exists "${pathSrc.replace(/\\/g, "\\\\")}"`);
      return;
    }
    let sofPath = this.getSofPath(version, path0, editor);
    if (!sofPath) {
      return;
    }
    new BufferedProcess({
      command: `${sofPath}\\plbdocx.exe`,
      args: ["-f", pathSrc, "-o", pathDst],
    });
  },

  openCHM(version) {
    const editor = atom.workspace.getActiveTextEditor();
    let sofPath = this.getSofPath(version, editor ? editor.getPath() : null, editor);
    if (!sofPath) {
      return;
    }
    shell.openPath(`${sofPath}\\cdbase.chm`);
  },

  openSofistikDaten(version) {
    const editor = atom.workspace.getActiveTextEditor();
    let sofPath = this.getSofPath(version, editor ? editor.getPath() : null, editor);
    if (!sofPath) {
      return;
    }
    let filePath = path.join(sofPath, "interfaces", "examples", "python", "sofistik_daten.py");
    if (!fs.existsSync(filePath)) {
      atom.notifications.addWarning(`File doesn't exist "${filePath.replace(/\\/g, "\\\\")}"`);
      return;
    }
    atom.workspace.open(filePath);
  },

  changeProg() {
    const editor = atom.workspace.getActiveTextEditor();
    let range = [[0, 0], editor.getCursorBufferPosition()];
    editor.backwardsScanInBufferRange(/[-+](?:prog|sys|apply) /i, range, (object) =>
      object.replace((object.matchText.charAt(0) === "-" ? "+" : "-") + object.matchText.substr(1)),
    );
  },

  changeProgs(range, mode) {
    const editor = atom.workspace.getActiveTextEditor();
    if (range === "above") {
      range = [[0, 0], editor.getCursorBufferPosition()];
    } else if (range === "below") {
      range = [editor.getCursorBufferPosition(), [editor.getLineCount(), 1e10]];
    } else if (range === "all") {
      range = [
        [0, 0],
        [editor.getLineCount(), 1e10],
      ];
    }
    if (!mode) {
      editor.scanInBufferRange(/[-+](?:prog|sys|apply) /gi, range, (object) =>
        object.replace(
          (object.matchText.charAt(0) === "-" ? "+" : "-") + object.matchText.substr(1),
        ),
      );
    } else if (mode === "ON") {
      editor.scanInBufferRange(/-(?:prog|sys|apply) /gi, range, (object) =>
        object.replace("+" + object.matchText.substr(1)),
      );
    } else if (mode === "OFF") {
      editor.scanInBufferRange(/\+(?:prog|sys|apply) /gi, range, (object) =>
        object.replace("-" + object.matchText.substr(1)),
      );
    }
  },

  wingFix(dirPaths, filter) {
    for (let dirPath of dirPaths) {
      if (!fs.statSync(dirPath).isDirectory()) {
        this.wingFixer(dirPath);
        continue;
      }
      findFiles(dirPath, filter).then((files) => {
        for (let file of files) {
          this.wingFixer(path.join(dirPath, file));
        }
      });
    }
  },

  wingFixer(filePath) {
    try {
      let data = fs.readFileSync(filePath, "utf8");
      data = data.replace(/ +MSCA \w+/gim, "");
      data = data.replace(/^AND (.*)(?<!MSCA .*)$/gim, "AND $1 MSCA NO");
      data = data.replace(/^ *DB/gim, "$ DB");
      fs.writeFileSync(filePath, data, { encoding: "utf8" });
    } catch {
      /* ignore */
    }
  },

  wingFixTreeS() {
    this.wingFix(this.treeView.selectedPaths(), "*.gra");
  },

  wingFixTreeR() {
    this.wingFix(this.treeView.selectedPaths(), "**/*.gra");
  },

  cleanUrsTags() {
    const editor = atom.workspace.getActiveTextEditor();
    editor.transact(() => {
      editor.scan(/(prog +.+) urs.+/gi, (object) => {
        object.replace(object.match[1]);
      });
    });
  },

  // ==== Open (Generic) ===== //

  runSOFiSTiK(prog, ext, filePath, props, prop2) {
    let args = [];
    let sofPath = this.getSofPath(props ? props.version : null, filePath);
    if (!sofPath) {
      return;
    }
    if (ext) {
      filePath = this.changeExtension(filePath, ext);
    }
    if (prop2 && prop2.existsCDB && !fs.existsSync(this.changeExtension(filePath, ".cdb"))) {
      atom.notifications.addWarning(`Database doesn't exists "${filePath.replace(/\\/g, "\\\\")}"`);
      return;
    }
    let exists = fs.existsSync(filePath);
    if (prop2 && prop2.existsSkip) {
      // always add, if not exists too, e.g. WinGRAF
      args.push(filePath);
    } else if (prop2 && prop2.existsOnly) {
      // only if exists, but do not raise error, e.g. SOFiPLUS
      if (exists) {
        args.push(filePath);
      }
    } else if (!exists) {
      // if not exists, then raise error (default)
      atom.notifications.addWarning(`File doesn't exists "${filePath.replace(/\\/g, "\\\\")}"`);
      return;
    } else {
      // if exists, then add filepath to args (default)
      args.push(filePath);
    }
    if (props && Object.hasOwn(props, "parameters")) {
      args.push(...props.parameters);
    }
    if (prop2 && Object.hasOwn(prop2, "parameters")) {
      args.push(...prop2.parameters);
    }
    return new BufferedProcess({
      command: path.join(sofPath, prog),
      args,
      options: { cwd: path.dirname(filePath) },
    });
  },

  openAnimator(filePath, props) {
    return this.runSOFiSTiK("animator.exe", ".cdb", filePath, props);
  },

  openReport(filePath, props) {
    return this.runSOFiSTiK("ursula.exe", ".plb", filePath, props);
  },

  openProtocol(filePath, props) {
    let sofPath = this.getSofPath(props ? props.version : null, filePath);
    if (!sofPath) {
      return;
    }
    filePath = this.changeExtension(filePath, ".prt");
    if (!fs.existsSync(filePath)) {
      atom.notifications.addWarning(`File doesn't exists "${filePath.replace(/\\/g, "\\\\")}"`);
      return;
    }
    return atom.workspace.open(filePath);
  },

  openViewer(filePath, props) {
    const version = parseInt(this.getVersion(props ? props.version : null, filePath));
    if (version >= 2024) {
      return this.runSOFiSTiK("viewer.exe", ".cdb", filePath, props);
    } else if (version >= 2020) {
      return this.runSOFiSTiK("fea_viewer.exe", ".cdb", filePath, props);
    } else {
      atom.notifications.addError(`Viewer is not available in SOFiSTiK ${version}`);
    }
  },

  openDBNG(filePath, props) {
    return this.runSOFiSTiK("dbinfo_ng.exe", ".cdb", filePath, props);
  },

  openSSD(filePath, props) {
    return this.runSOFiSTiK("ssd.exe", ".sofistik", filePath, props);
  },

  openWinGRAF(filePath, props) {
    return this.runSOFiSTiK("wingraf.exe", ".gra", filePath, props, {
      existsSkip: true,
    });
  },

  openResultViewer(filePath, props) {
    return this.runSOFiSTiK("resultviewer.exe", ".results", filePath, props, {
      existsOnly: true,
    });
  },

  openTeddy(filePath, props) {
    const ext = filePath.toLowerCase().endsWith(".gra") ? null : ".dat";
    return this.runSOFiSTiK("ted.exe", ext, filePath, props);
  },

  openSOFiPLUS(filePath, props) {
    return this.runSOFiSTiK("sofiplus_launcher.exe", ".dwg", filePath, props, {
      existsOnly: true,
    });
  },

  openExportCDB(filePath, props) {
    return this.runSOFiSTiK("export.exe", ".cdb", filePath, props);
  },

  // ==== Open (Editor) ===== //

  getEditorPath() {
    try {
      return atom.workspace.getActiveTextEditor().getPath();
    } catch {
      return;
    }
  },

  editorOpenAnimator(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openAnimator(editorPath, props);
  },

  editorOpenReport(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openReport(editorPath, props);
  },

  editorOpenProtocol(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openProtocol(editorPath, props);
  },

  editorOpenViewer(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openViewer(editorPath, props);
  },

  editorOpenDBNG(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openDBNG(editorPath, props);
  },

  editorOpenSSD(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openSSD(editorPath, props);
  },

  editorOpenWinGRAF(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openWinGRAF(editorPath, props);
  },

  editorOpenResultViewer(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openResultViewer(editorPath, props);
  },

  editorOpenTeddy(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    const editor = atom.workspace.getActiveTextEditor();
    if (!props) {
      props = {};
    }
    if (!props.parameters) {
      props.parameters = [];
    }
    props.parameters.push(editor.getCursorBufferPosition().row + 1);
    return this.openTeddy(editorPath, props);
  },

  editorOpenSOFiPLUS(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openSOFiPLUS(editorPath, props);
  },

  editorOpenExportCDB(props) {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    return this.openExportCDB(editorPath, props);
  },

  editorCheckVersion() {
    let editorPath = this.getEditorPath();
    if (!editorPath) {
      return;
    }
    const editor = atom.workspace.getActiveTextEditor();
    const version = this.getVersion(null, editorPath, editor);
    atom.notifications.addInfo(`SOFiSTiK version: ${version}`);
  },

  // ==== Open (Tree) ===== //

  consumeTreeViewSelection(treeView) {
    this.treeView = treeView;
    return new Disposable(() => {
      this.treeView = null;
    });
  },

  consumeOpenExternal(service) {
    this.openExternalDisposable = service.registerHandler({
      priority: 10,
      openExternal: (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
          case ".dat":
            return this.openTeddy(filePath) || true;
          case ".gra":
            return this.openWinGRAF(filePath) || true;
          case ".sofistik":
            return this.openSSD(filePath) || true;
          case ".cdb":
            return this.openAnimator(filePath) || true;
          case ".results":
            return this.openResultViewer(filePath) || true;
          case ".plb":
            return this.openReport(filePath) || true;
          case ".dwg": {
            const datPath = this.changeExtension(filePath, ".dat");
            if (fs.existsSync(datPath)) {
              return this.openSOFiPLUS(datPath) || true;
            }
          }
        }
      },
    });
    return new Disposable(() => {
      if (this.openExternalDisposable) {
        this.openExternalDisposable.dispose();
        this.openExternalDisposable = null;
      }
    });
  },

  getTreePaths() {
    if (!this.treeView) {
      return;
    }
    return this.treeView.selectedPaths();
  },

  treeOpenAnimator(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openAnimator(filePath, props));
  },

  treeOpenReport(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openReport(filePath, props));
  },

  treeOpenProtocol(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openProtocol(filePath, props));
  },

  treeOpenViewer(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openViewer(filePath, props));
  },

  treeOpenDBNG(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openDBNG(filePath, props));
  },

  treeOpenSSD(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openSSD(filePath, props));
  },

  treeOpenWinGRAF(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openWinGRAF(filePath, props));
  },

  treeOpenResultViewer(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openResultViewer(filePath, props));
  },

  treeOpenTeddy(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openTeddy(filePath, props));
  },

  treeOpenSOFiPLUS(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openSOFiPLUS(filePath, props));
  },

  treeOpenExportCDB(props) {
    let treePaths = this.getTreePaths();
    if (!treePaths) {
      return;
    }
    return treePaths.map((filePath) => this.openExportCDB(filePath, props));
  },

  treeCheckVersion() {
    let treePaths = this.getTreePaths();
    if (!treePaths || treePaths.length === 0) {
      return;
    }
    const filePath = treePaths[0];
    const version = this.getVersion(null, filePath, null);
    atom.notifications.addInfo(`SOFiSTiK version: ${version}`);
  },

  // ==== Cleaner ===== //

  parseFilter(filter) {
    // Ripgrep-style globs: `{a,b}` alternation replaces the old extglob `@(a|b)`.
    if (filter === "11") {
      return "*{.erg,.prt,.lst,.urs,.sdb,.db-2,.pl,.$*,.#*,.grb,.err,.error_positions,.dwl,.dwl2,.cfg}";
    } else if (filter === "21") {
      return "**/" + this.parseFilter("11");
    } else if (filter === "12") {
      return "*{.erg,.prt,.lst,.urs,.sdb,.db-2,.pl,.$*,.#*,.grb,.err,.error_positions,.dwl,.dwl2,.cfg,.cdi,.cde}";
    } else if (filter === "22") {
      return "**/" + this.parseFilter("12");
    } else if (filter === "13") {
      return "*{.erg,.prt,.lst,.urs,.sdb,.db-2,.pl,.$*,.#*,.grb,.err,.error_positions,.dwl,.dwl2,.sqlite,.cfg,.cdi,.cde,.cdb}";
    } else if (filter === "23") {
      return "**/" + this.parseFilter("13");
    } else if (filter === "14") {
      return "*{.erg,.prt,.lst,.urs,.sdb,.db-2,.pl,.$*,.#*,.grb,.err,.error_positions,.dwl,.dwl2,.sqlite,.cfg,.cdi,.cde,.cdb,.plb,.bak,_csm.dat,_csmlf.dat}";
    } else if (filter === "24") {
      return "**/" + this.parseFilter("14");
    } else {
      return filter;
    }
  },

  cleanByPaths(dirPaths, filter) {
    filter = this.parseFilter(filter);
    for (let dirPath of dirPaths) {
      if (!fs.statSync(dirPath).isDirectory()) {
        continue;
      }
      findFiles(dirPath, filter).then((files) => {
        for (let file of files) {
          let aPath = path.join(dirPath, file);
          try {
            fs.unlinkSync(aPath);
          } catch {
            /* ignore */
          }
        }
      });
    }
  },

  cleanSelectedFolders(filter) {
    this.cleanByPaths(this.treeView.selectedPaths(), filter);
  },

  cleanCustomFilters() {
    let textView = new TextView(
      "",
      false,
      false,
      "Enter the glob pattern to find the files to be deleted",
    );
    textView.attach((filter) => {
      this.cleanSelectedFolders(filter);
    });
  },

  // ==== Help ===== //

  currentHelp(mode, version) {
    const editor = atom.workspace.getActiveTextEditor();
    let range = [Point.ZERO, editor.getLastCursor().getCurrentWordBufferRange().end];
    let prog, pro2, lang, postLang, flag, filePath;
    let sofPath = this.getSofPath(version, editor.getPath(), editor);
    if (!sofPath) {
      return;
    }
    editor.backwardsScanInBufferRange(/^ *[+\-$]?prog +(\w+)/i, range, (object) => {
      prog = pro2 = object.match[1].toUpperCase();
      if (pro2.match(/wing/i)) {
        pro2 = "wingraf";
      } else if (pro2.match(/results/i)) {
        pro2 = "resultviewer";
      }
      lang = atom.config.get("language-sofistik.language");
      if (lang === "English") {
        postLang = "_1";
      } else if (lang === "German") {
        postLang = "_0";
      }
      if (fs.existsSync((filePath = path.join(sofPath, `${pro2}${postLang}.pdf`)))) {
        flag = true;
      } else if (fs.existsSync((filePath = path.join(sofPath, `${pro2}.pdf`)))) {
        flag = true;
      } else {
        flag = false;
      }
      if (flag) {
        if (mode === 1) {
          this.inViewer(object, range, filePath, prog, true);
        } else if (mode === 2) {
          this.inViewer(object, range, filePath, prog, false);
        }
      } else {
        atom.notifications.addWarning(`Cannot find the manual for program "${prog}"`);
      }
      object.stop();
    });
  },

  /**
   * Open or reuse a PDF viewer for SOFiSTiK help
   * @param {string} filePath - Path to the PDF file
   * @param {string} dest - Named destination to scroll to
   * @param {boolean} reuse - If true, reuse existing SOFiSTiK viewer
   */
  getViewer(filePath, dest, reuse) {
    const tag = "SOFiSTiK";

    // Use pdf-viewer service if available
    if (this.pdfViewService) {
      if (reuse) {
        // Try to find existing SOFiSTiK viewer
        const viewer = this.pdfViewService.getViewerByTag(tag);
        if (viewer) {
          if (viewer.getPath() === filePath) {
            // Same file, just scroll to destination
            if (dest) {
              this.pdfViewService.scrollToDestination(viewer, dest);
            }
          } else {
            // Different file, update viewer
            this.pdfViewService.setFile(viewer, filePath, dest, tag);
          }
          // Focus the viewer pane
          atom.workspace.open(viewer.getURI(), {
            searchAllPanes: true,
            activatePane: false,
          });
          return;
        }
      }
      // Open new viewer
      this.pdfViewService.open(filePath, {
        dest,
        tag: reuse ? tag : this.makeID(9),
        split: "right",
        activatePane: false,
      });
      return;
    }

    // Fallback: open PDF directly (will use system default or pdf-viewer opener)
    let hash = "";
    if (dest) {
      hash = `#nameddest=${dest}`;
    }
    atom.workspace.open(`${filePath}${hash}`, {
      split: "right",
      activatePane: false,
    });
  },

  /**
   * Open help in PDF viewer, finding the command at cursor
   * @param {Object} object - Scan result object
   * @param {Array} range - Buffer range
   * @param {string} filePath - Path to the PDF file
   * @param {string} prog - Program/module name
   * @param {boolean} reuse - If true, reuse existing SOFiSTiK viewer
   */
  inViewer(object, range, filePath, prog, reuse) {
    // If pdf-viewer service not available, open file directly
    if (!this.pdfViewService) {
      return atom.workspace.open(filePath, {
        split: "right",
        activatePane: false,
      });
    }

    // Try to find command at cursor position
    let foundCommand = false;
    const editor = atom.workspace.getActiveTextEditor();
    if (this.keywordsProvider) {
      const ctx = this.keywordsProvider.withContext(editor);
      const keywords = ctx.getKeywords();
      if (keywords && keywords[prog]) {
        const commands = Object.keys(keywords[prog]);
        if (commands.length > 0) {
          const regex = new RegExp("(?:^[ \\t]*|; *)(" + commands.join("|") + ")\\b", "i");
          const searchRange = [object.range.start, range[1]];
          editor.backwardsScanInBufferRange(regex, searchRange, (finder) => {
            this.getViewer(filePath, finder.match[1].toUpperCase(), reuse);
            foundCommand = true;
            finder.stop();
          });
        }
      }
    }

    // If no command found, open without destination
    if (!foundCommand) {
      this.getViewer(filePath, null, reuse);
    }
  },

  makeID(length) {
    var result = "";
    var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  },

  // ==== Tools ===== //

  changeExtension(filePath, ext) {
    if (!ext) {
      return filePath;
    }
    let dotIndex = filePath.lastIndexOf(".");
    let slsIndex = filePath.lastIndexOf("/");
    let slbIndex = filePath.lastIndexOf("\\");
    if (dotIndex < Math.max(slsIndex, slbIndex)) {
      return filePath + ext;
    } else {
      return filePath.substr(0, dotIndex) + ext;
    }
  },
};
