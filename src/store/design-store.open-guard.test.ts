// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DesignFolder,
  DesignRecord,
  DesignSummary,
} from "@/lib/designs/design-library";

const storage = vi.hoisted(() => ({
  listDesignSummaries: vi.fn<() => Promise<DesignSummary[]>>(),
  listDesignFolders: vi.fn<() => Promise<DesignFolder[]>>(async () => []),
  readDesign: vi.fn<(id: string) => Promise<DesignRecord | undefined>>(),
  readDesignSummary: vi.fn<(id: string) => Promise<DesignSummary | undefined>>(),
  writeDesignIfUnchanged: vi.fn<
    (record: DesignRecord, expectedUpdatedAt: string | undefined) => Promise<"written" | "conflict">
  >(),
  writeDesign: vi.fn<(record: DesignRecord) => Promise<void>>(async () => undefined),
  writeDesignSummary: vi.fn<(summary: DesignSummary) => Promise<void>>(async () => undefined),
  writeDesignFolder: vi.fn<(folder: DesignFolder) => Promise<void>>(async () => undefined),
  deleteDesign: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  deleteDesignFolder: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  readActiveDesignId: vi.fn<() => string | undefined>(),
  writeActiveDesignId: vi.fn<(id: string | undefined) => void>(),
}));

vi.mock("@/lib/designs/design-storage", () => storage);

/** Another browser tab, as far as this one can tell: the focus it has, and the saves it hears. */
const tabs = vi.hoisted(() => ({
  editing: true,
  announced: [] as Array<{ designId: string; updatedAt: string }>,
  heard: undefined as ((message: { designId: string; updatedAt: string }) => void) | undefined,
}));
vi.mock("@/lib/designs/design-tab-sync", () => ({
  THIS_TAB_ID: "this-tab",
  isEditingInThisTab: () => tabs.editing,
  announceDesignSaved: (designId: string, updatedAt: string) => {
    tabs.announced.push({ designId, updatedAt });
  },
  subscribeDesignSaved: (handler: (message: { designId: string; updatedAt: string }) => void) => {
    tabs.heard = handler;
    return () => {
      tabs.heard = undefined;
    };
  },
}));
vi.mock("@/lib/designs/design-camera", () => ({
  keepDesignCameras: vi.fn(),
  forgetDesignCameras: vi.fn(),
  rememberDesignCamera: vi.fn(),
  readDesignCamera: vi.fn(),
  beginDesignCameraHandover: vi.fn(),
  beginDesignHandover: vi.fn(),
  endDesignHandover: vi.fn(),
}));

import { readLibraryTabState } from "@/lib/library/library-tab";
import { createEmptyProject } from "@/examples";
import { LARGE_ARRIVING_PLAN_CARDS, useDesignStore } from "./design-store";
import { getRecoveryNotice, setRecoveryNotice } from "@/lib/designs/open-guard";
import { useFactoryStore } from "./factory-store";
import { copyViewedPost } from "@/lib/community/open-post";

function summary(id: string, extra: Partial<DesignSummary> = {}): DesignSummary {
  return {
    id,
    name: `Design ${id}`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    order: 0,
    ...extra,
  };
}

/** The mock library: summaries answer the list, records answer reads. */
function library(...designs: DesignSummary[]) {
  const current = new Map(designs.map((design) => [design.id, design]));
  storage.listDesignSummaries.mockImplementation(async () => [...current.values()]);
  storage.readDesign.mockImplementation(async (id: string) => {
    const design = current.get(id);
    return design ? { ...design, project: createEmptyProject() } : undefined;
  });
  storage.writeDesignSummary.mockImplementation(async (design: DesignSummary) => {
    current.set(design.id, design);
  });
  storage.writeDesign.mockImplementation(async (record: DesignRecord) => {
    const rest: Partial<DesignRecord> = { ...record };
    delete rest.project;
    current.set(record.id, rest as DesignSummary);
  });
  storage.deleteDesign.mockImplementation(async (id: string) => {
    current.delete(id);
  });
  storage.readDesignSummary.mockImplementation(async (id: string) => current.get(id));
  storage.writeDesignIfUnchanged.mockImplementation(async (record, expectedUpdatedAt) => {
    const stored = current.get(record.id);
    if (stored && expectedUpdatedAt !== undefined && stored.updatedAt !== expectedUpdatedAt) {
      return "conflict";
    }
    await storage.writeDesign(record);
    return "written";
  });
  return current;
}

beforeEach(() => {
  useDesignStore.setState({
    designs: [],
    folders: [],
    activeDesignId: undefined,
    isHydrated: false,
    error: undefined,
  });
  vi.clearAllMocks();
  storage.listDesignFolders.mockResolvedValue([]);
  tabs.editing = true;
  tabs.announced = [];
  storage.readDesignSummary.mockResolvedValue(undefined);
  storage.writeDesignIfUnchanged.mockImplementation(async (record) => {
    await storage.writeDesign(record);
    return "written";
  });
});

describe("a plan that crashed the page while opening", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    setRecoveryNotice(undefined);
    library(summary("a"), summary("b"));
    storage.readActiveDesignId.mockReturnValue("a");
  });

  it("is not remembered until it has painted, so a crash cannot make it reopen", async () => {
    await useDesignStore.getState().importProjectAsDesign(createEmptyProject(), "Shared");
    const imported = useDesignStore.getState().activeDesignId!;
    // On the board, but not yet the design the next visit reopens.
    expect(storage.writeActiveDesignId).not.toHaveBeenCalledWith(imported);
    expect(window.localStorage.getItem("gtnh-retro.opening-design.v1")).toBe(imported);
  });

  it("leaves the design that never finished opening closed and lands on the library with a notice", async () => {
    window.localStorage.setItem("gtnh-retro.opening-design.v1", "a");

    await useDesignStore.getState().hydrate();

    const state = useDesignStore.getState();
    expect(state.activeDesignId).toBeUndefined();
    expect(readLibraryTabState().active).toBe(true);
    expect(getRecoveryNotice()).toEqual({ kind: "unfinished", designName: "Design a" });
    // One recovery: the next visit behaves normally again.
    expect(window.localStorage.getItem("gtnh-retro.opening-design.v1")).toBeNull();
  });

  it("opens no design in safe mode", async () => {
    window.history.replaceState(null, "", "/#safe");

    await useDesignStore.getState().hydrate();

    expect(useDesignStore.getState().activeDesignId).toBeUndefined();
    expect(getRecoveryNotice()).toEqual({ kind: "safe" });
  });

  it("asks before opening a very large arriving plan, and opens nothing when declined", async () => {
    const big = createEmptyProject();
    big.storages = Array.from({ length: LARGE_ARRIVING_PLAN_CARDS + 1 }, (_, index) => ({
      id: `s${index}`,
      kind: "item" as const,
      resourceId: "minecraft:iron_ingot",
      position: { x: index * 20, y: 0 },
    }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const opened = await useDesignStore.getState().importProjectAsDesign(big, "Huge");

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(`Open shared plan: ${LARGE_ARRIVING_PLAN_CARDS + 1} cards?`));
    expect(opened).toBe(false);
    expect(storage.writeDesign).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

