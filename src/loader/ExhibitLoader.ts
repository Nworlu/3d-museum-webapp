import {
  AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { ExhibitData, RoomContent } from "../types";

interface LoadedRoom {
  root: TransformNode;
}

/**
 * Loads and disposes per-room exhibit content. Two properties matter here,
 * both surfaced during the eng review of this project's design doc:
 *  - a URL-keyed AssetContainer cache so a model reused across rooms is
 *    imported once and instanced everywhere else (Key Decision #5).
 *  - a per-room generation counter so a loadRoom() call that resolves after
 *    a newer load/unload has superseded it discards its result instead of
 *    attaching stale meshes to the scene (Key Decision — Code Quality Issue 2A).
 */
export class ExhibitLoader {
  private readonly scene: Scene;
  private readonly assetCache = new Map<string, AssetContainer>();
  private readonly generation = new Map<string, number>();
  private readonly loadedRooms = new Map<string, LoadedRoom>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  async loadRoom(roomId: string, contentUrl: string): Promise<void> {
    if (this.loadedRooms.has(roomId)) return;

    const gen = (this.generation.get(roomId) ?? 0) + 1;
    this.generation.set(roomId, gen);

    const root = new TransformNode(`room:${roomId}`, this.scene);

    let content: RoomContent;
    try {
      const res = await fetch(contentUrl);
      if (!res.ok) throw new Error(`content fetch ${contentUrl} -> ${res.status}`);
      content = (await res.json()) as RoomContent;
    } catch (err) {
      console.error(`[ExhibitLoader] failed to load room content for ${roomId}:`, err);
      content = { exhibits: [] };
    }

    for (const exhibit of content.exhibits) {
      await this.importExhibit(exhibit, root);
      if (this.generation.get(roomId) !== gen) {
        // A newer loadRoom/unloadRoom call superseded this one mid-import.
        root.dispose(false, true);
        return;
      }
    }

    if (this.generation.get(roomId) !== gen) {
      root.dispose(false, true);
      return;
    }

    this.loadedRooms.set(roomId, { root });
  }

  unloadRoom(roomId: string): void {
    const gen = (this.generation.get(roomId) ?? 0) + 1;
    this.generation.set(roomId, gen);

    const loaded = this.loadedRooms.get(roomId);
    if (!loaded) return;
    loaded.root.dispose(false, true);
    this.loadedRooms.delete(roomId);
  }

  isLoaded(roomId: string): boolean {
    return this.loadedRooms.has(roomId);
  }

  private async importExhibit(exhibit: ExhibitData, parent: TransformNode): Promise<void> {
    try {
      let container = this.assetCache.get(exhibit.modelUrl);
      if (!container) {
        container = await LoadAssetContainerAsync(exhibit.modelUrl, this.scene);
        this.assetCache.set(exhibit.modelUrl, container);
      }
      const instance = container.instantiateModelsToScene((name) => name, true);
      const root = (instance.rootNodes[0] as TransformNode | undefined) ?? new TransformNode(exhibit.id, this.scene);
      root.parent = parent;
      root.position.set(exhibit.position.x, exhibit.position.y, exhibit.position.z);
      root.scaling.setAll(exhibit.scale);
      for (const node of instance.rootNodes) {
        for (const mesh of node.getChildMeshes(false)) {
          mesh.metadata = { exhibitTitle: exhibit.title, exhibitDescription: exhibit.description };
          mesh.isPickable = true;
        }
      }
    } catch (err) {
      console.error(`[ExhibitLoader] exhibit "${exhibit.id}" failed to load, showing placeholder:`, err);
      this.createPlaceholder(exhibit, parent);
    }
  }

  private createPlaceholder(exhibit: ExhibitData, parent: TransformNode): void {
    const box = MeshBuilder.CreateBox(`placeholder:${exhibit.id}`, { size: 0.6 }, this.scene);
    box.position.set(exhibit.position.x, exhibit.position.y, exhibit.position.z);
    box.parent = parent;
    box.isPickable = true;
    const mat = new StandardMaterial(`placeholder-mat:${exhibit.id}`, this.scene);
    mat.diffuseColor = new Color3(0.8, 0.15, 0.15);
    mat.wireframe = true;
    box.material = mat;
    box.metadata = {
      exhibitTitle: `${exhibit.title} (content unavailable)`,
      exhibitDescription: "This exhibit's model failed to load. The gap is visible, not silent.",
    };
  }
}
