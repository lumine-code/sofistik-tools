const { captureContext } = require("./command-context");
const { includeModule } = require("./document-structure");

// SOFiSTiK's own words. A command's palette label is derived by the humanizer,
// which spells `sofistik` itself but knows nothing of this domain's file
// formats and programs — and should not, since no other package needs them.
// Only these commands need a label; every other one the humanizer already
// spells correctly. `npm run check:commands` in the editor holds each of these
// to the derived label, so neither half can drift from the command name.
//
// Each label is written out rather than composed from a constant, because the
// check reads the source: a `${PACKAGE_LABEL}` prefix is what it would compare
// against the derived name, and every one of them would read as a rename.
//
// Keyed by the *full* command name, and a plain object rather than a Map, so
// that a quoted command name opening a brace with description first reads to
// the static check exactly as an inline registration does. A description held
// in a data structure the check cannot see is one nobody can audit.
//
// Almost every command here earns one: the label says which SOFiSTiK tool is
// launched and nothing about what it does to the file in front of you. The
// numbered Teddy variants are the exception — what `-1` through `-4` select is
// Teddy's own, and a guess would be worse than the honest label.
const COMMAND_META = {
  "sofistik-tools:toggle-help": {
    description: "Search the installed manuals by program and command.",
  },
  "sofistik-tools:toggle-examples": {
    description: "Browse the example files shipped with the installation.",
  },
  "sofistik-tools:change-version": {
    description: "Choose the SOFiSTiK release declared by the file's adjacent sofistik.def.",
  },

  "sofistik-tools:current-help": {
    description: "Open the manual for the module or include fragment at the cursor.",
  },
  "sofistik-tools:separately-help": {
    description: "Open the manual in its own tab rather than reusing the open one.",
  },
  "sofistik-tools:calculation-wps": {
    description: "Calculate the whole file with the WPS parser.",
    displayName: "SOFiSTiK Tools: Calculation WPS",
  },
  "sofistik-tools:calculation-wps-immediately": {
    description: "Calculate the whole file with WPS and close it when done.",
    displayName: "SOFiSTiK Tools: Calculation WPS Immediately",
  },
  "sofistik-tools:calculation-wps-current": {
    description: "Calculate only the PROG block above the cursor.",
    displayName: "SOFiSTiK Tools: Calculation WPS Current",
  },
  "sofistik-tools:calculation-sps": {
    description: "Calculate the whole file with the SPS parser.",
    displayName: "SOFiSTiK Tools: Calculation SPS",
  },
  "sofistik-tools:export-plb-to-docx": {
    description: "Convert the report beside this file from PLB to DOCX.",
    displayName: "SOFiSTiK Tools: Export PLB To DOCX",
  },
  "sofistik-tools:program-current-toggle": {
    description: "Switch the nearest PROG block above the cursor on or off.",
  },
  "sofistik-tools:program-all-toggle": {
    description: "Switch every PROG block in the file on or off.",
  },
  "sofistik-tools:program-all-on": { description: "Enable every PROG block in the file." },
  "sofistik-tools:program-all-off": { description: "Disable every PROG block in the file." },
  "sofistik-tools:program-above-toggle": {
    description: "Switch every PROG block above the cursor on or off.",
  },
  "sofistik-tools:program-above-on": { description: "Enable every PROG block above the cursor." },
  "sofistik-tools:program-above-off": { description: "Disable every PROG block above the cursor." },
  "sofistik-tools:program-below-toggle": {
    description: "Switch every PROG block below the cursor on or off.",
  },
  "sofistik-tools:program-below-on": { description: "Enable every PROG block below the cursor." },
  "sofistik-tools:program-below-off": { description: "Disable every PROG block below the cursor." },
  "sofistik-tools:clear-urs-tags": {
    description: "Strip the URS tags from every PROG line in the file.",
    displayName: "SOFiSTiK Tools: Clear URS Tags",
  },
  "sofistik-tools:open-animator": { description: "Open the model of this file in Animator." },
  "sofistik-tools:open-animator-2018": {
    description: "Open the model in the 2018 build of Animator.",
  },
  "sofistik-tools:open-report": { description: "Open the calculation report for this file." },
  "sofistik-tools:save-report-as-pdf": {
    description: "Print the calculation report to a PDF beside the file.",
  },
  "sofistik-tools:save-pictures-as-pdf": {
    description: "Print every picture in the report to a PDF beside the file.",
  },
  "sofistik-tools:open-protocol": { description: "Open the calculation protocol for this file." },
  "sofistik-tools:open-viewer": { description: "Open the results of this file in the viewer." },
  "sofistik-tools:open-viewer-2025": {
    description: "Open the results in the 2025 build of the viewer.",
  },
  "sofistik-tools:open-dbinfo": {
    description: "Inspect the CDB database belonging to this file.",
    displayName: "SOFiSTiK Tools: Open DBInfo",
  },
  "sofistik-tools:open-ssd": {
    description: "Open this file's project in the SSD design tool.",
    displayName: "SOFiSTiK Tools: Open SSD",
  },
  "sofistik-tools:open-wingraf": {
    description: "Open the graphics of this file in WinGRAF.",
    displayName: "SOFiSTiK Tools: Open WinGRAF",
  },
  "sofistik-tools:open-result-viewer": {
    description: "Open the results of this file in ResultViewer.",
  },
  "sofistik-tools:open-teddy": { description: "Open this file in Teddy, the SOFiSTiK editor." },
  "sofistik-tools:open-teddy-single": {
    description: "Open this file in a new Teddy window rather than an open one.",
  },
  "sofistik-tools:open-sofiplus": {
    description: "Open this file's model in SOFiPLUS.",
    displayName: "SOFiSTiK Tools: Open SOFiPLUS",
  },
  "sofistik-tools:export-cdb": {
    description: "Export the CDB database belonging to this file.",
    displayName: "SOFiSTiK Tools: Export CDB",
  },
  "sofistik-tools:check-version": {
    description: "Report which SOFiSTiK release this file is calculated with.",
  },
  "sofistik-tools:ifc-export": { description: "Open the SOFiSTiK tool that writes an IFC model." },
  "sofistik-tools:ifc-import": { description: "Open the SOFiSTiK tool that reads an IFC model." },
  "sofistik-tools:open-cdbase": {
    description: "Open the CDBASE database reference manual.",
    displayName: "SOFiSTiK Tools: Open CDBASE",
  },
  "sofistik-tools:open-daten": {
    description: "Open the sofistik_daten.py example shipped with the install.",
  },
  "sofistik-tools:clean-glob": {
    description: "Delete files matching a pattern you type, in the selected folders.",
  },
  "sofistik-tools:clean-1": {
    description: "Delete the result and log files in the selected folders.",
  },
  "sofistik-tools:clean-1-recursively": {
    description: "Delete the result and log files, in the selection and below.",
  },
  "sofistik-tools:clean-2": { description: "Delete the results, logs and interface databases." },
  "sofistik-tools:clean-3": {
    description: "Delete the results, logs, interfaces and the CDB database.",
  },
  "sofistik-tools:clean-2-recursively": {
    description: "Delete results, logs and interfaces, in the selection and below.",
  },
  "sofistik-tools:clean-3-recursively": {
    description: "Delete results, logs, interfaces and the CDB, here and below.",
  },
  "sofistik-tools:clean-4": {
    description: "Delete everything generated, the report and backups included.",
  },
  "sofistik-tools:clean-4-recursively": {
    description: "Delete everything generated, in the selection and below.",
  },
  "sofistik-tools:wing-fix": {
    description: "Strip the fixed picture scales from the selected WinGRAF files.",
  },
  "sofistik-tools:wing-fix-recursively": {
    description: "Strip the fixed picture scales from the .gra files below too.",
  },
};

/**
 * Attaches the metadata for a command that carries any — a SOFiSTiK word its
 * label needs, a description, or both — and leaves every other command to the
 * humanizer.
 * @param {String} name - the full command name
 * @param {Function} didDispatch - the handler
 * @returns {Function|Object} a listener for `lumine.commands.add`
 */
function labelled(name, didDispatch) {
  const meta = COMMAND_META[name];
  if (!meta) return didDispatch;
  return { ...meta, didDispatch };
}

function registerCommands(owner) {
  const dispatch = (name, run, editorOnly = false, surfaceAction = false) =>
    labelled(name, (event) => {
      const context = captureContext(event, owner.treeView);
      if (editorOnly || (surfaceAction && context.surface !== "tree")) {
        if (!context.editor || context.editor.isDestroyed()) {
          if (context.paneItem)
            lumine.notifications.addWarning(
              "Activate a SOFiSTiK source editor before using this command.",
            );
          return;
        }
        const includeHelp =
          (name === "sofistik-tools:current-help" || name === "sofistik-tools:separately-help") &&
          includeModule(context.editor);
        if (
          context.editor.isMini() ||
          (context.editor.getGrammar().scopeName !== "source.sofistik" && !includeHelp)
        ) {
          lumine.notifications.addWarning("Not a SOFiSTiK file");
          return;
        }
      }
      const operation = owner.ensureRuntime().operation(context);
      return run(operation);
    });
  const inEditor = (commands) =>
    Object.fromEntries(
      Object.entries(commands).map(([name, run]) => [name, dispatch(name, run, true)]),
    );
  const bySurface = (commands) =>
    Object.fromEntries(
      Object.entries(commands).map(([name, run]) => [name, dispatch(name, run, false, true)]),
    );
  const withLabels = (commands) =>
    Object.fromEntries(Object.entries(commands).map(([name, run]) => [name, dispatch(name, run)]));
  owner.disposables.add(
    lumine.commands.add(
      "lumine-workspace",
      withLabels({
        "sofistik-tools:toggle-help": (operation) => operation.helpList.toggle(operation),
        "sofistik-tools:toggle-examples": (operation) => operation.exampleList.toggle(operation),
        "sofistik-tools:change-version": (operation) => operation.versionList.toggle(operation),
      }),
    ),
  );
  owner.disposables.add(
    lumine.commands.add(
      "lumine-workspace",
      inEditor({
        "sofistik-tools:current-help": (operation) => operation.currentHelp(1),
        "sofistik-tools:separately-help": (operation) => operation.currentHelp(2),
        "sofistik-tools:calculation-wps": (operation) => operation.runCalc("wps"),
        "sofistik-tools:calculation-wps-immediately": (operation) =>
          operation.runCalc("wps", ["-run", "-e"]),
        "sofistik-tools:calculation-wps-current": (operation) => operation.runCalcCurrentNow("wps"),
        "sofistik-tools:calculation-sps": (operation) => operation.runCalc("sps"),
        "sofistik-tools:export-plb-to-docx": (operation) => operation.exportPLB2DOCX(),
        "sofistik-tools:program-current-toggle": (operation) => operation.changeProg(),
        "sofistik-tools:program-all-toggle": (operation) => operation.changeProgs("all"),
        "sofistik-tools:program-all-on": (operation) => operation.changeProgs("all", "ON"),
        "sofistik-tools:program-all-off": (operation) => operation.changeProgs("all", "OFF"),
        "sofistik-tools:program-above-toggle": (operation) => operation.changeProgs("above"),
        "sofistik-tools:program-above-on": (operation) => operation.changeProgs("above", "ON"),
        "sofistik-tools:program-above-off": (operation) => operation.changeProgs("above", "OFF"),
        "sofistik-tools:program-below-toggle": (operation) => operation.changeProgs("below"),
        "sofistik-tools:program-below-on": (operation) => operation.changeProgs("below", "ON"),
        "sofistik-tools:program-below-off": (operation) => operation.changeProgs("below", "OFF"),
        "sofistik-tools:clear-urs-tags": (operation) => operation.cleanUrsTags(),
      }),
    ),
    lumine.commands.add(
      "lumine-workspace",
      bySurface({
        "sofistik-tools:open-animator": (operation) => operation.openFromContext("openAnimator"),
        "sofistik-tools:open-animator-2018": (operation) =>
          operation.openFromContext("openAnimator", { version: "2018" }),
        "sofistik-tools:open-report": (operation) => operation.openFromContext("openReport"),
        "sofistik-tools:save-report-as-pdf": (operation) =>
          operation.openFromContext("openReport", { parameters: ["-t", "-printto:PDF"] }),
        "sofistik-tools:save-pictures-as-pdf": (operation) =>
          operation.openFromContext("openReport", {
            parameters: ["-g", "-picture:all", "-printto:PDF"],
          }),
        "sofistik-tools:open-protocol": (operation) => operation.openFromContext("openProtocol"),
        "sofistik-tools:open-viewer": (operation) => operation.openFromContext("openViewer"),
        "sofistik-tools:open-dbinfo": (operation) => operation.openFromContext("openDBNG"),
        "sofistik-tools:open-ssd": (operation) => operation.openFromContext("openSSD"),
        "sofistik-tools:open-wingraf": (operation) => operation.openFromContext("openWinGRAF"),
        "sofistik-tools:open-result-viewer": (operation) =>
          operation.openFromContext("openResultViewer"),
        "sofistik-tools:open-teddy": (operation) =>
          operation.openFromContext("openTeddy", { parameters: ["-0"] }),
        "sofistik-tools:open-teddy-single": (operation) =>
          operation.openFromContext("openTeddy", { parameters: ["-nosingle"] }),
        "sofistik-tools:open-sofiplus": (operation) => operation.openFromContext("openSOFiPLUS"),
        "sofistik-tools:export-cdb": (operation) => operation.openFromContext("openExportCDB"),
        "sofistik-tools:open-teddy-1": (operation) =>
          operation.openFromContext("openTeddy", { parameters: ["-1"] }),
        "sofistik-tools:open-teddy-2": (operation) =>
          operation.openFromContext("openTeddy", { parameters: ["-2"] }),
        "sofistik-tools:open-teddy-3": (operation) =>
          operation.openFromContext("openTeddy", { parameters: ["-3"] }),
        "sofistik-tools:open-teddy-4": (operation) =>
          operation.openFromContext("openTeddy", { parameters: ["-4"] }),
        "sofistik-tools:check-version": (operation) => operation.showVersionFromContext(),
      }),
    ),
    lumine.commands.add(
      "lumine-workspace",
      withLabels({
        "sofistik-tools:ifc-export": (operation) => operation.ifcExport(),
        "sofistik-tools:ifc-import": (operation) => operation.ifcImport(),
        "sofistik-tools:open-cdbase": (operation) => operation.openCHM(),
        "sofistik-tools:open-daten": (operation) => operation.openSofistikDaten(),
      }),
    ),
    // Tree-view only: these read the selection and have no editor flavour.
    // Through `withLabels` like every other group, so their descriptions live
    // in the one map rather than inline here.
    lumine.commands.add(
      "lumine-workspace",
      withLabels({
        "sofistik-tools:clean-glob": (operation) => operation.cleanCustomFilters(),
        "sofistik-tools:clean-1": (operation) =>
          operation.cleanSelectedFolders({ level: 1, recursive: false }),
        "sofistik-tools:clean-1-recursively": (operation) =>
          operation.cleanSelectedFolders({ level: 1, recursive: true }),
        "sofistik-tools:clean-2": (operation) =>
          operation.cleanSelectedFolders({ level: 2, recursive: false }),
        "sofistik-tools:clean-2-recursively": (operation) =>
          operation.cleanSelectedFolders({ level: 2, recursive: true }),
        "sofistik-tools:clean-3": (operation) =>
          operation.cleanSelectedFolders({ level: 3, recursive: false }),
        "sofistik-tools:clean-3-recursively": (operation) =>
          operation.cleanSelectedFolders({ level: 3, recursive: true }),
        "sofistik-tools:clean-4": (operation) =>
          operation.cleanSelectedFolders({ level: 4, recursive: false }),
        "sofistik-tools:clean-4-recursively": (operation) =>
          operation.cleanSelectedFolders({ level: 4, recursive: true }),
        "sofistik-tools:wing-fix": (operation) => operation.wingFixTreeS(),
        "sofistik-tools:wing-fix-recursively": (operation) => operation.wingFixTreeR(),
        "sofistik-tools:open-viewer-2025": (operation) =>
          operation.openTreePaths("openViewer", { version: "2025" }),
      }),
    ),
  );
}

module.exports = { registerCommands };
