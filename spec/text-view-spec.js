const TextView = require("../lib/text-view");

describe("TextView", () => {
  let textView;

  beforeEach(() => {
    jasmine.attachToDOM(lumine.workspace.getElement());
  });

  afterEach(() => {
    textView?.close();
  });

  it("presents its modal and confirms the selected text", () => {
    const selected = jasmine.createSpy("selected");
    textView = new TextView("*.cdb", true, "icon-search", "Pattern");

    textView.attach(selected);

    expect(textView.miniEditor.element.contains(document.activeElement)).toBe(true);

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
});
