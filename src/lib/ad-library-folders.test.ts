import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFolderTreeCounts,
  countMatchesOutsideFolder,
  entryMatchesFolder,
  folderPathForEntry,
  folderPathKey,
  formPrefillFromFolder,
  groupEntriesByFormat,
  libraryAdComparator,
  LIBRARY_SORT_OPTIONS,
  parseFolderPathKey,
  parseLibrarySort,
  shouldSectionByFormat,
  type FolderPath,
  type SortableAd,
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

describe("ad library URL params", () => {
  it("round-trips every folder shape through the ?folder= param", () => {
    const paths: FolderPath[] = [
      { kind: "smart", id: "all" },
      { kind: "smart", id: "ready" },
      { kind: "smart", id: "winners" },
      { kind: "smart", id: "needs" },
      { kind: "product", product: "reverse" },
      { kind: "product", product: "broad_forward", format: "ugc" },
      { kind: "product", product: "unassigned", format: "unassigned" },
    ];
    for (const path of paths) {
      const params = new URLSearchParams();
      params.set("folder", folderPathKey(path));
      assert.deepEqual(
        parseFolderPathKey(params.get("folder")),
        path,
        `round trip failed for ${folderPathKey(path)}`,
      );
    }
  });

  it("rejects junk params so a bad link falls back to the default folder", () => {
    for (const raw of [null, "", "smart:bogus", "product:nope", "carousel", "smart"]) {
      assert.equal(parseFolderPathKey(raw), null, `expected null for ${JSON.stringify(raw)}`);
    }
  });

  it("survives a format slug containing a colon", () => {
    const path: FolderPath = { kind: "product", product: "dscr", format: "ugc:v2" };
    assert.deepEqual(parseFolderPathKey(folderPathKey(path)), path);
  });

  it("round-trips the ?sort= param and rejects unknown orders", () => {
    for (const option of LIBRARY_SORT_OPTIONS) {
      assert.equal(parseLibrarySort(option.slug), option.slug);
    }
    assert.equal(parseLibrarySort("spend"), null);
    assert.equal(parseLibrarySort(null), null);
  });
});

describe("cross-folder search count", () => {
  const named = [
    { ...sample[0], ad_name: "RM hook A" },
    { ...sample[1], ad_name: "RM hook B" },
    { ...sample[2], ad_name: "DSCR hook A" },
    { ...sample[3], ad_name: "Unsorted clip" },
  ];
  const matchesHook = (e: (typeof named)[number]) => e.ad_name.toLowerCase().includes("hook a");

  it("counts matches living outside the folder you are standing in", () => {
    const inDscrUgc: FolderPath = { kind: "product", product: "dscr", format: "ugc" };
    // "DSCR hook A" is inside that folder, so only "RM hook A" is elsewhere.
    assert.equal(countMatchesOutsideFolder(named, inDscrUgc, matchesHook), 1);
  });

  it("reports zero from All ads, where nothing is elsewhere", () => {
    assert.equal(
      countMatchesOutsideFolder(named, { kind: "smart", id: "all" }, matchesHook),
      0,
    );
  });

  it("reports zero when the query matches nothing anywhere", () => {
    assert.equal(
      countMatchesOutsideFolder(named, { kind: "smart", id: "ready" }, () => false),
      0,
    );
  });
});

describe("library sort comparators", () => {
  type Ad = SortableAd & { id: string };
  const ads: Ad[] = [
    { id: "b", ad_name: "banana", created_at: "2026-03-01", updated_at: "2026-06-01" },
    { id: "a", ad_name: "Apple", created_at: "2026-01-01", updated_at: "2026-08-01" },
    { id: "c", ad_name: "cherry", created_at: "2026-05-01", updated_at: "2026-02-01" },
  ];
  const cpl: Record<string, number | null> = { a: 40, b: 12, c: null };
  const order = (sort: Parameters<typeof libraryAdComparator>[0]) =>
    [...ads].sort(libraryAdComparator<Ad>(sort, (e) => cpl[e.id])).map((e) => e.id);

  it("sorts by name case-insensitively", () => {
    assert.deepEqual(order("name"), ["a", "b", "c"]);
  });

  it("sorts newest first for updated and created", () => {
    assert.deepEqual(order("updated"), ["a", "b", "c"]);
    assert.deepEqual(order("created"), ["c", "b", "a"]);
  });

  it("sorts cheapest CPL first and parks unmeasured ads at the end", () => {
    assert.deepEqual(order("cpl"), ["b", "a", "c"]);
  });

  it("falls back to name so ties never reshuffle between renders", () => {
    const tied: Ad[] = [
      { id: "z", ad_name: "zulu", created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: "m", ad_name: "mike", created_at: "2026-01-01", updated_at: "2026-01-01" },
    ];
    const byUpdated = libraryAdComparator<Ad>("updated", () => null);
    assert.deepEqual([...tied].sort(byUpdated).map((e) => e.id), ["m", "z"]);
    assert.deepEqual([...tied].reverse().sort(byUpdated).map((e) => e.id), ["m", "z"]);
  });

  it("treats an unparseable timestamp as oldest rather than throwing", () => {
    const broken: Ad[] = [
      { id: "ok", ad_name: "ok", created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: "bad", ad_name: "bad", created_at: "not-a-date", updated_at: "not-a-date" },
    ];
    assert.deepEqual(
      [...broken].sort(libraryAdComparator<Ad>("updated", () => null)).map((e) => e.id),
      ["ok", "bad"],
    );
  });
});
