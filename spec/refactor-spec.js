const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const corpus = require("@lumine-code/sofistik-data/fixtures/cadinp-structure.json");

describe("SOFiSTiK operation boundaries", () => {
  let main, runtime, directory, editors, resolverClass;

  async function openSource(name, text) {
    const filePath = path.join(directory, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text);
    const editor = await lumine.workspace.open(filePath);
    editors.push(editor);
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.sofistik"));
    const mode = editor.getBuffer().getLanguageMode();
    await mode.ready;
    await mode.atTransactionEnd();
    return editor;
  }

  function install(version, names = ["wps.exe"]) {
    const installPath = path.join(directory, "installed", version, `SOFiSTiK ${version}`);
    fs.mkdirSync(installPath, { recursive: true });
    for (const name of names) {
      const filePath = path.join(installPath, name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "");
    }
    return installPath;
  }

  function warnings() {
    return lumine.notifications
      .getNotifications()
      .map((notification) => notification.getMessage())
      .join("\n");
  }

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-operation-"));
    editors = [];
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage(path.join(__dirname, "..", "..", "language-sofistik"));
    main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule;
    runtime = main.ensureRuntime();
    resolverClass = require("@lumine-code/sofistik-env").SofistikEnvironmentResolver;
    runtime.environmentProvider = new resolverClass({ root: path.join(directory, "installed") });
    lumine.notifications.clear();
  });

  afterEach(async () => {
    for (const editor of editors) if (!editor.isDestroyed()) editor.destroy();
    await lumine.packages.deactivatePackage("sofistik-tools");
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  for (const fixture of corpus.cases) {
    it(`shares active program boundaries with the language server: ${fixture.name}`, async () => {
      const editor = await openSource("model.dat", fixture.source);
      const { programHeaders } = require("../lib/document-structure");
      expect(
        programHeaders(editor).map((directive) => [directive.module.toUpperCase(), directive.row]),
      ).toEqual(fixture.programs.map((program) => [program.name, program.line]));
    });
  }

  it("runs the dispatch editor and frozen release after save changes focus and definitions", async () => {
    const originalInstall = install("2024");
    install("2026");
    const editor = await openSource("source/model.dat", "+PROG AQUA\nEND\n");
    const definitionPath = path.join(path.dirname(editor.getPath()), "sofistik.def");
    fs.writeFileSync(definitionPath, "SOF_VERSION=2024\n");
    const other = await openSource("other/model.dat", "+PROG ASE\nEND\n");
    const launch = spyOn(runtime, "createCalculationProcess");
    let finishSave;
    spyOn(editor, "save").and.returnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const running = lumine.commands.dispatch(editor.getElement(), "sofistik-tools:calculation-wps");
    expect(launch).not.toHaveBeenCalled();
    fs.writeFileSync(definitionPath, "SOF_VERSION=2026\n");
    other.setCursorBufferPosition([1, 0]);
    finishSave();
    await running;
    expect(launch.calls.mostRecent().args[0]).toEqual({
      command: path.join(originalInstall, "wps.exe"),
      args: [editor.getPath()],
      options: { cwd: path.dirname(editor.getPath()) },
    });
    expect(lumine.workspace.getActiveTextEditor()).toBe(other);
  });

  it("uses the same lexical boundaries for cursor calculation and program editing", async () => {
    install("2026");
    const text =
      "+PROG AQUA\nHEAD '+PROG ASE'\n! +SYS echo\n#DEFINE block\n+PROG SOFILOAD\n#ENDDEF\nEND\n";
    const editor = await openSource("model.dat", text);
    editor.setCursorBufferPosition([6, 0]);
    const launch = spyOn(runtime, "createCalculationProcess");
    await lumine.commands.dispatch(editor.getElement(), "sofistik-tools:calculation-wps-current");
    expect(launch.calls.mostRecent().args[0].args).toEqual([editor.getPath(), "-run:1", "-e"]);
    await lumine.commands.dispatch(editor.getElement(), "sofistik-tools:program-all-off");
    expect(editor.getText()).toBe(text.replace("+PROG AQUA", "-PROG AQUA"));
  });

  it("keeps inactive SYS and APPLY switchable without running an inactive block", async () => {
    install("2026");
    const editor = await openSource("model.dat", "-SYS echo\n-APPLY other.dat\n");
    editor.setCursorBufferPosition([1, 5]);
    const launch = spyOn(runtime, "createCalculationProcess");
    await lumine.commands.dispatch(editor.getElement(), "sofistik-tools:calculation-wps-current");
    expect(launch).not.toHaveBeenCalled();
    expect(warnings()).toContain("Enable this SOFiSTiK directive");
    await lumine.commands.dispatch(editor.getElement(), "sofistik-tools:program-all-on");
    expect(editor.getText()).toBe("+SYS echo\n+APPLY other.dat\n");
  });

  it("cancels a full-file calculation when its activation ends during save", async () => {
    install("2026");
    const editor = await openSource("model.dat", "+PROG AQUA\nEND\n");
    const launch = spyOn(runtime, "createCalculationProcess");
    let finishSave;
    spyOn(editor, "save").and.returnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const running = lumine.commands.dispatch(editor.getElement(), "sofistik-tools:calculation-wps");
    await lumine.packages.deactivatePackage("sofistik-tools");
    finishSave();
    await running;
    expect(launch).not.toHaveBeenCalled();
  });

  it("refuses a full-file calculation whose save changes the source", async () => {
    install("2026");
    const editor = await openSource("model.dat", "+PROG AQUA\nEND\n");
    const launch = spyOn(runtime, "createCalculationProcess");
    spyOn(editor, "save").and.callFake(async () => editor.setText("+PROG ASE\nEND\n"));
    await lumine.commands.dispatch(editor.getElement(), "sofistik-tools:calculation-wps");
    expect(launch).not.toHaveBeenCalled();
    expect(warnings()).toContain("changed while saving");
  });

  it("saves open children and retains each child's environment chosen before parent save", async () => {
    const parentInstall = install("2024");
    const childInstall = install("2026");
    const child = await openSource("children/child.dat", "+PROG ASE\nEND\n");
    fs.writeFileSync(path.join(directory, "children", "sofistik.def"), "SOF_VERSION=2026\n");
    child.setText("+PROG ASE\nHEAD edited\nEND\n");
    const parent = await openSource("parent.dat", "@ child:children/child.dat\n+PROG AQUA\nEND\n");
    fs.writeFileSync(path.join(directory, "sofistik.def"), "SOF_VERSION=2024\n");
    const save = spyOn(child, "save").and.callThrough();
    const launch = spyOn(runtime, "createCalculationProcess");
    await lumine.commands.dispatch(parent.getElement(), "sofistik-tools:calculation-wps");
    expect(save).toHaveBeenCalledTimes(1);
    expect(launch.calls.allArgs().map(([task]) => [task.command, task.args[0]])).toEqual([
      [path.join(parentInstall, "wps.exe"), parent.getPath()],
      [path.join(childInstall, "wps.exe"), child.getPath()],
    ]);
    expect(fs.readFileSync(child.getPath(), "utf8")).toContain("HEAD edited");
  });

  it("does not infer a calculation executable from a CDB-only installation", async () => {
    const interfaceName = "interfaces/64bit/sof_cdb_w-2026.dll";
    install("2026", [interfaceName]);
    const editor = await openSource("model.dat", "+PROG AQUA\nEND\n");
    const launch = spyOn(runtime, "createCalculationProcess");
    await lumine.commands.dispatch(editor.getElement(), "sofistik-tools:calculation-wps");
    expect(runtime.resolveEnvironment(null, editor.getPath()).installed).toBe(true);
    expect(launch).not.toHaveBeenCalled();
    expect(warnings()).toContain("does not provide wps.exe");
  });

  it("loads German examples for the canonical language code and snapshots item paths", async () => {
    const installPath = install("2026", [
      "wps.exe",
      "ase.dat/deutsch/stab.dat",
      "ase.dat/english/beam.dat",
    ]);
    const editor = await openSource("model.dat", "+PROG ASE\nEND\n");
    fs.writeFileSync(path.join(directory, "sofistik.def"), "SOF_VERSION=2026\nSOF_LANGUAGE=DE\n");
    const list = runtime.exampleList;
    list.operation = runtime.operation(require("../lib/command-context").editorContext(editor));
    await list.update();
    expect(list.items.map((item) => item.title)).toEqual(["stab.dat"]);
    expect(list.items[0].filePath).toBe(path.join(installPath, "ase.dat", "deutsch", "stab.dat"));
  });

  it("does not let an obsolete service edge clear a replacement provider", () => {
    const first = { selectedPaths: () => [] };
    const second = { selectedPaths: () => [] };
    const old = main.consumeTreeViewSelection(first);
    const current = main.consumeTreeViewSelection(second);
    old.dispose();
    expect(main.treeView).toBe(second);
    current.dispose();
    expect(main.treeView).toBeNull();
    const previousPdf = main.consumePdfView(first);
    const currentPdf = main.consumePdfView(second);
    previousPdf.dispose();
    expect(main.pdfViewService).toBe(second);
    currentPdf.dispose();
    expect(main.pdfViewService).toBeNull();
  });

  it("cancels pending installation indexing and coalesces concurrent reads", async () => {
    const InstallationIndex = require("../lib/installation-index");
    let finish;
    const scan = jasmine.createSpy("scan").and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const index = new InstallationIndex(() => true, scan);
    const build = jasmine.createSpy("build").and.callFake((files) => files);
    const first = index.read(directory, "de", "*.pdf", build);
    const second = index.read(directory, "de", "*.pdf", build);
    expect(scan).toHaveBeenCalledTimes(1);
    const signal = scan.calls.mostRecent().args[2].signal;
    index.dispose();
    expect(signal.aborted).toBe(true);
    finish(["aqua_0.pdf"]);
    expect(await first).toBeUndefined();
    expect(await second).toBeUndefined();
    expect(build).not.toHaveBeenCalled();
  });

  it("captures custom-clean selection and closes the dialog with its package", async () => {
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    fs.writeFileSync(path.join(first, "one.tmp"), "");
    fs.writeFileSync(path.join(second, "two.tmp"), "");
    let selected = [first];
    const edge = main.consumeTreeViewSelection({ selectedPaths: () => selected });
    const dialog = runtime.cleanCustomFilters();
    selected = [second];
    const cleaned = await dialog.onSelected("*.tmp");
    expect(cleaned.changed).toEqual([path.join(first, "one.tmp")]);
    expect(fs.existsSync(path.join(second, "two.tmp"))).toBe(true);
    await lumine.packages.deactivatePackage("sofistik-tools");
    expect(dialog.closed).toBe(true);
    edge.dispose();
  });
});
