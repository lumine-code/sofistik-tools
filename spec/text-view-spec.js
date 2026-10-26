const TextView = require("../lib/text-view");

describe("TextView", () => {
  let textView;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-text");
  });

  afterEach(() => {
    textView?.close();
  });

  it("presents its modal and confirms the selected text", () => {
    const selected = jasmine.createSpy("selected");
    textView = new TextView("*.cdb", true, "icon-search", "Pattern");

    textView.attach(selected);

    expect(textView.miniEditor.element.contains(document.activeElement)).toBe(true);
    expect(textView.miniEditor.getGrammar().scopeName).toBe("text.plain");

    lumine.commands.dispatch(textView.element, "core:confirm");

    expect(selected).toHaveBeenCalledWith("*.cdb");
  });

  it("cleans up when its modal panel is destroyed", () => {
    textView = new TextView("", false, false, "Pattern");
    textView.attach(() => {});

    textView.panel.destroy();

    expect(textView.closed).toBe(true);
    expect(textView.panel).toBeNull();
    expect(textView.miniEditor.isDestroyed()).toBe(true);
  });

  it("keeps an oversized input editable and checks its metadata before confirming", () => {
    const selected = jasmine.createSpy("selected");
    textView = new TextView("x".repeat(65537), false, false, "Pattern");
    textView.attach(selected);
    const read = spyOn(textView.miniEditor, "getText").and.throwError("Oversized input read");
    lumine.commands.dispatch(textView.element, "core:confirm");
    expect(read).not.toHaveBeenCalled();
    expect(selected).not.toHaveBeenCalled();
    expect(textView.closed).not.toBe(true);
    expect(textView.errorMessage.textContent).toContain("64 Ki");
    textView.miniEditor.setText("żółć/😀/*.gra");
    read.and.callThrough();
    lumine.commands.dispatch(textView.element, "core:confirm");
    expect(selected).toHaveBeenCalledWith("żółć/😀/*.gra");
  });
});
