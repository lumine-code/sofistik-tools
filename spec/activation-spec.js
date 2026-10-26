const path = require("path");

const PACKAGE_NAME = "sofistik-tools";
const PACKAGE_PATH = path.join(__dirname, "..");

describe("sofistik-tools bootstrap activation", () => {
  let pack, mainModule, workspaceElement;

  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    pack = await lumine.packages.startPackage(PACKAGE_PATH);
    mainModule = pack.mainModule;
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
  });

  it("keeps environment, datasets and list models out of bootstrap", () => {
    expect(lumine.packages.getPackageLifecycleState(PACKAGE_NAME)).toBe("active");
    expect(mainModule.runtime).toBeNull();
    mainModule.provideCodeLens();
    expect(mainModule.runtime).toBeNull();
  });

  it("keeps source context, actions and document parsing unloaded during bootstrap", () => {
    mainModule.provideCodeLens();
    for (const filename of ["command-context.js", "program-actions.js", "document-structure.js"]) {
      expect(require.cache[path.join(pack.path, "lib", filename)])
        .withContext(`${filename} should load when a supported source action needs it`)
        .toBeUndefined();
    }
  });

  it("registers list openers synchronously and keeps cache commands local", () => {
    const commands = lumine.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);

    expect(commands).toContain("sofistik-tools:toggle-help");
    expect(commands).not.toContain("sofistik-tools:cache-help");
    expect(commands).toContain("sofistik-tools:toggle-examples");
    expect(commands).not.toContain("sofistik-tools:cache-examples");
    expect(commands).toContain("sofistik-tools:change-version");
    expect(commands).not.toContain("sofistik-tools:program-all-toggle");
    expect(commands).not.toContain("sofistik-tools:clean-1");
  });
  it("dispatches a shared surface command once from an editor nested in a tree", async () => {
    const tree = document.createElement("div");
    tree.className = "tree-view";
    const editor = lumine.workspace.buildTextEditor();
    tree.appendChild(editor.element);
    workspaceElement.appendChild(tree);
    const showVersion = jasmine.createSpy("show version");
    spyOn(mainModule, "ensureRuntime").and.resolveTo({
      operation: () => ({ showVersionFromContext: showVersion }),
    });
    try {
      await lumine.commands.dispatch(editor.element, "sofistik-tools:check-version");
      expect(showVersion).toHaveBeenCalledTimes(1);
    } finally {
      editor.destroy();
      tree.remove();
    }
  });
  it("keeps source mutations out of read-only editors while retaining read operations", async () => {
    const language = await lumine.packages.activatePackage(
      path.join(__dirname, "..", "..", "language-sofistik"),
    );
    await language.resourceLoadPromise;
    const editor = lumine.workspace.buildTextEditor();
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.sofistik"));
    editor.setText("+PROG AQUA\nEND\n");
    editor.setReadOnly(true);
    try {
      for (const command of ["program-current-toggle", "program-all-off", "clear-urs-tags"])
        expect(lumine.commands.canDispatch(editor.element, `sofistik-tools:${command}`)).toBe(
          false,
        );
      expect(lumine.commands.canDispatch(editor.element, "sofistik-tools:current-help")).toBe(true);
      expect(lumine.commands.canDispatch(editor.element, "sofistik-tools:calculation-wps")).toBe(
        true,
      );
      lumine.commands.dispatch(editor.element, "sofistik-tools:program-all-off");
      expect(editor.getText()).toBe("+PROG AQUA\nEND\n");
    } finally {
      editor.destroy();
    }
  });

  for (const { command, property } of [
    { command: "sofistik-tools:toggle-help", property: "helpList" },
    { command: "sofistik-tools:toggle-examples", property: "exampleList" },
    { command: "sofistik-tools:change-version", property: "versionList" },
  ]) {
    it(`materializes only ${property} when ${command} is used and reuses it`, async () => {
      if (property !== "versionList") {
        spyOn(await mainModule.ensureRuntime(), "getSofPath").and.returnValue(undefined);
      }

      await lumine.commands.dispatch(workspaceElement, command);

      const requested = mainModule.runtime[property];
      const firstHost = requested.selectListHost;
      expect(firstHost).not.toBeNull();
      expect(firstHost.isVisible()).toBe(true);
      for (const other of ["helpList", "exampleList", "versionList"]) {
        if (other !== property) expect(mainModule.runtime[other].selectListHost).toBeNull();
      }

      await lumine.commands.dispatch(workspaceElement, command);
      expect(requested.selectListHost).toBe(firstHost);
      expect(firstHost.isVisible()).toBe(false);
    });
  }

  it("does not handle cache commands from the workspace", () => {
    expect(lumine.commands.dispatch(workspaceElement, "sofistik-tools:cache-help")).toBeNull();
    expect(lumine.commands.dispatch(workspaceElement, "sofistik-tools:cache-examples")).toBeNull();
    expect(mainModule.runtime).toBeNull();
  });

  it("deactivates both before and after a list has been materialized", async () => {
    await expectAsync(lumine.packages.deactivatePackage(PACKAGE_NAME)).toBeResolved();

    await lumine.packages.activatePackage(PACKAGE_NAME);
    mainModule = pack.mainModule;
    await lumine.commands.dispatch(workspaceElement, "sofistik-tools:change-version");
    const host = mainModule.runtime.versionList.selectListHost;
    const retiredRuntime = mainModule.runtime;

    await expectAsync(lumine.packages.deactivatePackage(PACKAGE_NAME)).toBeResolved();
    expect(host.isDestroyed()).toBe(true);
    expect(retiredRuntime.versionList.selectListHost).toBeNull();
    expect(retiredRuntime.versionList.selectList).toBeNull();
  });
});
