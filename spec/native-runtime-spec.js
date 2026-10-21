const path = require("node:path");

describe("SOFiSTiK native runtime loading", () => {
  let main, editor;

  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded("sofistik-tools"))
      await lumine.packages.unloadPackage("sofistik-tools");
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    editor = await lumine.workspace.open();
  });

  afterEach(async () => {
    editor?.destroy();
    lumine.config.unset("sofistik-tools.inlineActions");
    await lumine.packages.unloadPackage("sofistik-tools");
  });

  function holdImport() {
    let release;
    spyOn(main, "importRuntime").and.returnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    return release;
  }

  function fakeRuntime() {
    const run = jasmine.createSpy("run");
    const operation = jasmine.createSpy("operation").and.returnValue({ helpList: { toggle: run } });
    class Runtime {
      constructor() {
        this.operation = operation;
        this.openExternal = run;
        this.runProgramAt = run;
      }
      dispose() {}
    }
    return { Runtime, operation, run };
  }

  it("shares the first import and keeps the current CommonJS runtime constructor", async () => {
    spyOn(main, "importRuntime").and.callThrough();
    const [first, second] = await Promise.all([main.ensureRuntime(), main.ensureRuntime()]);
    expect(first).toBe(second);
    expect(main.importRuntime).toHaveBeenCalledTimes(1);
    expect(first instanceof require("../lib/runtime")).toBe(true);
  });

  it("retries a failed import", async () => {
    spyOn(main, "importRuntime").and.rejectWith(new Error("Runtime unavailable"));
    await expectAsync(main.ensureRuntime()).toBeRejectedWithError("Runtime unavailable");
    expect(main.runtime).toBeNull();
    main.importRuntime.and.callThrough();
    expect(await main.ensureRuntime()).toBe(main.runtime);
    expect(main.importRuntime).toHaveBeenCalledTimes(2);
  });

  it("does not construct the old runtime after unloading and activating a new generation", async () => {
    const previous = main;
    const { Runtime } = fakeRuntime();
    const construct = jasmine.createSpy("construct").and.callFake(() => new Runtime());
    const release = holdImport();
    const pending = main.ensureRuntime();
    await lumine.packages.unloadPackage("sofistik-tools");
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    release(construct);
    expect(await pending).toBeNull();
    expect(construct).not.toHaveBeenCalled();
    expect(previous.runtime).toBeNull();
    expect(await main.ensureRuntime()).toBe(main.runtime);
  });

  it("applies consecutive source edits without importing the optional runtime", async () => {
    await lumine.packages.activatePackage("language-sofistik");
    editor.setText("+PROG AQUA\nEND\n");
    lumine.grammars.assignLanguageMode(editor.getBuffer(), "source.sofistik");
    await editor.getBuffer().getLanguageMode().ready;
    spyOn(main, "importRuntime").and.callThrough();
    const toggle = () =>
      lumine.commands.dispatch(editor.getElement(), "sofistik-tools:program-all-toggle");
    await toggle();
    expect(editor.lineTextForBufferRow(0)).toBe("-PROG AQUA");
    await toggle();
    expect(editor.lineTextForBufferRow(0)).toBe("+PROG AQUA");
    expect(main.importRuntime).not.toHaveBeenCalled();
    expect(main.runtime).toBeNull();
  });

  for (const reason of ["text changes", "path changes", "editor destruction"]) {
    it(`does not run a captured command after ${reason} during the import`, async () => {
      const { Runtime, operation, run } = fakeRuntime();
      const release = holdImport();
      const pending = lumine.commands.dispatch(editor.getElement(), "sofistik-tools:toggle-help");
      if (reason === "text changes") editor.setText("changed");
      else if (reason === "path changes") editor.getBuffer().setPath(path.resolve("changed.dat"));
      else editor.destroy();
      release(Runtime);
      await pending;
      expect(operation).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    });
  }

  it("does not launch an external action after its provider lease retires during import", async () => {
    const { Runtime, run } = fakeRuntime();
    const release = holdImport();
    let handler;
    const lease = main.consumeOpenExternal({
      registerHandler(value) {
        handler = value;
        return { dispose() {} };
      },
    });
    const pending = handler.openExternal(path.resolve("model.dat"));
    lease.dispose();
    release(Runtime);
    await pending;
    expect(run).not.toHaveBeenCalled();
  });

  it("does not run a code lens disabled while its runtime imports", async () => {
    await lumine.packages.activatePackage("language-sofistik");
    editor.setText("+PROG AQUA\nEND\n");
    lumine.grammars.assignLanguageMode(editor.getBuffer(), "source.sofistik");
    await editor.getBuffer().getLanguageMode().ready;
    const provider = main.provideCodeLens();
    const [lens] = await provider.codeLenses(editor);
    const { Runtime, run } = fakeRuntime();
    const release = holdImport();
    const pending = lens.execute();
    lumine.config.set("sofistik-tools.inlineActions", false);
    release(Runtime);
    await pending;
    expect(run).not.toHaveBeenCalled();
  });
});
