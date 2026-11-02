import { describe, expect, it } from "vitest";
import biodiesel from "../../../examples/biodiesel-demo.json";
import { parseFactoryProjectJson } from "@/lib/import-export/factory-json";
import { PLAN_LIMITS } from "./schemas";

function plan(edit: (project: Record<string, any>) => void): string {
  const project = structuredClone(biodiesel) as Record<string, any>;
  edit(project);
  return JSON.stringify(project);
}

describe("plans are data from anyone", () => {
  it("drops art that names another host, keeping the plan and the resource", () => {
    const parsed = parseFactoryProjectJson(
      plan((p) => {
        p.recipes[0].outputs[0].iconPath = "https://attacker.example/x.png";
        p.recipes[0].outputs[0].iconAtlas = {
          imagePath: "//attacker.example/sheet.png",
          atlasWidth: 64,
          atlasHeight: 64,
          x: 0,
          y: 0,
          width: 32,
          height: 32,
        };
        p.recipes[0].inputs[0] ??= { kind: "item", id: "minecraft:iron_ingot", amount: 1 };
        p.recipes[0].inputs[0].iconPath = "/datasets/gtnh/../../etc/passwd";
        p.storages = [
          { id: "s1", kind: "item", resourceId: "minecraft:iron_ingot", iconPath: "asset:gregtech:textures/x.png", position: { x: 0, y: 0 } },
        ];
      }),
    );
    expect(parsed.recipes[0]!.outputs[0]!.iconPath).toBeUndefined();
    expect(parsed.recipes[0]!.outputs[0]!.iconAtlas).toBeUndefined();
    expect(parsed.recipes[0]!.outputs[0]!.id).toBeTruthy();
    expect(parsed.recipes[0]!.inputs[0]!.iconPath).toBeUndefined();
    expect(parsed.storages?.[0]?.iconPath).toBeUndefined();
  });

  it("keeps this site's own art", () => {
    const parsed = parseFactoryProjectJson(
      plan((p) => {
        p.recipes[0].outputs[0].iconAtlas = {
          imagePath: "/datasets/gtnh/stable-2.9.0/textures/sheets/sheet-0123456789abcdef.webp",
          atlasWidth: 1024,
          atlasHeight: 1024,
          x: 128,
          y: 0,
          width: 128,
          height: 128,
        };
        p.recipes[0].inputs[0] ??= { kind: "item", id: "minecraft:iron_ingot", amount: 1 };
        p.recipes[0].inputs[0].iconPath = "/nei/thaumcraft/aspects/aer.png";
      }),
    );
    expect(parsed.recipes[0]!.outputs[0]!.iconAtlas?.imagePath).toContain("/textures/sheets/");
    expect(parsed.recipes[0]!.inputs[0]!.iconPath).toBe("/nei/thaumcraft/aspects/aer.png");
  });

  it("keeps a picture note's inline image and drops one that names a host", () => {
    const parsed = parseFactoryProjectJson(
      plan((p) => {
        p.annotations = [
          { id: "a", kind: "image", imageUrl: "http://attacker.example/a.png", position: { x: 0, y: 0 }, size: { width: 100, height: 100 } },
          { id: "b", kind: "image", imageUrl: "data:image/png;base64,iVBORw0KGgo=", position: { x: 0, y: 0 }, size: { width: 100, height: 100 } },
        ];
      }),
    );
    expect(parsed.annotations?.[0]?.imageUrl).toBeUndefined();
    expect(parsed.annotations?.[1]?.imageUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("refuses a plan with more cards than any real plan, with a short message", () => {
    const tooMany = plan((p) => {
      p.nodes = Array.from({ length: PLAN_LIMITS.cards + 1 }, (_, index) => ({ ...p.nodes[0], id: `n${index}` }));
    });
    expect(() => parseFactoryProjectJson(tooMany)).toThrow(/nodes/);
  });

  it("reports a handful of issues however many there are", () => {
    const broken = plan((p) => {
      p.nodes = Array.from({ length: 1500 }, () => ({}));
    });
    let message = "";
    try {
      parseFactoryProjectJson(broken);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/more\)$/);
    expect(message.length).toBeLessThan(2000);
  });
});
