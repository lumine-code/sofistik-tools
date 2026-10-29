describe("SOFiSTiK service and command lifetime", () => {
  let main, hub, consumers, providers, extra, external;
  const definitions = [
    ["tree-view.selection", "consumeTreeViewSelection", "treeView", "1.0.0"],
    ["pdf-view", "consumePdfView", "pdfViewService", "2.0.0"],
    ["launcher", "consumeLauncher", "launcherService", "1.1.0"],
  ];
  beforeEach(async () => {
    for (const name of ["openPath", "openExternal", "openApplication", "showItemInFolder"])
      spyOn(lumine.shell, name).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    spyOn(require("node:child_process"), "spawn").and.throwError(
      "External program boundary was not controlled",
    );
    spyOn(require("node:child_process"), "execFileSync").and.throwError(
      "External executable lookup was not controlled",
    );
    external = (
      await lumine.packages.activatePackage("open-external")
    ).mainModule.provideOpenExternal();
    main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule;
    hub = new lumine.packages.serviceHub.constructor();
    consumers = [];
    providers = [];
    extra = [];
    jasmine.attachToDOM(lumine.workspace.getElement());
  });
  afterEach(async () => {
    for (const lease of extra) lease.dispose();
    for (const lease of consumers) lease.dispose();
    for (const lease of providers) lease.dispose();
    await lumine.packages.deactivatePackage("sofistik-tools");
    await lumine.packages.deactivatePackage("open-external");
  });
  for (const [name, method, field, version] of definitions) {
    it(`keeps shared ${name} payload while one actual Hub edge remains`, () => {
      const first = hub.consume(name, `^${version}`, (payload) => main[method](payload));
      consumers.push(first);
      const payload = {};
      providers.push(hub.provide(name, version, payload));
      consumers.push(hub.consume(name, `^${version}`, (value) => main[method](value)));
      first.dispose();
      expect(main[field]).toBe(payload);
    });
    it(`restores the last surviving ${name} edge in actual A-B-A order`, () => {
      consumers.push(hub.consume(name, `^${version}`, (payload) => main[method](payload)));
      const a = {},
        b = {};
      providers.push(hub.provide(name, version, a), hub.provide(name, version, b));
      const newest = hub.provide(name, version, a);
      providers.push(newest);
      newest.dispose();
      expect(main[field]).toBe(b);
    });
    it(`protects the reacquired ${name} generation from an old manual lease`, async () => {
      const payload = {};
      const old = main[method](payload);
      await lumine.packages.deactivatePackage("sofistik-tools");
      main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule;
      providers.push(main[method](payload));
      old.dispose();
      expect(main[field]).toBe(payload);
    });
  }
  it("accepts only the PDF service major declared by the package manifest", () => {
    const versions = require("../package.json").consumedServices["pdf-view"].versions;
    for (const [range, method] of Object.entries(versions)) {
      consumers.push(hub.consume("pdf-view", range, (payload) => main[method](payload)));
    }
    providers.push(hub.provide("pdf-view", "1.0.0", {}));
    expect(main.pdfViewService).toBeNull();

    const current = {};
    providers.push(hub.provide("pdf-view", "2.0.0", current));
    expect(main.pdfViewService).toBe(current);
  });
  it("requires the Launcher service version supporting opener overrides", async () => {
    const versions = require("../package.json").consumedServices.launcher.versions;
    for (const [range, method] of Object.entries(versions)) {
      consumers.push(hub.consume("launcher", range, (payload) => main[method](payload)));
    }
    providers.push(hub.provide("launcher", "1.0.0", {}));
    expect(main.launcherService).toBeNull();

    const current = {};
    const provider = hub.provide("launcher", "1.1.0", current);
    providers.push(provider);
    const runtime = await main.ensureRuntime();
    expect(main.launcherService).toBe(current);
    expect(runtime.launcherService).toBe(current);

    provider.dispose();
    expect(main.launcherService).toBeNull();
    expect(runtime.launcherService).toBeNull();
  });
  it("cancels an unfinished PDF help operation when its runtime is disposed", async () => {
    const runtime = await main.ensureRuntime();
    const open = jasmine.createSpy("pending PDF opening").and.callFake((filePath, { signal }) => {
      if (!signal) return Promise.reject(new Error("Missing cancellation signal."));
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    providers.push(main.consumePdfView({ open }));
    const activate = spyOn(lumine.packages, "activatePackage").and.callThrough();
    const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();
    const opening = runtime.getViewer("manual.pdf", "LC", true).then(
      () => ({ resolved: true }),
      (error) => ({ error }),
    );

    expect(open).toHaveBeenCalledTimes(1);
    const signal = open.calls.mostRecent().args[1].signal;
    expect(signal).toBe(runtime.abortController.signal);
    expect(signal?.aborted).toBe(false);

    await lumine.packages.deactivatePackage("sofistik-tools");

    expect(runtime.isActive()).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect((await opening).error).toBe(runtime.abortController.signal.reason);
    expect(activate).not.toHaveBeenCalled();
    expect(workspaceOpen).not.toHaveBeenCalled();
  });
  it("does not recreate a native help picker from a copied retired Core command handler", async () => {
    const runtime = await main.ensureRuntime();
    spyOn(runtime, "resolveEnvironment").and.returnValue(null);
    const create = spyOn(lumine.workspace, "addSelectList").and.callThrough();
    extra.push(
      lumine.commands.add("lumine-workspace", "sofistik-tools:toggle-help", () =>
        main.deactivate(),
      ),
    );
    await lumine.commands.dispatch(lumine.workspace.getElement(), "sofistik-tools:toggle-help");
    expect(create).not.toHaveBeenCalled();
  });
  it("does not create a picker after actual tree selection delivery retires the command owner", async () => {
    const runtime = await main.ensureRuntime();
    spyOn(runtime, "resolveEnvironment").and.returnValue(null);
    providers.push(
      main.consumeTreeViewSelection({
        selectedPaths: () => {
          main.deactivate();
          return [];
        },
      }),
    );
    const create = spyOn(lumine.workspace, "addSelectList").and.callThrough();
    await lumine.commands.dispatch(lumine.workspace.getElement(), "sofistik-tools:toggle-help");
    expect(create).not.toHaveBeenCalled();
  });
  it("retires a manual handler registered through the actual external registry", async () => {
    const lease = main.consumeOpenExternal(external);
    extra.push(lease);
    await lumine.packages.deactivatePackage("sofistik-tools");
    expect(lease.disposed).toBe(true);
  });
  it("disposes a real external registration returned after its owner retires", () => {
    let registration;
    const lease = main.consumeOpenExternal({
      registerHandler(options) {
        registration = external.registerHandler(options);
        main.deactivate();
        return registration;
      },
    });
    extra.push(lease);
    expect(registration.disposed).toBe(true);
  });
});
