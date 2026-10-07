const path = require("node:path");
const fs = require("node:fs");

module.exports = {
  openExternal(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const methods = {
      ".dat": "openTeddy",
      ".gra": "openWinGRAF",
      ".sofistik": "openSSD",
      ".cdb": "openAnimator",
      ".results": "openResultViewer",
      ".plb": "openReport",
    };
    if (methods[extension]) return this[methods[extension]](filePath) || true;
    if (extension === ".dwg" && fs.existsSync(this.changeExtension(filePath, ".dat")))
      return this.openSOFiPLUS(filePath) || true;
  },

  ifcExport(version) {
    const editor = this.getEditor();
    const environment = this.resolveEnvironment(version, editor?.getPath(), editor);
    const sofPath = environment.installPath;
    const command = this.getApplicationPath("ifcexport_gui.exe", environment);
    if (!command) return;
    return this.launchApplication(command, [], {
      cwd: editor?.getPath() ? path.dirname(editor.getPath()) : sofPath,
    });
  },

  ifcImport(version) {
    const editor = this.getEditor();
    const environment = this.resolveEnvironment(version, editor?.getPath(), editor);
    const sofPath = environment.installPath;
    const command = this.getApplicationPath("ifcimport_gui.exe", environment);
    if (!command) return;
    return this.launchApplication(command, [], {
      cwd: editor?.getPath() ? path.dirname(editor.getPath()) : sofPath,
    });
  },

  exportPLB2DOCX(version) {
    const editor = this.getEditor();
    const path0 = this.context?.filePath || editor?.getPath();
    if (!path0) {
      if (editor) lumine.notifications.addWarning("Save this file before exporting its report.");
      return;
    }
    const pathSrc = this.changeExtension(path0, ".plb");
    const pathDst = this.changeExtension(path0, ".docx");
    if (!fs.existsSync(pathSrc)) {
      lumine.notifications.addWarning(`File doesn't exists "${pathSrc.replace(/\\/g, "\\\\")}"`);
      return;
    }
    const command = this.getApplicationPath(
      "plbdocx.exe",
      this.resolveEnvironment(version, path0, editor),
    );
    if (!command) return;
    return this.launchApplication(command, ["-f", pathSrc, "-o", pathDst], {
      cwd: path.dirname(path0),
    });
  },

  openCHM(version) {
    const editor = this.getEditor();
    let sofPath = this.getSofPath(version, editor ? editor.getPath() : null, editor);
    if (!sofPath) {
      return;
    }
    return lumine.shell.openPath(path.join(sofPath, "cdbase.chm"));
  },

  openSofistikDaten(version) {
    const editor = this.getEditor();
    let sofPath = this.getSofPath(version, editor ? editor.getPath() : null, editor);
    if (!sofPath) {
      return;
    }
    let filePath = path.join(sofPath, "interfaces", "examples", "python", "sofistik_daten.py");
    if (!fs.existsSync(filePath)) {
      lumine.notifications.addWarning(`File doesn't exist "${filePath.replace(/\\/g, "\\\\")}"`);
      return;
    }
    lumine.workspace.open(filePath);
  },

  launchApplication(command, args = [], options = {}) {
    // Start GUI applications from the process that owns the editor window. A
    // renderer -> cmd.exe -> application launch can lose Windows' permission
    // to activate the new window.
    if (!this.isActive()) return;
    return lumine.shell.openApplication(command, args, options).catch((error) => {
      lumine.notifications.addWarning("Cannot open the SOFiSTiK application", {
        detail: `${command}\n\n${error.message}`,
      });
      // The external handler still owns this request. Falling through to the
      // system association would launch a second, possibly different app.
      return true;
    });
  },

  reportMissingFile(
    filePath,
    props,
    message = `File doesn't exists "${filePath.replace(/\\/g, "\\\\")}"`,
  ) {
    if (props?.onMissingFile) {
      props.onMissingFile(filePath);
      return;
    }
    lumine.notifications.addWarning(message);
  },

  runSOFiSTiK(prog, ext, filePath, props, prop2) {
    let args = [];
    const environment = props?.environment || this.resolveEnvironment(props?.version, filePath);
    const command = this.getApplicationPath(prog, environment);
    if (!command) return;
    if (ext) {
      filePath = this.changeExtension(filePath, ext);
    }
    if (prop2 && prop2.existsCDB && !fs.existsSync(this.changeExtension(filePath, ".cdb"))) {
      this.reportMissingFile(
        this.changeExtension(filePath, ".cdb"),
        props,
        `Database doesn't exists "${filePath.replace(/\\/g, "\\\\")}"`,
      );
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
      this.reportMissingFile(filePath, props);
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
    return this.launchApplication(command, args, { cwd: path.dirname(filePath) });
  },

  openAnimator(filePath, props) {
    return this.runSOFiSTiK("animator.exe", ".cdb", filePath, props);
  },

  openReport(filePath, props) {
    return this.runSOFiSTiK("ursula.exe", ".plb", filePath, props);
  },

  openProtocol(filePath, props) {
    filePath = this.changeExtension(filePath, ".prt");
    if (!fs.existsSync(filePath)) {
      this.reportMissingFile(filePath, props);
      return;
    }
    return lumine.workspace.open(filePath);
  },

  openViewer(filePath, props) {
    const environment = props?.environment || this.resolveEnvironment(props?.version, filePath);
    const version = Number(environment.version);
    props = { ...props, environment };
    if (version >= 2024) {
      return this.runSOFiSTiK("viewer.exe", ".cdb", filePath, props);
    } else if (version >= 2020) {
      return this.runSOFiSTiK("fea_viewer.exe", ".cdb", filePath, props);
    } else {
      lumine.notifications.addError(`Viewer is not available in SOFiSTiK ${version}`);
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
};
