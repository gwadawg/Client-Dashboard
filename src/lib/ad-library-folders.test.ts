import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFolderTreeCounts,
  entryMatchesFolder,
  folderPathForEntry,
  folderPathKey,
  formPrefillFromFolder,
  groupEntriesByFormat,
  parseFolderPathKey,
  shouldSectionByFormat,
  type FolderPath,
} from "./ad-library-folders";

const sample = [
  { product: "reverse", ad_format: "ugc", status: "active", ready_to_test: true },
  { product: "reverse", ad_format: "static", status: "winner", ready_to_test: false },
  { product: "dscr", ad_format: "ugc", status: "active", ready_to_test: false },
  { product: null, ad_format: null, status: "paused", ready_to_test: false },
];

describe("ad-library-folders", () => {
  it("matches smart and product/format folders", () => {
    assert.equal(entryMatchesFolder(sample[0], { kind: "smart", id: "ready" }), true);
    assert.equal(entryMatchesFolder(sample[1], { kind: "smart", id: "winners" }), true);
    assert.equal(entryMatchesFolder(sample[3], { kind: "smart", id: "needs" }), true);
    assert.equal(
      entryMatchesFolder(sample[0], { kind: "product", product: "reverse", format: "ugc" }),
      true,
    );
    assert.equal(
      entryMatchesFolder(sample[0], { kind: "product", product: "reverse", format: "static" }),
      false,
    );
  });

  it("builds tree counts", () => {
    const tree = buildFolderTreeCounts(sample, ["ugc", "static", "ext"]);
    assert.equal(tree.smart.all, 4);
    assert.equal(tree.smart.ready, 1);
    assert.equal(tree.smart.winners, 1);
    assert.equal(tree.smart.needs, 1);
    const rm = tree.products.find((p) => p.product === "reverse");
    assert.equal(rm?.count, 2);
    assert.equal(rm?.formats.find((f) => f.format === "ugc")?.count, 1);
  });

  it("round-trips path keys and prefills forms", () => {
    const path: FolderPath = { kind: "product", product: "dscr", format: "ugc" };
    assert.deepEqual(parseFolderPathKey(folderPathKey(path)), path);
    assert.deepEqual(formPrefillFromFolder(path), { product: "dscr", ad_format: "ugc" });
    assert.deepEqual(formPrefillFromFolder({ kind: "smart", id: "all" }), {
      product: "",
      ad_format: "",
    });
  });

  it("sections All and product roots by format", () => {
    assert.equal(shouldSectionByFormat({ kind: "smart", id: "all" }), true);
    assert.equal(shouldSectionByFormat({ kind: "product", product: "reverse" }), true);
    assert.equal(
      shouldSectionByFormat({ kind: "product", product: "reverse", format: "ugc" }),
      false,
    );
    const groups = groupEntriesByFormat(sample, { ugc: "UGC", static: "Static" });
    assert.ok(groups.map((g) => g.key).includes("ugc"));
    assert.ok(groups.map((g) => g.key).includes("unassigned"));
  });

  it("picks folder for deep-link entry", () => {
    assert.deepEqual(folderPathForEntry(sample[0]), {
      kind: "product",
      product: "reverse",
      format: "ugc",
    });
    assert.deepEqual(folderPathForEntry(sample[3]), { kind: "smart", id: "needs" });
  });
});
