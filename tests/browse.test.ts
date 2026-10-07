import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityPackageView, packageView, pageNumbers, selectPackages } from "../src/ui/browse-model";
import { PackageCard } from "../src/ui/PackageCard";
import { Pagination } from "../src/ui/Pagination";
import { BrowseTabs } from "../src/ui/BrowseTabs";

const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: React.ReactElement) => string };
vi.mock("@nexusmods/vortex-api", () => ({
  Icon: ({ name, ...props }: { name: string }) => React.createElement("i", { "data-icon": name, ...props }),
}));
afterEach(() => vi.restoreAllMocks());

function item(name: string, overrides: Partial<CommunityPackageView> = {}): CommunityPackageView {
  return { owner: "Author", name, pinned: false, nsfw: false, downloads: 0, ratingScore: 0, categories: [], isModpack: false, ...overrides };
}

describe("browse selection", () => {
  it.each(["ccdn.thunderstore.io", "gcdn.thunderstore.io", "thunderstore.io"])("renders package icons served by %s", (host) => {
    const icon = `https://${host}/live/repository/icons/denikson-BepInExPack_Valheim-5.4.2351.png`;
    const parsed = packageView({ owner: "denikson", name: "BepInExPack_Valheim", versions: [{ version_number: "5.4.2351", icon }] });
    expect(parsed?.iconUrl).toBe(icon);
    const html = renderToStaticMarkup(React.createElement(PackageCard, {
      item: parsed!, installed: false, installing: false, activeTab: "mods", onInstall: async () => {},
    }));
    expect(html).toContain(`<img src="${icon}"`);
  });
  it.each(["https://ccdn.thunderstore.io.evil.example/icon.png", "http://ccdn.thunderstore.io/icon.png", "https://evil.example/icon.png"])("still rejects unsafe image URL %s", (icon) => {
    expect(packageView({ owner: "A", name: "B", versions: [{ icon }] })?.iconUrl).toBeUndefined();
  });
  it.each(["popular", "updated", "name"] as const)("keeps pinned first with %s sorting without mutating the input", (sort) => {
    const packages = [item("A", { downloads: 99, updatedAt: "2026-01-01" }), item("Z", { pinned: true })];
    expect(selectPackages(packages, "mods", "", sort).map((p) => p.name)).toEqual(["Z", "A"]);
    expect(packages.map((p) => p.name)).toEqual(["A", "Z"]);
  });
  it("separates modpacks and searches names, authors, descriptions and categories", () => {
    const packages = [item("Mod", { description: "An ocean", categories: ["Utility"] }), item("Pack", { isModpack: true })];
    for (const query of [" MOD ", "author", "OCEAN", "utility"]) {
      expect(selectPackages(packages, "mods", query, "popular")).toEqual([packages[0]]);
    }
    expect(selectPackages(packages, "modpacks", "", "popular")).toEqual([packages[1]]);
    expect(selectPackages(packages, "mods", "missing", "popular")).toEqual([]);
  });
  it("preserves downloads/rating/name tie breakers", () => {
    const packages = [item("C"), item("B", { ratingScore: 1 }), item("A", { ratingScore: 1 }), item("D", { downloads: 1 })];
    expect(selectPackages(packages, "mods", "", "popular").map((p) => p.name)).toEqual(["D", "A", "B", "C"]);
  });
  it("decodes the first active version and only exposes allowlisted URLs", () => {
    expect(packageView({ owner: "A", name: "B", categories: ["Modpacks"], package_url: "javascript:alert(1)", versions: [
      { is_active: false, version_number: "2.0.0" },
      { version_number: "1.0.0", downloads: 4, icon: "https://evil.example/icon.png" },
    ] })).toMatchObject({ latestVersion: "1.0.0", downloads: 4, isModpack: true, iconUrl: undefined, packageUrl: undefined });
    expect(packageView(null)).toBeUndefined();
  });
});

describe("native browse presentation", () => {
  it.each(["mods", "modpacks"] as const)("uses native tab structure and count badges with %s selected", (activeTab) => {
    const html = renderToStaticMarkup(React.createElement(BrowseTabs, {
      activeTab, counts: { mods: 7221, modpacks: 5558 }, onSelect: () => {},
    }));
    expect(html).toContain('class="nxm-tab-bar nxm-tab-bar-primary overflow-clip pl-6"');
    expect(html).toContain('class="nxm-tab-bar-scroller"');
    expect(html).toContain('class="nxm-tab-button-count">7,221</span>');
    expect(html).toContain('class="nxm-tab-button-count">5,558</span>');
    expect(html.match(/nxm-tab-button-selected/g)).toHaveLength(1);
    expect(html).toContain(`aria-controls="tabcontent-thunderstore-${activeTab}" aria-selected="true" tabindex="0"`);
  });
  it.each([
    [1, 1, [1]], [2, 5, [1, 2, 3, 4, 5]],
    [1, 20, [1, 2, 3, 4, "ellipsis", 20]],
    [8, 20, [1, "ellipsis", 7, 8, 9, "ellipsis", 20]],
    [20, 20, [1, "ellipsis", 17, 18, 19, 20]],
  ])("preserves page links for page %s/%s", (page, count, expected) => {
    expect(pageNumbers(page as number, count as number)).toEqual(expected);
  });
  it("retains native card classes, banner, View Page icon and installed state", () => {
    const html = renderToStaticMarkup(React.createElement(PackageCard, {
      item: item("Test", { pinned: true, latestVersion: "1.0.0", packageUrl: "https://thunderstore.io/c/valheim/p/A/Test/" }),
      installed: true, installing: false, activeTab: "mods", onInstall: async () => {},
    }));
    expect(html).toContain("nxm-button-disabled");
    expect(html).toContain("Installed");
    expect(html).toContain('data-icon="launch"');
    expect(html).toContain('data-icon="bookmark"');
    expect(html).toContain("View Page");
    expect(html).not.toContain("Install Test in Vortex");
  });
  it("uses native arrows and shows the jump form only at seven pages", () => {
    const render = (pageCount: number) => renderToStaticMarkup(React.createElement(Pagination, {
      page: 1, pageCount, jumpValue: "1", setPage: () => {}, setJumpValue: () => {},
    }));
    expect(render(1)).toBe("");
    expect(render(6)).not.toContain('aria-label="Jump to page"');
    expect(render(7)).toContain('aria-label="Jump to page"');
    expect(render(7)).toContain('data-icon="collection-previous"');
    expect(render(7)).toContain('data-icon="collection-next"');
  });
});
