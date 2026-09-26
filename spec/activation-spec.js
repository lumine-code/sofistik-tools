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

  it("keeps all select-list models out of activation", () => {
    expect(lumine.packages.getPackageLifecycleState(PACKAGE_NAME)).toBe("active");
    for (const list of [mainModule.helpList, mainModule.exampleList, mainModule.versionList]) {
      expect(list.selectListHost).toBeNull();
      expect(list.selectList).toBeNull();
    }
  });

  it("registers the list commands synchronously", () => {
    const commands = lumine.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);

    expect(commands).toContain("sofistik-tools:toggle-help");
    expect(commands).toContain("sofistik-tools:cache-help");
    expect(commands).toContain("sofistik-tools:toggle-examples");
    expect(commands).toContain("sofistik-tools:cache-examples");
    expect(commands).toContain("sofistik-tools:change-version");
  });

  for (const { command, property } of [
    { command: "sofistik-tools:toggle-help", property: "helpList" },
    { command: "sofistik-tools:toggle-examples", property: "exampleList" },
    { command: "sofistik-tools:change-version", property: "versionList" },
  ]) {
    it(`materializes only ${property} when ${command} is used and reuses it`, async () => {
      if (property !== "versionList") {
        spyOn(mainModule, "ensureEnvironment").and.resolveTo(null);
        spyOn(mainModule, "getSofPath").and.returnValue(undefined);
      }

      await lumine.commands.dispatch(workspaceElement, command);

      const requested = mainModule[property];
      const firstHost = requested.selectListHost;
      expect(firstHost).not.toBeNull();
      expect(firstHost.isVisible()).toBe(true);
      for (const other of ["helpList", "exampleList", "versionList"]) {
        if (other !== property) expect(mainModule[other].selectListHost).toBeNull();
      }

      await lumine.commands.dispatch(workspaceElement, command);
      expect(requested.selectListHost).toBe(firstHost);
      expect(firstHost.isVisible()).toBe(false);
    });
  }

  it("does not materialize a list when its hidden cache is refreshed", async () => {
    spyOn(mainModule, "ensureEnvironment").and.resolveTo(null);
    spyOn(mainModule, "getSofPath").and.returnValue(undefined);

    await lumine.commands.dispatch(workspaceElement, "sofistik-tools:cache-help");
    await lumine.commands.dispatch(workspaceElement, "sofistik-tools:cache-examples");

    expect(mainModule.helpList.selectListHost).toBeNull();
    expect(mainModule.exampleList.selectListHost).toBeNull();
  });

  it("deactivates both before and after a list has been materialized", async () => {
    await expectAsync(lumine.packages.deactivatePackage(PACKAGE_NAME)).toBeResolved();

    await lumine.packages.activatePackage(PACKAGE_NAME);
    mainModule = pack.mainModule;
    await lumine.commands.dispatch(workspaceElement, "sofistik-tools:change-version");
    const host = mainModule.versionList.selectListHost;

    await expectAsync(lumine.packages.deactivatePackage(PACKAGE_NAME)).toBeResolved();
    expect(host.isDestroyed()).toBe(true);
    expect(mainModule.versionList.selectListHost).toBeNull();
    expect(mainModule.versionList.selectList).toBeNull();
  });
});
