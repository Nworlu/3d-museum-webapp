import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExhibitLoader } from "../../src/loader/ExhibitLoader";
import type { ModelExhibit, RoomContent } from "../../src/types";

const loadAssetContainerAsync = vi.fn();

vi.mock("@babylonjs/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@babylonjs/core")>();
  return {
    ...actual,
    LoadAssetContainerAsync: (...args: unknown[]) => loadAssetContainerAsync(...args),
  };
});

vi.mock("@babylonjs/loaders/glTF", () => ({}));

function exhibit(overrides: Partial<ModelExhibit> = {}): ModelExhibit {
  return {
    id: "e1",
    kind: "model",
    modelUrl: "https://example.test/model.glb",
    position: { x: 0, y: 1, z: 0 },
    scale: 1,
    title: "Exhibit One",
    description: "A test exhibit.",
    ...overrides,
  };
}

/** A fake AssetContainer whose instantiate call records how many times it ran. */
function fakeContainer(scene: Scene) {
  const instantiateModelsToScene = vi.fn(() => {
    const root = new TransformNode("instance-root", scene);
    return { rootNodes: [root] };
  });
  return { instantiateModelsToScene } as unknown as import("@babylonjs/core").AssetContainer;
}

describe("ExhibitLoader", () => {
  let engine: NullEngine;
  let scene: Scene;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    loadAssetContainerAsync.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    vi.unstubAllGlobals();
  });

  function contentResponse(content: RoomContent) {
    return { ok: true, status: 200, json: async () => content };
  }

  it("imports every exhibit in a room's content and marks the room loaded", async () => {
    fetchMock.mockResolvedValue(contentResponse({ exhibits: [exhibit()] }));
    loadAssetContainerAsync.mockResolvedValue(fakeContainer(scene));

    const loader = new ExhibitLoader(scene);
    await loader.loadRoom("room-a", "/content/room-a.json");

    expect(loader.isLoaded("room-a")).toBe(true);
    expect(loadAssetContainerAsync).toHaveBeenCalledTimes(1);
  });

  it("caches an AssetContainer by URL instead of re-fetching a repeated model", async () => {
    fetchMock
      .mockResolvedValueOnce(contentResponse({ exhibits: [exhibit({ id: "a" })] }))
      .mockResolvedValueOnce(
        contentResponse({ exhibits: [exhibit({ id: "b", modelUrl: exhibit().modelUrl })] }),
      );
    loadAssetContainerAsync.mockResolvedValue(fakeContainer(scene));

    const loader = new ExhibitLoader(scene);
    await loader.loadRoom("room-a", "/content/room-a.json");
    await loader.loadRoom("room-b", "/content/room-b.json");

    // Same modelUrl in both rooms — the network/import call must happen once.
    expect(loadAssetContainerAsync).toHaveBeenCalledTimes(1);
  });

  it("discards a stale loadRoom result when unloadRoom fires before it resolves", async () => {
    let resolveFetch!: (v: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    loadAssetContainerAsync.mockResolvedValue(fakeContainer(scene));

    const loader = new ExhibitLoader(scene);
    const loadPromise = loader.loadRoom("room-a", "/content/room-a.json");

    // Room is unloaded (visitor moved away) before the in-flight fetch resolves.
    loader.unloadRoom("room-a");
    resolveFetch(contentResponse({ exhibits: [exhibit()] }));
    await loadPromise;

    expect(loader.isLoaded("room-a")).toBe(false);
  });

  it("discards a stale loadRoom result when a newer loadRoom for the same room fires mid-import", async () => {
    let resolveFirstImport!: (v: unknown) => void;
    let signalImportStarted!: () => void;
    const importStarted = new Promise<void>((resolve) => {
      signalImportStarted = resolve;
    });
    fetchMock.mockResolvedValue(contentResponse({ exhibits: [exhibit(), exhibit({ id: "e2" })] }));
    loadAssetContainerAsync
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstImport = resolve;
            signalImportStarted();
          }),
      )
      .mockResolvedValue(fakeContainer(scene));

    const loader = new ExhibitLoader(scene);
    const firstLoad = loader.loadRoom("room-a", "/content/room-a.json");
    await importStarted; // wait until the first exhibit's import call has actually begun

    // A second loadRoom call for the same room supersedes the first mid-import
    // (unloadRoom bumps the generation counter even though nothing is loaded yet).
    loader.unloadRoom("room-a");
    const secondLoad = loader.loadRoom("room-a", "/content/room-a.json");
    resolveFirstImport(fakeContainer(scene));

    await Promise.all([firstLoad, secondLoad]);
    expect(loader.isLoaded("room-a")).toBe(true);
  });

  it("falls back to a placeholder when an exhibit's model fails to load, without failing the room", async () => {
    fetchMock.mockResolvedValue(contentResponse({ exhibits: [exhibit()] }));
    loadAssetContainerAsync.mockRejectedValue(new Error("404"));

    const loader = new ExhibitLoader(scene);
    await loader.loadRoom("room-a", "/content/room-a.json");

    expect(loader.isLoaded("room-a")).toBe(true);
    const placeholder = scene.getMeshByName("placeholder:e1");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.metadata.exhibitTitle).toContain("content unavailable");
  });

  it("renders an empty room without error when content has zero exhibits", async () => {
    fetchMock.mockResolvedValue(contentResponse({ exhibits: [] }));

    const loader = new ExhibitLoader(scene);
    await expect(loader.loadRoom("room-a", "/content/room-a.json")).resolves.toBeUndefined();
    expect(loader.isLoaded("room-a")).toBe(true);
  });

  it("treats a fetch failure as an empty room instead of throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const loader = new ExhibitLoader(scene);
    await expect(loader.loadRoom("room-a", "/content/room-a.json")).resolves.toBeUndefined();
    expect(loader.isLoaded("room-a")).toBe(true);
  });

  it("unloadRoom disposes the room's meshes and clears loaded state", async () => {
    fetchMock.mockResolvedValue(contentResponse({ exhibits: [exhibit()] }));
    loadAssetContainerAsync.mockResolvedValue(fakeContainer(scene));

    const loader = new ExhibitLoader(scene);
    await loader.loadRoom("room-a", "/content/room-a.json");
    expect(loader.isLoaded("room-a")).toBe(true);

    loader.unloadRoom("room-a");
    expect(loader.isLoaded("room-a")).toBe(false);
    expect(scene.getTransformNodeByName("room:room-a")).toBeNull();
  });
});
