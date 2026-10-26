function syntaxUnavailable(editor) {
  return (
    editor.getGrammar?.() === lumine.grammars.nullGrammar ||
    editor.getSyntaxAvailability?.()?.available === false ||
    Boolean(editor.getBuffer?.()?.getLanguageMode?.()?.error)
  );
}

module.exports = { syntaxUnavailable };
