import { ZodError } from "zod";
import { normalizeProjectFuelProfiles } from "../model/fuels";
import { normalizeLoadedProject } from "../model/project-normalize";
import { factoryProjectSchema } from "../model/schemas";
import { MAX_PLAN_JSON_BYTES } from "./bounded-inflate";
import type { FactoryProject } from "../model/types";

export class FactoryJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FactoryJsonError";
  }
}

const MAX_REPORTED_ISSUES = 5;

export function parseFactoryProjectJson(source: string): FactoryProject {
  if (source.length > MAX_PLAN_JSON_BYTES) {
    throw new FactoryJsonError("That plan is too big to open.");
  }
  let raw: unknown;

  try {
    raw = JSON.parse(source);
  } catch (error) {
    throw new FactoryJsonError(
      `Invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }

  try {
    return normalizeLoadedProject(factoryProjectSchema.parse(raw));
  } catch (error) {
    if (error instanceof ZodError) {
      // A few are enough to say what is wrong; a crafted plan can carry
      // thousands, and joining them all made a message that froze the page.
      const shown = error.issues
        .slice(0, MAX_REPORTED_ISSUES)
        .map((issue) => `${issue.path.slice(0, 6).join(".") || "root"}: ${issue.message.slice(0, 200)}`)
        .join("; ");
      const more = error.issues.length - MAX_REPORTED_ISSUES;
      throw new FactoryJsonError(
        `Invalid factory project: ${shown}${more > 0 ? ` (and ${more.toLocaleString()} more)` : ""}`,
      );
    }

    throw error;
  }
}

export function serializeFactoryProject(project: FactoryProject): string {
  const validatedProject = factoryProjectSchema.parse(normalizeProjectFuelProfiles(project));
  return `${JSON.stringify(validatedProject, null, 2)}\n`;
}

export function cloneImportedProject(project: FactoryProject): FactoryProject {
  return {
    ...project,
    metadata: {
      ...project.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}
