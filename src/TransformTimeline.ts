import * as easing from "popmotion";

export const PIXI_TRANSFORM_DEFAULTS = Object.freeze({
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
export type PixiTransformChannel = keyof typeof PIXI_TRANSFORM_DEFAULTS;
export type PixiTransformValues = Partial<Record<PixiTransformChannel, number>>;
export interface PixiTransformFrame {
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
export interface PixiTransformOptions {
  readonly duration?: number;
  readonly ease?: string;
  readonly writeDefault?: boolean;
  readonly ignoreDefault?: boolean;
  readonly parallel?: boolean;
  readonly keep?: boolean;
  readonly signal?: AbortSignal;
}

export function transformValues(frame: PixiTransformFrame): PixiTransformValues {
  const values: PixiTransformValues = {};
  for (const key of Object.keys(PIXI_TRANSFORM_DEFAULTS) as PixiTransformChannel[]) {
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

const easings: Readonly<Record<string, (t: number) => number>> = {
  linear: easing.linear,
  easeIn: easing.easeIn,
  easeOut: easing.easeOut,
  easeInOut: easing.easeInOut,
  circIn: easing.circIn,
  circOut: easing.circOut,
  circInOut: easing.circInOut,
  backIn: easing.backIn,
  backOut: easing.backOut,
  backInOut: easing.backInOut,
  bounceIn: easing.bounceIn,
  bounceOut: easing.bounceOut,
  bounceInOut: easing.bounceInOut,
  anticipate: easing.anticipate,
};

export function prepareTransformTimeline(
  frames: readonly PixiTransformFrame[],
  previous: PixiTransformValues,
  options: PixiTransformOptions = {},
) {
  const authored = frames.map(transformValues);
  const channels =
    options.parallel || options.ignoreDefault
      ? ([...new Set(authored.flatMap((frame) => Object.keys(frame)))] as PixiTransformChannel[])
      : (Object.keys(PIXI_TRANSFORM_DEFAULTS) as PixiTransformChannel[]);
  const source = options.writeDefault ? PIXI_TRANSFORM_DEFAULTS : { ...PIXI_TRANSFORM_DEFAULTS, ...previous };
  const base = Object.fromEntries(channels.map((key) => [key, source[key]])) as PixiTransformValues;
  const values = authored.map((frame) => ({ ...base, ...frame }));
  const times: number[] = [];
  let duration = 0;
  for (const frame of frames) {
    const milliseconds = Number(frame.duration);
    duration += Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
    times.push(duration);
  }
  const end = values.at(-1) ?? {};
  const sample =
    values.length > 1 && duration > 0
      ? easing.interpolate(times, values, {
          ease: frames.slice(1).map((frame) => easings[frame.ease ?? ""] ?? easing.easeInOut),
        })
      : () => end;
  return { duration, start: values[0] ?? {}, end, sample };
}
