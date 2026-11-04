import { samplePropertyAnimation, type PropertyAnimationClip, type PropertyAnimationTrack } from "@haneoka/vega/renderer-kit";

export const WEBGAL_TRANSFORM_DEFAULTS = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  alpha: 1,
  blur: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  colorRed: 255,
  colorGreen: 255,
  colorBlue: 255,
  bevel: 0,
  bevelThickness: 0,
  bevelRotation: 0,
  bevelSoftness: 0,
  bevelRed: 255,
  bevelGreen: 255,
  bevelBlue: 255,
  bloom: 0,
  bloomBrightness: 1,
  bloomBlur: 0,
  bloomThreshold: 0,
  oldFilm: 0,
  dotFilm: 0,
  reflectionFilm: 0,
  glitchFilm: 0,
  rgbFilm: 0,
  godrayFilm: 0,
  shockwaveFilter: 0,
  radiusAlphaFilter: 0,
});
export type WebGalTransformChannel = keyof typeof WEBGAL_TRANSFORM_DEFAULTS;
export type WebGalTransformValues = Partial<Record<WebGalTransformChannel, number>>;
export interface WebGalTransformFrame {
  readonly position?: {
    readonly x?: number | undefined;
    readonly y?: number | undefined;
  };
  readonly scale?: {
    readonly x?: number | undefined;
    readonly y?: number | undefined;
  };
  readonly duration?: number;
  readonly ease?: string;
  readonly [key: string]: unknown;
}
export interface WebGalTransformOptions {
  readonly duration?: number;
  readonly ease?: string;
  readonly writeDefault?: boolean;
  readonly ignoreDefault?: boolean;
  readonly parallel?: boolean;
  readonly keep?: boolean;
  readonly animationVersion?: 1 | 2;
  readonly relative?: boolean;
  readonly inherit?: boolean;
  readonly relativeCalc?: Readonly<Record<string, WebGalRelativeCalculation>>;
  readonly signal?: AbortSignal;
}

export function transformValues(frame: WebGalTransformFrame): WebGalTransformValues {
  const values: WebGalTransformValues = {};
  for (const key of Object.keys(WEBGAL_TRANSFORM_DEFAULTS) as WebGalTransformChannel[]) {
    const value =
      key === "x" || key === "y"
        ? frame.position?.[key]
        : key === "scaleX"
          ? frame.scale?.x
          : key === "scaleY"
            ? frame.scale?.y
            : frame[key];
    if (typeof value === "number" && Number.isFinite(value)) values[key] = value;
  }
  return values;
}

export type WebGalRelativeCalculation = "absolute" | "add" | "multiply" | "multiplyWithZeroFallback";
export interface WebGalAnimation {
  readonly frames: readonly WebGalTransformFrame[];
  readonly animationVersion: 1 | 2;
  readonly relative: boolean;
  readonly inherit: boolean;
  readonly relativeCalc: Readonly<Record<string, WebGalRelativeCalculation>>;
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const nonnegative = (value: unknown): number => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const calculations = new Set(["absolute", "add", "multiply", "multiplyWithZeroFallback"]);

export function normalizeWebGalAnimation(input: unknown, overrides: { relative?: boolean; inherit?: boolean } = {}): WebGalAnimation {
  const array = Array.isArray(input), document = record(input);
  const source = array ? input : document?.keyframes;
  if (!Array.isArray(source) || source.some(frame => !record(frame)))
    throw new TypeError("Animation requires keyframes");
  const version = array ? (typeof overrides.relative === "boolean" || typeof overrides.inherit === "boolean" ? 2 : 1)
    : document?.version === 1 ? 1 : 2;
  const ordered: Record<string, unknown>[] = source.map(frame => ({ ...record(frame)! }));
  if (!array && version === 2) ordered.sort((a, b) => nonnegative(a.time) - nonnegative(b.time));
  let previous = 0;
  const frames = ordered.map(({ time, ...frame }) => {
    const at = !array && version === 2 ? nonnegative(time) : previous + nonnegative(frame.duration);
    const result = { ...frame, duration: at - previous } as WebGalTransformFrame;
    previous = at;
    return result;
  });
  return {
    frames, animationVersion: version,
    relative: version === 2 && (overrides.relative ?? (typeof document?.relative === "boolean" ? document.relative : true)),
    inherit: version === 2 && (overrides.inherit ?? (typeof document?.inherit === "boolean" ? document.inherit : true)),
    relativeCalc: Object.fromEntries(Object.entries(record(document?.relativeCalc) ?? {})
      .filter((entry): entry is [string, WebGalRelativeCalculation] => typeof entry[1] === "string" && calculations.has(entry[1]))),
  };
}

const defaultRelative: Readonly<Record<string, WebGalRelativeCalculation>> = {
  position: "add", rotation: "add", blur: "add", bevel: "add", bevelThickness: "add", bevelRotation: "add",
  bevelSoftness: "add", bloom: "add", bloomBlur: "add", scale: "multiplyWithZeroFallback",
};
const easeNames = new Set(["linear", "easeIn", "easeOut", "easeInOut", "circIn", "circOut", "circInOut",
  "backIn", "backOut", "backInOut", "bounceIn", "bounceOut", "bounceInOut", "anticipate"]);

export function prepareTransformTimeline(
  frames: readonly WebGalTransformFrame[],
  previous: WebGalTransformValues,
  options: WebGalTransformOptions = {},
) {
  const authored = frames.map(transformValues), v2 = options.animationVersion === 2;
  const channels = v2 || options.parallel || options.ignoreDefault
    ? [...new Set(authored.flatMap(frame => Object.keys(frame)))] as WebGalTransformChannel[]
    : Object.keys(WEBGAL_TRANSFORM_DEFAULTS) as WebGalTransformChannel[];
  const source = options.writeDefault ? WEBGAL_TRANSFORM_DEFAULTS : { ...WEBGAL_TRANSFORM_DEFAULTS, ...previous };
  let duration = 0;
  const times = frames.map(frame => (duration += nonnegative(frame.duration)));
  const tracks: PropertyAnimationTrack[] = channels.map(channel => {
    const base = source[channel], category = channel === "x" || channel === "y" ? "position"
      : channel === "scaleX" || channel === "scaleY" ? "scale" : channel;
    const calc = v2 && options.relative !== false ? options.relativeCalc?.[category] ?? defaultRelative[category] ?? "absolute" : "absolute";
    const points = authored.flatMap((frame, index) => {
      const value = frame[channel];
      if (value === undefined && v2 && options.inherit !== false) return [];
      const absolute = value === undefined ? base : calc === "add" ? base + value
        : calc === "multiply" ? base * value : calc === "multiplyWithZeroFallback" ? (base === 0 ? 1 : base) * value : value;
      const ease = frames[index]?.ease;
      return [{ timeSeconds: times[index]! / 1000, value: absolute,
        ease: `popmotion:${easeNames.has(ease ?? "") ? ease : "easeInOut"}` }];
    });
    if (v2) points.unshift({ timeSeconds: 0, value: base, ease: "popmotion:linear" });
    return { channel, points };
  }).filter(track => track.points.length > 0);
  const clip: PropertyAnimationClip = { durationSeconds: duration / 1000, tracks };
  const sample = (time: number) => samplePropertyAnimation(clip, time / 1000);
  return { clip, duration, start: sample(0), end: sample(duration), sample };
}
