const { TextBuffer } = require("lumine");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("SOFiSTiK immutable source boundaries", () => {
  let directory;
  const source = (text) => TextBuffer.createTextSnapshot(text);
  const plain = { scopeDescriptorForBufferPosition: () => ({ scopes: [] }) };
  const records = (snapshot, context = plain) =>
    [...require("../lib/source-structure").scanSourceDirectives(context, snapshot)].filter(Boolean);
  beforeEach(() => jasmine.useRealClock());
  afterEach(() => {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    directory = null;
  });

  it("scans a line beyond the native string limit without a whole line or document read", async () => {
    let body = source("x".repeat(32768));
    while (body.canMaterialize()) body = body.replace(body.length, body.length, body);
    const snapshot = source("+PROG AQUA\r\n")
      .replace(12, 12, body)
      .replace(12 + body.length, 12 + body.length, "\r\n+PROG ASE URS:9; +SYS echo\r\n");
    const prototype = Object.getPrototypeOf(snapshot);
    const read = prototype.slice;
    spyOn(prototype, "slice").and.callFake(function (start, end) {
      if (end - start > 65536) throw Error("Unbounded source read");
      return read.call(this, start, end);
    });
    spyOn(prototype, "toString").and.throwError("No whole source");
    spyOn(prototype, "lines").and.throwError("No whole line");
    const { collect } = require("../lib/source-traversal");
    const result = await collect(
      require("../lib/source-structure").scanSourceDirectives(plain, snapshot),
      snapshot,
    );
    expect(result.map((record) => [record.kind, record.module, record.row])).toEqual([
      ["PROG", "AQUA", 0],
      ["PROG", "ASE", 2],
      ["SYS", "echo", 2],
    ]);
    expect(result[1].ursRange).toEqual([
      [2, 9],
      [2, 15],
    ]);
  }, 30000);

  it("keeps macro, text, lexical exclusion and nonoverlapping continuation states", () => {
    const text =
      "#DEFINE macro\r\n+PROG HIDDEN\r\n#ENDDEF\r\n<TEXT>\r\n+PROG HIDDEN\r\n</TEXT>\r\nx $$$\r\n+PROG AQUA\r\nTXAB\r\n+PROG HIDDEN\r\nTXEN\r\n+PROG ASE";
    const context = {
      scopeDescriptorForBufferPosition: ([row, column]) => ({
        scopes: row === 6 && column === 2 ? ["string.single"] : [],
      }),
    };
    expect(records(source(text), context).map((record) => record.module)).toEqual(["AQUA", "ASE"]);
    expect(records(source("+PROG AQUA\r+PROG ASE")).map((record) => record.row)).toEqual([0]);
  });

  it("checks identifier metadata before copying and cancels a scan inside one long line", async () => {
    const snapshot = source("+PROG " + "a".repeat(65537));
    const prototype = Object.getPrototypeOf(snapshot);
    const read = prototype.slice;
    spyOn(prototype, "slice").and.callFake(function (start, end) {
      expect(end - start).toBeLessThanOrEqual(65536);
      return read.call(this, start, end);
    });
    expect(() => records(snapshot)).toThrowError(/metadata budget/);
    const controller = new AbortController();
    const large = source(" ".repeat(2 * 1024 * 1024) + "+PROG AQUA");
    let checks = 0;
    const reading = require("../lib/source-traversal").collect(
      require("../lib/source-structure").scanSourceDirectives(plain, large),
      large,
      {
        signal: controller.signal,
        isCurrent: () => {
          if (++checks === 3) controller.abort();
          return true;
        },
      },
    );
    controller.abort();
    expect(await reading).toBeNull();
  });

  it("reads only bounded child paths and manual command tokens around arbitrary source lines", async () => {
    const { scanCalculationFiles, scanManualDestination } = require("../lib/source-metadata");
    const snapshot = source(
      "@ only-children\r\n@ child: żółć/😀.dat\r\n" + "x".repeat(100000) + "; MAT 1; GRP 2\r\n",
    );
    expect([...scanCalculationFiles(snapshot)].filter(Boolean)).toEqual([
      { onlyChildren: true },
      { child: "żółć/😀.dat" },
    ]);
    expect(
      [
        ...scanManualDestination(
          plain,
          snapshot,
          ["MAT", "GRP"],
          [
            [0, 0],
            [3, 0],
          ],
        ),
      ].filter(Boolean),
    ).toEqual(["GRP"]);
    expect(() => [...scanCalculationFiles(source("@ child:" + "x".repeat(65537)))]).toThrowError(
      /metadata budget/,
    );
    expect(
      [...scanCalculationFiles(source("x\u2028@ child: a.dat\r@ only-children"))].filter(Boolean),
    ).toEqual([{ child: "a.dat" }, { onlyChildren: true }]);
  });

  it("yields dense small scans by elapsed time and cancels before publishing partial metadata", async () => {
    let now = 0;
    spyOn(performance, "now").and.callFake(() => now++);
    const snapshot = source("+PROG AQUA;".repeat(100));
    const controller = new AbortController();
    const result = require("../lib/source-traversal").collect(
      require("../lib/source-structure").scanSourceDirectives(plain, snapshot),
      snapshot,
      { signal: controller.signal },
    );
    expect(typeof result.then).toBe("function");
    controller.abort();
    expect(await result).toBeNull();
  });

  it("preserves native WING line rules across chunk boundaries and every JavaScript line ending", async () => {
    const { appendMissingScale } = require("../lib/wing-source");
    const text =
      "AND " +
      "😀x".repeat(12000) +
      "MSCA !\r\nAND " +
      "y".repeat(32763) +
      "\u2028and tail\rAND z\u2029AND end";
    const expected = text.replace(/^AND (.*)(?<!MSCA .*)$/gim, "AND $1 MSCA NO");
    expect((await appendMissingScale(source(text))).toString()).toBe(expected);
    const controller = new AbortController();
    controller.abort();
    await expectAsync(
      appendMissingScale(source(text), { signal: controller.signal }),
    ).toBeRejected();
  });

  it("rejects oversized definitions before reading and preserves their exact bytes", () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-definition-budget-"));
    const file = path.join(directory, "sofistik.def");
    const { readDefinitionFile, MAX_BYTES } = require("../lib/definition-file");
    fs.writeFileSync(file, "SOF_VERSION=2026\r\nżółć😀");
    expect(readDefinitionFile(file)).toBe("SOF_VERSION=2026\r\nżółć😀");
    fs.truncateSync(file, MAX_BYTES + 1);
    const reading = spyOn(fs, "readSync").and.throwError("Oversized definition was read");
    expect(() => readDefinitionFile(file)).toThrowError(/1 MiB/);
    expect(reading).not.toHaveBeenCalled();
    expect(fs.statSync(file).size).toBe(MAX_BYTES + 1);
  });
});
