const fs = require("fs");
const os = require("os");
const path = require("path");

describe("SOFiSTiK program code lenses", () => {
  let main, provider, directory, editors, launch;

  async function openEditor(text, saved = true) {
    const filePath = saved ? path.join(directory, `input-${editors.length}.dat`) : null;
    if (filePath) fs.writeFileSync(filePath, text);
    const editor = await lumine.workspace.open(filePath || undefined);
    editors.push(editor);
    editor.setText(text);
    lumine.grammars.assignLanguageMode(editor.getBuffer(), "source.sofistik");
    const mode = editor.getBuffer().getLanguageMode();
    await mode.ready;
    await mode.atTransactionEnd();
    return editor;
  }

  function warningText() {
    return lumine.notifications
      .getNotifications()
      .map((notification) => notification.getMessage())
      .join("\n");
  }

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-program-lens-"));
    editors = [];
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage(path.join(__dirname, "..", "..", "language-sofistik"));
    main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule.ensureRuntime();
    lumine.config.unset("sofistik-tools.inlineActions");
    lumine.config.unset("sofistik-tools.inlineActions", { scopeSelector: ".source.sofistik" });
    provider = main.owner.provideCodeLens();
    launch = spyOn(main, "createCalculationProcess").and.stub();
    spyOn(main, "getApplicationPath").and.callFake((name) => path.join(directory, name));
    lumine.notifications.clear();
  });

  afterEach(async () => {
    for (const editor of editors) editor.destroy();
    await lumine.packages.deactivatePackage("sofistik-tools");
    lumine.config.unset("sofistik-tools.inlineActions");
    lumine.config.unset("sofistik-tools.inlineActions", { scopeSelector: ".source.sofistik" });
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("finds only complete active headers outside comments, strings, text and macro definitions", async () => {
    const text = [
      "+PROG AQUA",
      "-PROG ASE",
      "$PROG AQB",
      "! +PROG ASE",
      "HEAD '+PROG ASE'",
      "+PROG",
      "+PROG $(module)",
      "#DEFINE block",
      "+PROG ASE",
      "#ENDDEF",
      "#DEFINE inline=+PROG ASE; +PROG AQB",
      "<TEXT>",
      "+PROG ASE",
      "</TEXT>",
      "TXAB title",
      "+PROG ASE",
      "TXEN",
      "HEAD title $$ continued",
      "+PROG ASE",
      "END",
      "+PROG ASE; END; +PROG AQB",
      "<PICT>",
      "+PROG SOFIMSHA",
      "</PICT>",
      "END",
    ].join("\n");
    const editor = await openEditor(text);
    const lenses = await provider.codeLenses(editor);
    expect(lenses.map((lens) => lens.range[0][0])).toEqual([0, 22]);
    expect(lenses.every((lens) => lens.title === "Run")).toBe(true);
    expect(launch).not.toHaveBeenCalled();
    expect(main.getApplicationPath).not.toHaveBeenCalled();
  });

  it("declines mini editors and other grammars", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    spyOn(editor, "isMini").and.returnValue(true);
    expect(await provider.codeLenses(editor)).toBeNull();
    editor.isMini.and.returnValue(false);
    spyOn(editor, "getGrammar").and.returnValue({ scopeName: "text.plain" });
    expect(await provider.codeLenses(editor)).toBeNull();
  });

  it("honours global and scoped settings and refuses previously displayed actions when disabled", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    const save = spyOn(editor, "save").and.callThrough();
    lumine.config.set("sofistik-tools.inlineActions", false);
    expect(await provider.codeLenses(editor)).toBeNull();
    await lens.execute();
    expect(save).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();

    lumine.config.set("sofistik-tools.inlineActions", true, { scopeSelector: ".source.sofistik" });
    expect((await provider.codeLenses(editor)).length).toBe(1);
    lumine.config.set("sofistik-tools.inlineActions", false, { scopeSelector: ".source.sofistik" });
    lumine.config.set("sofistik-tools.inlineActions", true);
    expect(await provider.codeLenses(editor)).toBeNull();
  });

  it("drops a pending lens fetch if the setting is disabled while the parser settles", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    let finishParsing;
    spyOn(editor.getBuffer().getLanguageMode(), "atTransactionEnd").and.returnValue(
      new Promise((resolve) => {
        finishParsing = resolve;
      }),
    );
    const fetching = provider.codeLenses(editor);
    await Promise.resolve();
    lumine.config.set("sofistik-tools.inlineActions", false);
    finishParsing();
    expect(await fetching).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it("keeps old actions invalid after toggling off and on and allows newly fetched actions", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    const save = spyOn(editor, "save").and.callThrough();
    lumine.config.set("sofistik-tools.inlineActions", false);
    lumine.config.set("sofistik-tools.inlineActions", true);
    await lens.execute();
    expect(save).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    await (await provider.codeLenses(editor))[0].execute();
    expect(save).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("invalidates for scoped configuration changes and stops notifying after deactivation", async () => {
    const invalidated = jasmine.createSpy("invalidated");
    const subscription = provider.onDidInvalidate(invalidated);
    lumine.config.set("sofistik-tools.inlineActions", false, { scopeSelector: ".source.sofistik" });
    expect(invalidated).toHaveBeenCalledTimes(1);
    await lumine.packages.deactivatePackage("sofistik-tools");
    lumine.config.set("sofistik-tools.inlineActions", true, { scopeSelector: ".source.sofistik" });
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(await provider.codeLenses(await openEditor("+PROG AQUA\nEND\n"))).toBeNull();
    subscription.dispose();
  });

  it("tracks macro markers after semicolons and closes inline and prose text boundaries", async () => {
    const text = [
      "+PROG TEMPLATE",
      "HEAD before; #DEFINE block",
      "+PROG ASE",
      "END",
      "HEAD content; #ENDDEF",
      "<TEXT>Title</TEXT>",
      "+PROG AQUA",
      "END",
      "<TEXT>",
      "Prose </TEXT>",
      "+PROG AQB",
      "END",
      "TXAB Title; TXEN",
      "+PROG SOFIMSHA",
      "END",
    ].join("\n");
    const editor = await openEditor(text);
    const lenses = await provider.codeLenses(editor);
    expect(lenses.map((lens) => lens.range[0][0])).toEqual([0, 6, 10, 13]);
    expect(launch).not.toHaveBeenCalled();
  });

  it("keeps quoted/comment control markers and inline DEFINE semicolons literal", async () => {
    const text = [
      "+PROG AQUA",
      "HEAD 'data; #DEFINE fake'",
      "+PROG ASE",
      "HEAD comment ! ; #DEFINE fake",
      "+PROG AQB",
      "HEAD title; #DEFINE inline=value; #DEFINE fake",
      "+PROG SOFILOAD",
      "END",
    ].join("\n");
    const editor = await openEditor(text);
    expect((await provider.codeLenses(editor)).map((lens) => lens.range[0][0])).toEqual([
      0, 2, 4, 6,
    ]);
  });

  it("treats $$ after a closing quote as continuation with or without a separating space", async () => {
    const text = [
      "+PROG TEMPLATE",
      "HEAD 'title'$$ comment",
      "+PROG ASE",
      "END",
      "HEAD 'title' $$ comment",
      "+PROG AQB",
      "END",
    ].join("\n");
    const editor = await openEditor(text);
    expect((await provider.codeLenses(editor)).map((lens) => lens.range[0][0])).toEqual([0]);
  });

  it("keeps a quoted TEXT close and prose DEFINE inside the text block", async () => {
    const text = [
      "+PROG TEMPLATE",
      "<TEXT>",
      "'</TEXT>'",
      "#DEFINE fake",
      "</TEXT>",
      "+PROG ASE",
      "END",
    ].join("\n");
    const editor = await openEditor(text);
    expect((await provider.codeLenses(editor)).map((lens) => lens.range[0][0])).toEqual([0, 5]);
  });

  it("awaits save and runs the clicked editor and row without moving its cursor", async () => {
    const editor = await openEditor("! title\n+PROG AQUA\nEND\n+PROG ASE\nEND\n");
    editor.setCursorBufferPosition([3, 5]);
    const position = editor.getCursorBufferPosition().copy();
    const lens = (await provider.codeLenses(editor))[0];
    const other = await openEditor("+PROG SOFILOAD\nEND\n");
    expect(lumine.workspace.getActiveTextEditor()).toBe(other);
    let finishSave;
    const save = spyOn(editor, "save").and.returnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const running = lens.execute();
    expect(save).toHaveBeenCalledTimes(1);
    expect(launch).not.toHaveBeenCalled();
    finishSave();
    await running;
    expect(launch).toHaveBeenCalledWith({
      command: path.join(directory, "wps.exe"),
      args: [editor.getPath(), "-run:2", "-e"],
      options: { cwd: path.dirname(editor.getPath()) },
    });
    const lookup = main.getApplicationPath.calls.mostRecent().args;
    expect(lookup[0]).toBe("wps.exe");
    expect(lookup[1].version).toBe("2026");
    expect(editor.getCursorBufferPosition()).toEqual(position);
    expect(lumine.workspace.getActiveTextEditor()).toBe(other);
  });

  it("refuses an old lens after any text change instead of running a different program", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n+PROG ASE\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    editor.getBuffer().insert([0, 0], "+PROG SOFILOAD\nEND\n");
    await lens.execute();
    expect(launch).not.toHaveBeenCalled();
    expect(warningText()).toContain("Wait for Code Lens to refresh");
  });

  it("awaits save hooks and runs normalized text from disk without a warning", async () => {
    const original = "! title  \n+PROG AQUA  \nEND";
    const normalized = "! title\n+PROG AQUA\nEND\n";
    const editor = await openEditor(original);
    const lens = (await provider.codeLenses(editor))[0];
    let finishSave, savingStarted;
    const saving = new Promise((resolve) => {
      savingStarted = resolve;
    });
    editor.getBuffer().onWillSave(() => {
      editor.getBuffer().setTextViaDiff(normalized);
      savingStarted();
      return new Promise((resolve) => {
        finishSave = resolve;
      });
    });
    const save = spyOn(editor, "save").and.callThrough();
    launch.and.callFake(() => {
      expect(fs.readFileSync(editor.getPath(), "utf8")).toBe(normalized);
      expect(editor.getBuffer().getFileState()).toBe("unmodified");
    });
    const running = lens.execute();
    await saving;
    expect(save).toHaveBeenCalledTimes(1);
    expect(launch).not.toHaveBeenCalled();
    expect(fs.readFileSync(editor.getPath(), "utf8")).toBe(original);
    finishSave();
    await running;
    expect(launch).toHaveBeenCalledOnceWith({
      command: path.join(directory, "wps.exe"),
      args: [editor.getPath(), "-run:2", "-e"],
      options: { cwd: path.dirname(editor.getPath()) },
    });
    expect(warningText()).toBe("");
  });

  it("follows the clicked program when a save hook inserts a header above it", async () => {
    const original = "+PROG AQUA\nEND\n+PROG ASE\nEND\n";
    const editor = await openEditor(original);
    const lens = (await provider.codeLenses(editor))[0];
    editor.getBuffer().onWillSave(() => editor.getBuffer().insert([0, 0], "! saved header\n"));
    launch.and.callFake(() => {
      expect(fs.readFileSync(editor.getPath(), "utf8")).toBe(`! saved header\n${original}`);
    });
    await lens.execute();
    expect(launch).toHaveBeenCalledOnceWith({
      command: path.join(directory, "wps.exe"),
      args: [editor.getPath(), "-run:2", "-e"],
      options: { cwd: path.dirname(editor.getPath()) },
    });
    expect(warningText()).toBe("");
  });

  it("never launches after the Tools activation ends during save", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    let finishSave;
    spyOn(editor, "save").and.returnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const running = lens.execute();
    await lumine.packages.deactivatePackage("sofistik-tools");
    finishSave();
    await running;
    expect(launch).not.toHaveBeenCalled();
    await lens.execute();
    expect(launch).not.toHaveBeenCalled();
  });

  it("never launches if inline actions are disabled for this grammar during save", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    let finishSave;
    spyOn(editor, "save").and.returnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const running = lens.execute();
    lumine.config.set("sofistik-tools.inlineActions", false, { scopeSelector: ".source.sofistik" });
    finishSave();
    await running;
    expect(launch).not.toHaveBeenCalled();
    expect(main.getApplicationPath).not.toHaveBeenCalled();
  });

  it("keeps a pending Run cancelled after toggling off and back on during save", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    let finishSave;
    spyOn(editor, "save").and.returnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const running = lens.execute();
    lumine.config.set("sofistik-tools.inlineActions", false);
    lumine.config.set("sofistik-tools.inlineActions", true);
    finishSave();
    await running;
    expect(launch).not.toHaveBeenCalled();
    expect(main.getApplicationPath).not.toHaveBeenCalled();
  });

  it("propagates a failed save without launching", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    const lens = (await provider.codeLenses(editor))[0];
    spyOn(editor, "save").and.rejectWith(new Error("Save refused"));
    await expectAsync(lens.execute()).toBeRejectedWithError("Save refused");
    expect(launch).not.toHaveBeenCalled();
  });

  it("explains why an untitled buffer cannot run", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n", false);
    await (await provider.codeLenses(editor))[0].execute();
    expect(launch).not.toHaveBeenCalled();
    expect(warningText()).toContain("Save this file before running");
  });

  it("refuses the only-children directive", async () => {
    const editor = await openEditor("@ only-children\n+PROG AQUA\nEND\n");
    await (await provider.codeLenses(editor))[0].execute();
    expect(launch).not.toHaveBeenCalled();
    expect(warningText()).toContain("@ only-children");
  });

  it("uses the existing missing-installation notification without attempting a process", async () => {
    const editor = await openEditor("+PROG AQUA\nEND\n");
    main.getApplicationPath.and.callFake(() => {
      lumine.notifications.addError("SOFiSTiK 2026 is not installed.");
      return undefined;
    });
    await (await provider.codeLenses(editor))[0].execute();
    expect(launch).not.toHaveBeenCalled();
    expect(warningText()).toContain("is not installed");
  });
});
