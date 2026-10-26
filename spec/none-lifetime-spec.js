const path = require("node:path");

describe("SOFiSTiK source lifetimes across None", () => {
  let editor, main, grammar;
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    const language = await lumine.packages.activatePackage(
      path.join(__dirname, "..", "..", "language-sofistik"),
    );
    await language.resourceLoadPromise;
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("+PROG AQUA\nEND\n");
    editor.getBuffer().setPath(path.join(lumine.getConfigDirPath(), "none-source-context.dat"));
    grammar = lumine.grammars.grammarForScopeName("source.sofistik");
    editor.setGrammar(grammar);
    await editor.whenGrammarSettled();
  });
  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("sofistik-tools");
  });

  it("does not read None source from context capture or direct structure helpers", async () => {
    editor.setGrammar(lumine.grammars.nullGrammar);
    const read = spyOn(editor, "getText").and.throwError("None source must not be copied");
    const analyze = spyOn(editor, "analyzeSyntax").and.callThrough();
    const context = require("../lib/command-context").captureContext({ target: editor.element });
    expect(context.snapshot).toBeNull();
    expect(context.isCurrent()).toBe(false);
    const structure = require("../lib/document-structure");
    expect(await structure.documentStructure(editor)).toBeNull();
    expect(await structure.programHeaders(editor)).toBeNull();
    expect(lumine.commands.canDispatch(editor.element, "sofistik-tools:calculation-wps")).toBe(
      false,
    );
    await lumine.commands.dispatch(editor.element, "sofistik-tools:calculation-wps");
    expect(read).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("keeps independent workspace choices available without a source snapshot", async () => {
    editor.setGrammar(lumine.grammars.nullGrammar);
    const read = spyOn(editor, "getText").and.throwError(
      "Independent operation must not copy source",
    );
    const toggle = jasmine.createSpy("toggle release choices");
    const operation = jasmine.createSpy("metadata operation").and.callFake((context) => {
      expect(context.snapshot).toBeNull();
      expect(context.sourceBound).toBe(false);
      return { versionList: { toggle } };
    });
    spyOn(main, "ensureRuntime").and.resolveTo({ operation });
    await lumine.commands.dispatch(editor.element, "sofistik-tools:change-version");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });

  it("starts fresh source commands without waiting for an obsolete runtime import", async () => {
    const old = deferred();
    const run = jasmine.createSpy("run current calculation");
    const operation = jasmine.createSpy("source operation").and.returnValue({ runCalc: run });
    const runtime = { operation };
    spyOn(main, "ensureRuntime").and.returnValues(old.promise, Promise.resolve(runtime));
    const pending = lumine.commands.dispatch(editor.element, "sofistik-tools:calculation-wps");
    editor.setGrammar(lumine.grammars.nullGrammar);
    editor.setGrammar(grammar);
    await lumine.commands.dispatch(editor.element, "sofistik-tools:calculation-wps");
    expect(run).toHaveBeenCalledTimes(1);
    const read = spyOn(editor, "getText").and.callThrough();
    old.resolve(runtime);
    await pending;
    expect(operation).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });

  for (const transition of ["None cycle", "aborted request"])
    it(`retires a held lens readiness request after ${transition}`, async () => {
      const old = deferred();
      const mode = editor.getBuffer().getLanguageMode();
      const ready = mode.ready;
      mode.ready = old.promise;
      const controller = new AbortController();
      const provider = main.provideCodeLens();
      const pending = provider.codeLenses(editor, { signal: controller.signal });
      if (transition === "None cycle") {
        editor.setGrammar(lumine.grammars.nullGrammar);
        editor.setGrammar(grammar);
      } else {
        controller.abort();
        mode.ready = ready;
      }
      try {
        expect((await provider.codeLenses(editor)).length).toBe(1);
        const read = spyOn(editor, "getText").and.callThrough();
        const analyze = spyOn(editor, "analyzeSyntax").and.callThrough();
        old.resolve();
        expect(await pending).toBeNull();
        expect(read).not.toHaveBeenCalled();
        expect(analyze).not.toHaveBeenCalled();
      } finally {
        mode.ready = ready;
        old.resolve();
      }
    });

  it("keeps an old lens action inert after None while its runtime load is pending", async () => {
    const provider = main.provideCodeLens();
    const lens = (await provider.codeLenses(editor))[0];
    const old = deferred();
    const run = jasmine.createSpy("run stale program");
    spyOn(main, "ensureRuntime").and.returnValue(old.promise);
    const pending = lens.execute();
    editor.setGrammar(lumine.grammars.nullGrammar);
    editor.setGrammar(grammar);
    old.resolve({ runProgramAt: run });
    await pending;
    expect(run).not.toHaveBeenCalled();
    await (await provider.codeLenses(editor))[0].execute();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation of a returned lens action while runtime loading is pending", async () => {
    const provider = main.provideCodeLens();
    const controller = new AbortController();
    const lens = (await provider.codeLenses(editor, { signal: controller.signal }))[0];
    const old = deferred();
    const run = jasmine.createSpy("run current program");
    spyOn(main, "ensureRuntime").and.returnValue(old.promise);
    const pending = lens.execute();
    controller.abort();
    old.resolve({ runProgramAt: run });
    await pending;
    expect(run).not.toHaveBeenCalled();
    await (await provider.codeLenses(editor))[0].execute();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retires a calculation readiness wait before transaction work and allows fresh execution", async () => {
    const old = deferred();
    const mode = editor.getBuffer().getLanguageMode();
    const ready = mode.ready;
    mode.ready = old.promise;
    const context = require("../lib/command-context").editorContext(editor);
    const transaction = spyOn(mode, "atTransactionEnd").and.callThrough();
    const save = jasmine.createSpy("save current program").and.resolveTo(null);
    const operation = (current) => ({
      context: current,
      isActive: () => current.isSourceCurrent(),
      resolveEnvironment: () => ({}),
      saveProgramSource: save,
    });
    const run = require("../lib/calculations").runCalcCurrentNow;
    const pending = run.call(operation(context), "wps");
    editor.setGrammar(lumine.grammars.nullGrammar);
    editor.setGrammar(grammar);
    await run.call(operation(require("../lib/command-context").editorContext(editor)), "wps");
    expect(save).toHaveBeenCalledTimes(1);
    const read = spyOn(editor, "getText").and.callThrough();
    old.resolve();
    await pending;
    mode.ready = ready;
    expect(transaction).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
