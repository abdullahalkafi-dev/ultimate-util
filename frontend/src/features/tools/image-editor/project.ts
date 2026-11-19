/** `.uuproj` project files: JSON with the layer model plus each image layer's pixels as a PNG data URL. */
import type { Doc, Layer } from './layers';

export const PROJECT_VERSION = 1;
export const PROJECT_KIND = 'ultimate-util-image-project';

export interface ProjectFile {
  kind: typeof PROJECT_KIND;
  version: number;
  doc: Doc;
  /** bitmapId -> PNG data URL */
  images: Record<string, string>;
}

export class ProjectError extends Error {}

export function serializeProject(doc: Doc, images: Record<string, string>): string {
  const used = new Set(doc.layers.flatMap((l) => (l.kind === 'image' ? [l.bitmapId] : [])));
  const kept: Record<string, string> = {};
  for (const id of used) if (images[id]) kept[id] = images[id];
  const file: ProjectFile = { kind: PROJECT_KIND, version: PROJECT_VERSION, doc, images: kept };
  return JSON.stringify(file);
}

const KINDS = new Set(['image', 'text', 'shape', 'pen', 'step', 'adjust']);

/** Strict parse: refuses newer versions and malformed files instead of loading partially. */
export function parseProject(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('This file is not a valid project (it is not JSON).');
  }
  const f = raw as Partial<ProjectFile> | null;
  if (!f || typeof f !== 'object' || f.kind !== PROJECT_KIND) throw new ProjectError('This file is not an Ultimate Util image project.');
  if (typeof f.version !== 'number') throw new ProjectError('The project file has no version.');
  if (f.version > PROJECT_VERSION) {
    throw new ProjectError(`This project was saved by a newer version (format ${f.version}). Update the app to open it.`);
  }
  const doc = f.doc;
  if (!doc || !Number.isFinite(doc.width) || !Number.isFinite(doc.height) || doc.width < 1 || doc.height < 1 || !Array.isArray(doc.layers)) {
    throw new ProjectError('The project file is damaged (missing canvas size or layers).');
  }
  const images = f.images ?? {};
  for (const l of doc.layers as Layer[]) {
    if (!l || !KINDS.has(l.kind) || typeof l.id !== 'string') throw new ProjectError('The project file contains an unknown layer type.');
    if (l.kind === 'image' && typeof images[l.bitmapId] !== 'string') {
      throw new ProjectError(`The project is missing the pixels for layer "${l.name}".`);
    }
  }
  return { kind: PROJECT_KIND, version: f.version, doc, images };
}
