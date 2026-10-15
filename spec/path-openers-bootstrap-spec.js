const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

describe("SOFiSTiK path opener discovery ownership", () => {
  let pack, main, directory, discoveryCallback, previousDependencyModules;
  const dependency = path.join(__dirname, "../node_modules/@lumine-code/sofistik-context");
  const dependencyModules = () =>
    Object.values(require.cache).filter(
      (entry) =>
        typeof entry?.filename === "string" && entry.filename.startsWith(dependency + path.sep),
    );
  beforeEach(async () => {
    jasmine.useRealClock();
    if (lumine.packages.isPackageLoaded("sofistik-tools"))
      await lumine.packages.unloadPackage("sofistik-tools");
    previousDependencyModules = dependencyModules();
    directory = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-discovery-")),
    );
    const onWillResolve = lumine.workspace.onWillResolvePathOpeners.bind(lumine.workspace);
    spyOn(lumine.workspace, "onWillResolvePathOpeners").and.callFake((callback) => {
      discoveryCallback = callback;
      return onWillResolve(callback);
    });
    pack = await lumine.packages.activatePackage("sofistik-tools");
    main = pack.mainModule;
  });
  afterEach(async () => {
    await lumine.packages.unloadPackage("sofistik-tools");
    await lumine.fileWatchClient.settlePendingTeardown();
    const resolved = fs.realpathSync.native(directory);
    if (
      path.dirname(resolved) !== fs.realpathSync.native(os.tmpdir()) ||
      !path.basename(resolved).startsWith("sofistik-discovery-")
    )
      throw new Error("SOFiSTiK discovery fixture escaped its temporary root");
    await fs.promises.rm(resolved, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  function fixture() {
    const currentRequire = createRequire(path.join(pack.path, "package.json"));
    const Openers = currentRequire("./lib/path-openers");
    const { SofistikContextResolver } = currentRequire("@lumine-code/sofistik-context");
    const root = path.join(directory, "installed");
    const install = path.join(root, "2026", "SOFiSTiK 2026");
    fs.mkdirSync(install, { recursive: true });
    for (const name of ["wps.exe", "animator.exe"]) fs.writeFileSync(path.join(install, name), "");
    const resolver = new SofistikContextResolver({ root });
    const discover = spyOn(resolver, "getInstalledVersions").and.callThrough();
    const factory = () => new Openers(main, { resolver });
    const create = spyOn(main, "createPathOpeners").and.callFake(factory);
    return { resolver, discover, create, factory };
  }

  const modelPath = () => path.join(directory, "model.cdb");
  const choices = () =>
    lumine.workspace
      .getAvailablePathOpeners(modelPath(), { pathKind: "file" })
      .filter(({ id }) => id.startsWith("sofistik-tools:"));

  it("keeps the resolver and application registrations absent for unrelated paths and directories", () => {
    const modulePath = path.join(pack.path, "lib/path-openers.js");
    const loaded = () =>
      Object.values(require.cache).filter((entry) => typeof entry?.filename === "string");
    const create = spyOn(main, "createPathOpeners").and.callThrough();
    expect(loaded().some(({ filename }) => filename === modulePath)).toBe(false);
    expect(dependencyModules().length).toBe(previousDependencyModules.length);
    for (const entry of dependencyModules())
      expect(previousDependencyModules.includes(entry)).withContext(entry.filename).toBe(true);
    for (const extension of [".js", ".md", ".py"])
      lumine.workspace.getAvailablePathOpeners(path.join(directory, "file" + extension), {
        pathKind: "file",
      });
    lumine.workspace.getAvailablePathOpeners(modelPath(), { pathKind: "directory" });
    expect(create).not.toHaveBeenCalled();
    expect(main.pathOpeners).toBeNull();
    expect(loaded().some(({ filename }) => filename === modulePath)).toBe(false);
    expect(dependencyModules().length).toBe(previousDependencyModules.length);
    for (const entry of dependencyModules())
      expect(previousDependencyModules.includes(entry)).withContext(entry.filename).toBe(true);
  });

  it("discovers installed choices synchronously once at the first matching query", () => {
    const { discover, create } = fixture();
    expect(discover).not.toHaveBeenCalled();
    expect(choices().map(({ label }) => label)).toEqual(["Animator 2026"]);
    expect(choices().map(({ id }) => id)).toEqual(["sofistik-tools:animator-2026"]);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(main.runtime).toBeNull();
  });

  it("supports an explicit version ID before any chooser has enumerated the registry", () => {
    const { discover } = fixture();
    const opener = lumine.workspace.resolvePathOpener(modelPath(), {
      opener: "sofistik-tools:animator-2026",
      pathKind: "file",
    });
    expect(opener.id).toBe("sofistik-tools:animator-2026");
    expect(discover).toHaveBeenCalledTimes(1);
    expect(main.runtime).toBeNull();
  });

  it("does not repeat discovery when a resolver reenters opener enumeration", () => {
    const { resolver, create } = fixture();
    const resolve = resolver.resolve.bind(resolver);
    spyOn(resolver, "resolve").and.callFake((context) => {
      choices();
      return resolve(context);
    });
    expect(choices().map(({ label }) => label)).toEqual(["Animator 2026"]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("permits a clean retry after a failed discovery", () => {
    const { create, factory } = fixture();
    create.and.throwError("SOFiSTiK discovery failed");
    expect(() => choices()).toThrowError("SOFiSTiK discovery failed");
    expect(main.pathOpeners).toBeNull();
    create.and.callFake(factory);
    expect(choices().map(({ label }) => label)).toEqual(["Animator 2026"]);
    expect(main.pathOpeners).not.toBeNull();
  });

  it("retires a registration returned after discovery deactivates its owner", () => {
    fixture();
    const add = lumine.workspace.addPathOpener.bind(lumine.workspace);
    let returned;
    spyOn(lumine.workspace, "addPathOpener").and.callFake((descriptor) => {
      const lease = add(descriptor);
      returned = spyOn(lease, "dispose").and.callThrough();
      main.deactivate();
      return lease;
    });
    expect(choices()).toEqual([]);
    expect(returned).toHaveBeenCalledTimes(1);
    expect(main.pathOpeners).toBeNull();
    expect(main.runtime).toBeNull();
  });

  it("does not let an old discovery callback create a later activation's openers", async () => {
    const previousCallback = discoveryCallback;
    await lumine.packages.deactivatePackage("sofistik-tools");
    pack = await lumine.packages.activatePackage("sofistik-tools");
    main = pack.mainModule;
    const create = spyOn(main, "createPathOpeners").and.callThrough();
    previousCallback({ uri: modelPath(), options: { pathKind: "file" } });
    expect(create).not.toHaveBeenCalled();
    expect(main.pathOpeners).toBeNull();
  });
});
