import { z } from "zod";

/** Artifact source declarations do not require generated-position decoding. */
type SourceMapRecord = Readonly<Record<string, unknown>>;

/** ECMA-426 requires a string mapping payload on every regular map leaf. */
export const sourceMapMappingsSchema = z.string();

/**
 * Return the JSON parsing view of retained source-map text. ECMA-426 permits
 * HTTP responses to start with `)]}'`; the first line is transport framing.
 * Keep the original text for artifact identity and Evidence provenance.
 * https://tc39.es/ecma426/#sec-fetchsourcemap
 */
export const sourceMapJsonText = (text: string): string => {
  const withoutBom = text.replace(/^\uFEFF/u, "");
  if (!withoutBom.startsWith(")]}'")) return withoutBom;
  const newline = withoutBom.search(/[\r\n]/u);
  return newline === -1 ? "" : withoutBom.slice(newline);
};

const isRecord = (value: unknown): value is SourceMapRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a parsed value has the version-3 map shape. */
const isVersion3Map = (value: unknown): value is SourceMapRecord =>
  isRecord(value) && value.version === 3;

/**
 * Collect leaf maps from an indexed source-map envelope, or undefined when
 * the envelope is not a version-3 map. A map carrying neither `mappings`
 * nor `sections` yields itself as the single leaf; callers decide whether
 * that leaf is valid content.
 */
/**
 * Recover declarations from valid indexed-map leaves even when another section
 * is malformed. Malformed structure must still make overall coverage partial.
 * Only the artifact declaration collector uses this tolerant view; strict
 * mapping decoders continue to reject invalid envelopes.
 */
export const recoverSourceMapLeaves = (
  root: unknown,
): { readonly leaves: readonly SourceMapRecord[]; readonly malformed: boolean } | undefined => {
  if (!isVersion3Map(root)) return undefined;
  const leaves: SourceMapRecord[] = [];
  const pending: unknown[] = [root];
  let malformed = false;
  while (pending.length > 0) {
    const map = pending.pop();
    if (!isVersion3Map(map)) {
      malformed = true;
      continue;
    }
    if (map.sections !== undefined) {
      if (!Array.isArray(map.sections)) {
        malformed = true;
        continue;
      }
      for (let index = map.sections.length - 1; index >= 0; index -= 1) {
        const section = map.sections[index];
        if (!isRecord(section) || !isVersion3Map(section.map)) {
          malformed = true;
          continue;
        }
        pending.push(section.map);
      }
    } else leaves.push(map);
  }
  return { leaves, malformed };
};

/** Strict callers reject the entire envelope if any section is malformed. */
export const flattenSourceMapLeaves = (
  root: unknown,
): readonly SourceMapRecord[] | undefined => {
  const recovered = recoverSourceMapLeaves(root);
  return recovered === undefined || recovered.malformed
    ? undefined
    : recovered.leaves;
};
