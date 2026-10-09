describe("SOFiSTiK service and command lifetime", () => {
  let main, hub, consumers, providers, extra, external;
  const definitions = [
    ["tree-view.selection", "consumeTreeViewSelection", "treeView"],
    ["pdf-view", "consumePdfView", "pdfViewService"],
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
  for (const [name, method, field] of definitions) {
    it(`keeps shared ${name} payload while one actual Hub edge remains`, () => {
      const first = hub.consume(name, "^1.0.0", (payload) => main[method](payload));
      consumers.push(first);
      const payload = {};
      providers.push(hub.provide(name, "1.0.0", payload));
      consumers.push(hub.consume(name, "^1.0.0", (value) => main[method](value)));
      first.dispose();
      expect(main[field]).toBe(payload);
    });
    it(`restores the last surviving ${name} edge in actual A-B-A order`, () => {
      consumers.push(hub.consume(name, "^1.0.0", (payload) => main[method](payload)));
      const a = {},
        b = {};
      providers.push(hub.provide(name, "1.0.0", a), hub.provide(name, "1.0.0", b));
      const newest = hub.provide(name, "1.0.0", a);
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
  it("does not recreate a native help picker from a copied retired Core command handler", () => {
    const runtime = main.ensureRuntime();
    spyOn(runtime, "resolveEnvironment").and.returnValue(null);
    const create = spyOn(lumine.workspace, "addSelectList").and.callThrough();
    extra.push(
      lumine.commands.add("lumine-workspace", "sofistik-tools:toggle-help", () =>
        main.deactivate(),
      ),
    );
    lumine.commands.dispatch(lumine.workspace.getElement(), "sofistik-tools:toggle-help");
    expect(create).not.toHaveBeenCalled();
  });
  it("does not create a picker after actual tree selection delivery retires the command owner", () => {
    const runtime = main.ensureRuntime();
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
    lumine.commands.dispatch(lumine.workspace.getElement(), "sofistik-tools:toggle-help");
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
