const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompositeDisposable } = require("lumine");

describe("SOFiSTiK versioned path openers", () => {
  let main, directory, resolver, registrations, leases, launch;

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-path-openers-"));
    leases = new CompositeDisposable();
    main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule;
    main.pathOpeners.dispose();
    main.pathOpeners = null;
    const { SofistikContextResolver } = require("@lumine-code/sofistik-context");
    resolver = new SofistikContextResolver({ root: path.join(directory, "installed") });
    registrations = spyOn(lumine.workspace, "addPathOpener").and.callThrough();
    launch = spyOn(lumine.shell, "openApplication").and.resolveTo(4242);
    spyOn(lumine.shell, "openPath").and.resolveTo("");
    spyOn(lumine.application, "openWindow").and.resolveTo();
  });

  afterEach(async () => {
    leases.dispose();
    await lumine.packages.deactivatePackage("launcher");
    await lumine.packages.deactivatePackage("sofistik-tools");
    await lumine.packages.deactivatePackage("open-external");
    await lumine.fileWatchClient.settlePendingTeardown();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  function install(version, applications = ["animator.exe"]) {
    const installPath = path.join(directory, "installed", version, `SOFiSTiK ${version}`);
    fs.mkdirSync(installPath, { recursive: true });
    for (const name of ["wps.exe", ...applications])
      fs.writeFileSync(path.join(installPath, name), "");
    return installPath;
  }

  function source(extension = ".cdb") {
    const filePath = path.join(directory, `model${extension}`);
    fs.writeFileSync(filePath, "");
    return filePath;
  }

  function register() {
    main.pathOpeners = new (require("../lib/path-openers"))(main, { resolver });
    return registrations.calls.allArgs().map(([descriptor]) => descriptor);
  }

  function choices(filePath, options = {}) {
    return lumine.workspace
      .getAvailablePathOpeners(filePath, options)
      .filter(({ id }) => id.startsWith("sofistik-tools:"));
  }

  it("lists only installed releases and executable applications without loading the runtime", () => {
    install("2018", ["animator.exe", "fea_viewer.exe"]);
    install("2020", ["fea_viewer.exe"]);
    install("2026", ["animator.exe", "viewer.exe", "dbinfo_ng.exe"]);
    const incomplete = path.join(directory, "installed", "2025", "SOFiSTiK 2025");
    fs.mkdirSync(incomplete, { recursive: true });
    fs.writeFileSync(path.join(incomplete, "animator.exe"), "");
    register();

    expect(choices(source()).map(({ label }) => label)).toEqual(
      jasmine.arrayWithExactContents([
        "Animator 2018",
        "FEA Viewer 2020",
        "Animator 2026",
        "Viewer 2026",
        "DBInfo 2026",
      ]),
    );
    expect(main.runtime).toBeNull();
  });

  it("offers each native file type and preserves the SOFiPLUS companion-file condition", () => {
    install("2026", [
      "ted.exe",
      "wingraf.exe",
      "ursula.exe",
      "ssd.exe",
      "resultviewer.exe",
      "sofiplus_launcher.exe",
    ]);
    register();
    for (const [extension, labels] of [
      [".dat", ["Teddy 2026"]],
      [".gra", ["Teddy 2026", "WinGRAF 2026"]],
      [".plb", ["Report Viewer 2026"]],
      [".sofistik", ["SSD 2026"]],
      [".results", ["ResultViewer 2026"]],
    ]) {
      expect(choices(source(extension)).map(({ label }) => label)).toEqual(
        jasmine.arrayWithExactContents(labels),
      );
    }
    const drawing = path.join(directory, "drawing.dwg");
    fs.writeFileSync(drawing, "");
    expect(choices(drawing)).toEqual([]);
    fs.writeFileSync(path.join(directory, "drawing.dat"), "");
    expect(choices(drawing).map(({ label }) => label)).toEqual(["SOFiPLUS 2026"]);
    expect(choices(directory, { pathKind: "directory" })).toEqual([]);
    expect(main.runtime).toBeNull();
  });

  it("launches the exact chosen release independently of the file's definition", async () => {
    const installPath = install("2024");
    install("2026");
    register();
    const filePath = source();
    fs.writeFileSync(path.join(directory, "sofistik.def"), "SOF_VERSION=2026\n");
    const resolve = spyOn(resolver, "resolve").and.throwError(
      "A selected release must not be resolved again",
    );

    expect(
      await lumine.workspace.open(filePath, { opener: "sofistik-tools:animator-2024" }),
    ).toBeUndefined();

    expect(launch).toHaveBeenCalledOnceWith(path.join(installPath, "animator.exe"), [filePath], {
      cwd: directory,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(main.runtime).toBeNull();
    expect(fs.readFileSync(path.join(directory, "sofistik.def"), "utf8")).toBe(
      "SOF_VERSION=2026\n",
    );
  });

  it("keeps real Launcher choices explicit while the open-external service resolves sofistik.def", async () => {
    const automaticInstall = install("2024");
    const explicitInstall = install("2026");
    const descriptors = register();
    const filePath = source();
    fs.writeFileSync(path.join(directory, "sofistik.def"), "SOF_VERSION=2024\n");
    (await main.ensureRuntime()).environmentProvider = resolver;
    lumine.config.set("open-external.flag", true);
    lumine.config.set("open-external.list", ["cdb"]);
    await lumine.packages.activatePackage("open-external");
    await lumine.packages.activatePackage("launcher");
    let launcher, external;
    leases.add(
      lumine.packages.serviceHub.consume("launcher", "^1.0.0", (service) => {
        launcher = service;
      }),
      lumine.packages.serviceHub.consume("open-external", "^1.0.0", (service) => {
        external = service;
      }),
    );
    expect(launcher).toBeDefined();
    expect(external).toBeDefined();
    const host = await launcher.open({
      path: filePath,
      pane: lumine.workspace.getCenter().getActivePane(),
    });
    const available = host.getModel().getItems();
    const versioned = available.filter(({ id }) => id.startsWith("sofistik-tools:"));
    expect(versioned.map(({ label }) => label)).toEqual(
      jasmine.arrayWithExactContents(["Animator 2024", "Animator 2026"]),
    );
    expect(
      versioned.every(
        ({ isDefault, destinations }) =>
          !isDefault && destinations.length === 1 && destinations[0] === "current",
      ),
    ).toBe(true);
    expect(
      descriptors.every((descriptor) => descriptor.isDefaultEligible(filePath) === false),
    ).toBe(true);
    expect(available.find(({ id }) => id === "open-external").isDefault).toBe(true);

    await host.getModel().selectItemById("sofistik-tools:animator-2026");
    await host.getModel().runAction("launcher:open-current");
    expect(launch).toHaveBeenCalledOnceWith(
      path.join(explicitInstall, "animator.exe"),
      [filePath],
      { cwd: directory },
    );

    await external.openExternal(filePath);
    expect(launch.calls.mostRecent().args).toEqual([
      path.join(automaticInstall, "animator.exe"),
      [filePath],
      { cwd: directory },
    ]);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(lumine.shell.openPath).not.toHaveBeenCalled();
  });

  it("hides removed executables and refuses a stale selected opener", async () => {
    const installPath = install("2026");
    const [descriptor] = register();
    const filePath = source();
    expect(choices(filePath).length).toBe(1);
    fs.unlinkSync(path.join(installPath, "animator.exe"));
    expect(choices(filePath)).toEqual([]);
    await expectAsync(descriptor.open(filePath)).toBeRejectedWithError(/no longer available/);
    expect(launch).not.toHaveBeenCalled();
    expect(main.runtime).toBeNull();
  });

  it("reports a rejected explicit launch in the real Launcher without closing the chooser", async () => {
    const installPath = install("2026");
    register();
    const filePath = source();
    launch.and.rejectWith(new Error("SOFiSTiK refused to start"));
    const launcher = (await lumine.packages.activatePackage("launcher")).mainModule;
    const host = await launcher.open({
      target: lumine.workspace.getElement(),
      detail: { path: filePath },
    });
    await host.getModel().selectItemById("sofistik-tools:animator-2026");

    await expectAsync(host.getModel().runAction("launcher:open-current")).toBeRejectedWithError(
      "SOFiSTiK refused to start",
    );

    expect(host.isDestroyed()).toBe(false);
    expect(host.getModel().getStatus().message).toBe("SOFiSTiK refused to start");
    expect(launch).toHaveBeenCalledOnceWith(path.join(installPath, "animator.exe"), [filePath], {
      cwd: directory,
    });
    expect(lumine.shell.openPath).not.toHaveBeenCalled();
  });

  it("keeps a failed automatic external launch claimed and reports its actual error", async () => {
    const installPath = install("2026");
    register();
    const filePath = source();
    (await main.ensureRuntime()).environmentProvider = resolver;
    launch.and.rejectWith(new Error("SOFiSTiK refused to start"));
    const warning = spyOn(lumine.notifications, "addWarning");
    const external = (await lumine.packages.activatePackage("open-external")).mainModule;

    await external.provideOpenExternal().openExternal(filePath);

    expect(launch).toHaveBeenCalledOnceWith(path.join(installPath, "animator.exe"), [filePath], {
      cwd: directory,
    });
    expect(warning).toHaveBeenCalledOnceWith("Cannot open the SOFiSTiK application", {
      detail: `${path.join(installPath, "animator.exe")}\n\nSOFiSTiK refused to start`,
    });
    expect(lumine.shell.openPath).not.toHaveBeenCalled();
  });

  it("removes its registrations and invalidates callbacks when the package unloads", async () => {
    install("2026");
    const [previous] = register();
    const filePath = source();
    await lumine.packages.unloadPackage("sofistik-tools");
    expect(choices(filePath)).toEqual([]);
    expect(previous.canOpen(filePath)).toBe(false);
    expect(await previous.open(filePath)).toBe("");
    main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule;
    main.pathOpeners.dispose();
    register();
    expect(choices(filePath).map(({ id }) => id)).toEqual(["sofistik-tools:animator-2026"]);
    expect(launch).not.toHaveBeenCalled();
  });

  it("replaces the dedicated Animator 2018 command with the installed-release choices", () => {
    const retired = "sofistik-tools:open-animator-2018";
    expect(
      lumine.commands
        .findCommands({ target: lumine.workspace.getElement() })
        .map(({ name }) => name),
    ).not.toContain(retired);
    expect(JSON.stringify(require("../menus/main.json"))).not.toContain(retired);
    expect(fs.readFileSync(path.join(__dirname, "../keymaps/main.json"), "utf8")).not.toContain(
      retired,
    );
  });
});
