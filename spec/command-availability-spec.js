const path = require("node:path");
describe("SOFiSTiK source command scope", () => {
  let main, editor;
  beforeEach(async () => {
    await lumine.packages.activatePackage(path.resolve(__dirname, "../../language-sofistik"));
    main = (await lumine.packages.activatePackage("sofistik-tools")).mainModule;
    editor = await lumine.workspace.open();
    jasmine.attachToDOM(lumine.workspace.getElement());
  });
  it("only advertises CADINP source changes for a writable CADINP editor", () => {
    const target = editor.getElement();
    const command = "sofistik-tools:program-all-toggle";
    expect(lumine.commands.canDispatch(target, command)).toBe(false);
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.sofistik"));
    target.component.updateSync();
    const load = spyOn(main, "ensureRuntime").and.throwError("Availability must stay cold");
    const read = spyOn(editor, "getText").and.throwError("Availability must not scan source");
    expect(lumine.commands.canDispatch(target, command)).toBe(true);
    editor.setReadOnly(true);
    target.component.updateSync();
    expect(lumine.commands.canDispatch(target, command)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
