const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MODULES = {
  AQUA: "CONC",
  SOFIMSHC: "SPTP",
  SOFILOAD: "LC",
  DECREATOR: "DSID",
  TENDON: "AXES",
};
const INCLUDES = [
  ["aqa.include", "AQUA"],
  ["msh.include", "SOFIMSHC"],
  ["lfd.include", "SOFILOAD"],
  ["dsn.include", "DECREATOR"],
  ["spt.include", "TENDON"],
  ["tnd.include", "TENDON"],
];

describe("SOFiSTiK include help", () => {
  let runtime, directory, workspaceElement, editors;

  async function settle(editor) {
    const mode = editor.getBuffer().getLanguageMode();
    await mode.ready;
    await mode.atTransactionEnd();
  }

  async function openSource(name, text) {
    const editor = await lumine.workspace.open(path.join(directory, name));
    editors.push(editor);
    editor.setText(text);
    await settle(editor);
    return editor;
  }

  function calls() {
    return runtime.getViewer.calls.allArgs().map(([filePath, destination, reuse]) => ({
      manual: path.basename(filePath),
      destination,
      reuse,
    }));
  }

  beforeEach(async () => {
    editors = [];
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-include-help-"));
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    await lumine.packages.activatePackage(path.join(__dirname, "..", "..", "language-sofistik"));
    const pack = await lumine.packages.activatePackage("sofistik-tools");
    runtime = pack.mainModule.ensureRuntime();
    runtime.environmentProvider = {
      resolve: () => ({ version: "2026", language: "en" }),
    };
    runtime.dataProvider = {
      forRelease: () => ({ getModuleCommands: (module) => [MODULES[module]].filter(Boolean) }),
    };
    for (const module of Object.keys(MODULES)) {
      fs.writeFileSync(path.join(directory, `${module.toLowerCase()}_1.pdf`), "manual");
    }
    spyOn(runtime, "getSofPath").and.returnValue(directory);
    spyOn(runtime, "getViewer");
  });

  afterEach(() => {
    for (const editor of editors) editor.destroy();
    runtime.environmentProvider = null;
    runtime.dataProvider = null;
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  for (const [filename, module] of INCLUDES) {
    it(`dispatches both help commands for ${filename} without a PROG header`, async () => {
      const editor = await openSource(filename, `${MODULES[module]} 1\n`);
      expect(editor.getGrammar().scopeName).toBe(`source.sofistik.include.${module.toLowerCase()}`);
      editor.setCursorBufferPosition([0, Infinity]);
      const element = lumine.views.getView(editor);

      await lumine.commands.dispatch(element, "sofistik-tools:current-help");
      await lumine.commands.dispatch(workspaceElement, "sofistik-tools:separately-help");

      expect(calls()).toEqual([
        { manual: `${module.toLowerCase()}_1.pdf`, destination: MODULES[module], reuse: true },
        { manual: `${module.toLowerCase()}_1.pdf`, destination: MODULES[module], reuse: false },
      ]);
    });
  }

  for (const header of ["+PROG SOFILOAD", "$PROG SOFILOAD", "-PROG SOFILOAD"]) {
    it(`uses ${header} over the initial include module`, async () => {
      const editor = await openSource("aqa.include", `CONC 1\nEND\n${header}\nLC 1\nEND\n`);
      editor.setCursorBufferPosition([3, Infinity]);

      runtime.currentHelp(1);

      expect(calls()).toEqual([{ manual: "sofiload_1.pdf", destination: "LC", reuse: true }]);
    });
  }

  it("does not borrow a command from before an overriding module header", async () => {
    const editor = await openSource("aqa.include", "CONC 1\nEND\n$PROG SOFILOAD\n\n");
    editor.setCursorBufferPosition([3, 0]);

    runtime.currentHelp(1);

    expect(calls()).toEqual([{ manual: "sofiload_1.pdf", destination: null, reuse: true }]);
  });

  for (const directive of ["SYS echo test", "APPLY other.dat", "+PROG", "$PROG $(module)"]) {
    it(`does not reuse the include module after ${directive}`, async () => {
      const editor = await openSource("aqa.include", `CONC 1\nEND\n${directive}\nCONC 2\n`);
      editor.setCursorBufferPosition([3, Infinity]);
      const warning = spyOn(lumine.notifications, "addWarning");

      runtime.currentHelp(1);

      expect(runtime.getViewer).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith("No applicable SOFiSTiK module above the cursor");
    });
  }

  it("does not replace an unknown explicit module with the include module", async () => {
    const editor = await openSource("aqa.include", "+PROG UNKNOWN\nEND\nCONC 1\n");
    editor.setCursorBufferPosition([2, Infinity]);
    const warning = spyOn(lumine.notifications, "addWarning");

    runtime.currentHelp(1);

    expect(runtime.getViewer).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('Cannot find the manual for program "UNKNOWN"');
  });

  it("keeps the initial module across repeated END records and CHAPTER headings", async () => {
    const editor = await openSource("aqa.include", "CONC 1\nEND\nEND\nCHAPTER Heading\n\n");
    editor.setCursorBufferPosition([4, 0]);

    runtime.currentHelp(1);

    expect(calls()).toEqual([{ manual: "aqua_1.pdf", destination: "CONC", reuse: true }]);
  });

  it("ignores directives and commands in comments, quoted prose and macros", async () => {
    const editor = await openSource(
      "aqa.include",
      "CONC 1\n$ +PROG SOFILOAD\nHEAD '; CONC 2; +PROG SOFILOAD'\n" +
        "#DEFINE hidden\n+PROG SOFILOAD\n#ENDDEF\n! ignored; CONC 3\n\n",
    );
    editor.setCursorBufferPosition([7, 0]);

    runtime.currentHelp(1);

    expect(calls()).toEqual([{ manual: "aqua_1.pdf", destination: "CONC", reuse: true }]);
  });

  it("uses the clicked source editor when another editor has focus", async () => {
    const source = await openSource("aqa.include", "CONC 1\n");
    source.setCursorBufferPosition([0, Infinity]);
    const other = await openSource("lfd.include", "LC 1\n");
    other.setCursorBufferPosition([0, Infinity]);
    const lookup = spyOn(runtime, "resolveEnvironment").and.callThrough();

    await lumine.commands.dispatch(lumine.views.getView(source), "sofistik-tools:current-help");

    expect(calls()).toEqual([{ manual: "aqua_1.pdf", destination: "CONC", reuse: true }]);
    expect(lookup.calls.mostRecent().args).toEqual([undefined, source.getPath(), source]);
  });

  it("follows grammar selection after a file rename and subsequent source edit", async () => {
    const editor = await openSource("aqa.include", "CONC 1\n");
    editor.getBuffer().setPath(path.join(directory, "lfd.include"));
    editor.setText("LC 1\n");
    await settle(editor);
    expect(editor.getGrammar().scopeName).toBe("source.sofistik.include.sofiload");
    editor.setCursorBufferPosition([0, Infinity]);

    runtime.currentHelp(1);

    expect(calls()).toEqual([{ manual: "sofiload_1.pdf", destination: "LC", reuse: true }]);
  });

  it("keeps calculation and program editing commands guarded on include grammars", async () => {
    const editor = await openSource("aqa.include", "+PROG AQUA\nEND\n");
    const calculate = spyOn(runtime, "runCalc");
    const changePrograms = spyOn(runtime, "changeProgs");
    const warning = spyOn(lumine.notifications, "addWarning");
    const element = lumine.views.getView(editor);

    await lumine.commands.dispatch(element, "sofistik-tools:calculation-wps");
    await lumine.commands.dispatch(element, "sofistik-tools:program-all-toggle");

    expect(calculate).not.toHaveBeenCalled();
    expect(changePrograms).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("+PROG AQUA\nEND\n");
    expect(warning.calls.count()).toBe(2);
  });

  it("refuses a generic include file with no declared module", async () => {
    const editor = await openSource("other.include", "CONC 1\n");
    expect(editor.getGrammar().scopeName).toBe("source.sofistik");
    editor.setCursorBufferPosition([0, Infinity]);
    const warning = spyOn(lumine.notifications, "addWarning");

    await lumine.commands.dispatch(lumine.views.getView(editor), "sofistik-tools:current-help");

    expect(runtime.getViewer).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith("No applicable SOFiSTiK module above the cursor");
  });
});
