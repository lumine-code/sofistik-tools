const fs = require("fs");
const os = require("os");
const path = require("path");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SOURCE = [
  "$ Programs",
  "+PROG ASE",
  "HEAD 'First'",
  "GRP NO 1 VAL FULL",
  "END",
  "",
  "+PROG AQUA",
  "HEAD 'Second'",
  "MAT NO 1 TYPE C",
  "END",
  "",
].join("\n");

async function waitFor(check, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

describe("SOFiSTiK Run links in the code-lens frontend", () => {
  let tools, frontend, editor, directory, filePath, processSpy, runSpy, editors, otherPane, timeout;

  beforeAll(() => {
    timeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = timeout;
  });

  const companionPath = (name) =>
    lumine.packages.resolvePackagePath(name) || path.resolve(PACKAGE_ROOT, "..", name);
  const state = () => frontend.manager.states.get(editor);
  const rows = () => [...(state()?.rows.keys() || [])].sort((left, right) => left - right);
  const link = (row) => state()?.rows.get(row)?.item.querySelector("a");
  const click = (anchor) =>
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

  function stubNativeLaunch() {
    spyOn(tools, "getSofPath").and.returnValue(path.join(directory, "installation"));
    processSpy = spyOn(tools, "createCalculationProcess").and.returnValue({ kill() {} });
    runSpy = spyOn(tools, "runProgramAt").and.callThrough();
  }

  beforeEach(async () => {
    jasmine.useRealClock();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-run-links-"));
    editors = [];
    otherPane = null;
    for (const name of ["sofistik-tools", "code-lens"])
      if (lumine.packages.isPackageLoaded(name)) await lumine.packages.unloadPackage(name);

    const workspace = lumine.views.getView(lumine.workspace);
    workspace.style.width = "1000px";
    workspace.style.height = "500px";
    jasmine.attachToDOM(workspace);
    await lumine.packages.activatePackage(companionPath("language-sofistik"));
    frontend = (await lumine.packages.activatePackage(companionPath("code-lens"))).mainModule;
    lumine.config.set("code-lens.enabled", true);
    tools = (await lumine.packages.activatePackage(PACKAGE_ROOT)).mainModule;
    stubNativeLaunch();

    filePath = path.join(directory, "model.dat");
    fs.writeFileSync(filePath, SOURCE);
    editor = await lumine.workspace.open(filePath);
    editors.push(editor);
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.sofistik"));
    const languageMode = editor.getBuffer().getLanguageMode();
    await languageMode.ready;
    await languageMode.atTransactionEnd();
    await waitFor(() => rows().join(",") === "1,6", "Run links for both programs");
  });

  afterEach(async () => {
    for (const open of editors) if (!open.isDestroyed()) open.destroy();
    if (otherPane && !otherPane.isDestroyed()) otherPane.destroy();
    for (const name of ["sofistik-tools", "code-lens"])
      if (lumine.packages.isPackageLoaded(name)) await lumine.packages.unloadPackage(name);
    lumine.config.unset("code-lens.enabled");
    if (path.dirname(directory) !== os.tmpdir()) throw new Error("Unexpected fixture directory");
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("registers the real provider and renders an actionable Run link above each +PROG", () => {
    const provider = tools.provideCodeLens();
    expect(frontend.manager.registry.providers).toContain(provider);
    expect(rows()).toEqual([1, 6]);
    for (const row of rows()) {
      const entry = state().rows.get(row);
      expect(entry.marker.getStartBufferPosition().row).toBe(row);
      expect(entry.decoration.getProperties().type).toBe("block");
      expect(entry.decoration.getProperties().position).toBe("before");
      expect(link(row).textContent).toBe("Run");
      expect(link(row).classList.contains("code-lens-inert")).toBe(false);
      expect(editor.getElement().contains(link(row))).toBe(true);
    }
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("refreshes program rows after edits without starting calculations or running a stale link", async () => {
    const staleLink = link(1);
    editor.getBuffer().insert([0, 0], "$ Inserted\n");
    click(staleLink);
    await waitFor(() => runSpy.calls.count() === 1, "the guarded stale Run action");
    await runSpy.calls.mostRecent().returnValue;
    await waitFor(() => rows().join(",") === "2,7", "refreshed program rows");
    expect(processSpy).not.toHaveBeenCalled();
    expect(link(2).textContent).toBe("Run");

    click(link(2));
    await waitFor(() => runSpy.calls.count() === 2, "the refreshed Run action");
    await runSpy.calls.mostRecent().returnValue;
    expect(processSpy.calls.count()).toBe(1);
    expect(fs.readFileSync(filePath, "utf8")).toBe(editor.getText());
    if (processSpy.calls.count())
      expect(processSpy.calls.mostRecent().args[0].args).toEqual([filePath, "-run:3", "-e"]);
  });

  it("runs the clicked program in its captured editor while another pane and program have focus", async () => {
    editor.setCursorBufferPosition([7, 4]);
    const cursor = editor.getCursorBufferPosition().toArray();
    const sourcePane = lumine.workspace.paneForItem(editor);
    otherPane = sourcePane.splitRight({ copyActiveItem: false });
    otherPane.activate();
    const otherPath = path.join(directory, "other.dat");
    fs.writeFileSync(otherPath, "+PROG ASE\nEND\n");
    const other = await lumine.workspace.open(otherPath);
    editors.push(other);
    expect(lumine.workspace.getActiveTextEditor()).toBe(other);
    expect(editor.getElement().contains(link(1))).toBe(true);
    click(link(1));

    await waitFor(() => runSpy.calls.count() === 1, "Run from the clicked link");
    await runSpy.calls.mostRecent().returnValue;
    expect(processSpy.calls.count()).toBe(1);
    if (!processSpy.calls.count()) return;
    const launch = processSpy.calls.mostRecent().args[0];
    expect(launch.command).toBe(path.join(directory, "installation", "wps.exe"));
    expect(launch.args).toEqual([filePath, "-run:2", "-e"]);
    expect(launch.options.cwd).toBe(directory);
    expect(editor.getCursorBufferPosition().toArray()).toEqual(cursor);
    expect(lumine.workspace.getActiveTextEditor()).toBe(other);
  });

  it("removes links when the provider unloads and reacquires a fresh package generation", async () => {
    const previousMain = tools;
    const previousProvider = tools.provideCodeLens();
    await lumine.packages.unloadPackage("sofistik-tools");
    await waitFor(() => rows().length === 0, "provider links to be removed");
    expect(frontend.manager.registry.providers).not.toContain(previousProvider);
    expect(editor.getElement().querySelectorAll(".code-lens").length).toBe(0);

    tools = (await lumine.packages.activatePackage(PACKAGE_ROOT)).mainModule;
    stubNativeLaunch();
    expect(tools).not.toBe(previousMain);
    expect(tools.provideCodeLens()).not.toBe(previousProvider);
    await waitFor(() => rows().join(",") === "1,6", "the fresh provider's links");
    expect(frontend.manager.registry.providers).toContain(tools.provideCodeLens());
    expect(processSpy).not.toHaveBeenCalled();
  });
});
