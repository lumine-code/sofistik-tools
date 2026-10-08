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

  it("registers list openers synchronously and keeps cache commands local", () => {
    const commands = lumine.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);

    expect(commands).toContain("sofistik-tools:toggle-help");
    expect(commands).not.toContain("sofistik-tools:cache-help");
    expect(commands).toContain("sofistik-tools:toggle-examples");
    expect(commands).not.toContain("sofistik-tools:cache-examples");
    expect(commands).toContain("sofistik-tools:change-version");
  });

  for (const { command, property } of [
    { command: "sofistik-tools:toggle-help", property: "helpList" },
    { command: "sofistik-tools:toggle-examples", property: "exampleList" },
    { command: "sofistik-tools:change-version", property: "versionList" },
  ]) {
    it(`materializes only ${property} when ${command} is used and reuses it`, async () => {
      if (property !== "versionList") {
        spyOn(mainModule.ensureRuntime(), "getSofPath").and.returnValue(undefined);
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

    await expectAsync(lumine.packages.deactivatePackage(PACKAGE_NAME)).toBeResolved();
    expect(host.isDestroyed()).toBe(true);
    expect(mainModule.runtime.versionList.selectListHost).toBeNull();
    expect(mainModule.runtime.versionList.selectList).toBeNull();
  });
});
