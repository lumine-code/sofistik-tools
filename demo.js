// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-sofistik", "code-lens"],
  viewport: { width: 1100, height: 660 },
  async before() {},
  async prepare(context) {
    const { lumine, state, open } = context;
    state.editor = await open("example.dat");

    lumine.grammars.assignLanguageMode(state.editor.getBuffer(), "source.sofistik");
    await state.editor.getBuffer().getLanguageMode().ready;
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Toggle individual SOFiSTiK program blocks and see their inline Run actions.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          state.editor.setCursorBufferPosition([5, 0]);
          lumine.commands.dispatch(
            lumine.views.getView(state.editor),
            "sofistik-tools:program-current-toggle",
          );
        }
      },
      ready(context) {
        const { state } = context;
        return Boolean(state.editor.getText().includes("-PROG"));
      },
    },
  ],
  async cleanup() {},
};
