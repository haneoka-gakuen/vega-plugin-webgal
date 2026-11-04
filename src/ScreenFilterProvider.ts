import type {
  StoryFilterContext,
  StoryFilterImage,
  StoryFilterSurface,
  StoryScreenFilterController,
  StoryScreenFilterProvider,
} from "@haneoka/vega/renderer-kit";
import { FILTER_FRAGMENTS, FILTER_VERTEX } from "./FilterShaders.js";
import { WEBGAL_TRANSFORM_DEFAULTS } from "./TransformTimeline.js";

type Shader = keyof typeof FILTER_FRAGMENTS;
type Uniforms = Readonly<Record<string, unknown>>;
type Stage = (context: StoryFilterContext, input: StoryFilterSurface, output: StoryFilterSurface) => void;
const programs = Object.fromEntries(Object.keys(FILTER_FRAGMENTS).map((key) => [key, {}])) as Record<Shader, object>;
const pass = (
  context: StoryFilterContext,
  shader: Shader,
  uniforms: Uniforms,
  input: StoryFilterSurface,
  output: StoryFilterSurface,
): void => {
  context.draw(
    {
      program: programs[shader],
      vertex: FILTER_VERTEX,
      fragment: FILTER_FRAGMENTS[shader],
      legacy: true,
      blend: false,
      uniforms,
    },
    input,
    output,
  );
};
const run = (
  stages: readonly Stage[],
  context: StoryFilterContext,
  input: StoryFilterSurface,
  output: StoryFilterSurface,
): void => {
  let current = input;
  try {
    for (let index = 0; index < stages.length; index++) {
      const next = index === stages.length - 1 ? output : context.acquire();
      try {
        stages[index]!(context, current, next);
      } catch (error) {
        if (next !== output) context.release(next);
        throw error;
      }
      if (current !== input) context.release(current);
      current = next;
    }
  } finally {
    if (current !== input && current !== output) context.release(current);
  }
};

interface GlitchState {
  sizes: number[];
  offsets: number[];
  image: StoryFilterImage;
}
const glitchImage = (sizes: readonly number[], offsets: readonly number[]): StoryFilterImage => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  let y = 0;
  for (let i = 0; i < sizes.length; i++) {
    const offset = Math.floor(offsets[i]! * 256),
      height = sizes[i]! * 512;
    context.fillStyle = `rgba(${Math.max(0, offset)}, ${Math.max(0, -offset)}, 0, 1)`;
    context.fillRect(0, y >> 0, 512, (height + 1) >> 0);
    y += height;
  }
  return { source: canvas, width: 4, height: 512, revision: 0, nearest: true };
};
const createGlitch = (): GlitchState => {
  const sizes: number[] = [],
    offsets: number[] = [];
  let rest = 1;
  for (let i = 0; i < 4; i++) {
    const size = Math.max(Math.sqrt(1 / 5) * rest * Math.random(), 8 / 512);
    sizes.push(size);
    rest -= size;
  }
  sizes.push(rest);
  for (let i = 4; i > 0; i--) {
    const index = Math.floor(Math.random() * i);
    [sizes[i], sizes[index]] = [sizes[index]!, sizes[i]!];
  }
  for (let i = 0; i < 5; i++) offsets.push(Math.random() * (Math.random() < 0.5 ? -1 : 1));
  return { sizes, offsets, image: glitchImage(sizes, offsets) };
};

class ScreenFilterController implements StoryScreenFilterController {
  private values: Readonly<Record<string, number>> = {};
  private stages: Stage[] = [];
  private glitch: GlitchState | undefined;
  private paddingValue = 0;
  get active() {
    return this.stages.length > 0;
  }
  get padding() {
    return this.paddingValue;
  }

  configure(patch: Readonly<Record<string, number>>): void {
    const v = { ...WEBGAL_TRANSFORM_DEFAULTS, ...patch };
    if (
      Object.keys(v).length === Object.keys(this.values).length &&
      Object.entries(v).every(([key, value]) => value === this.values[key])
    )
      return;
    this.values = v;
    this.stages = [];
    this.paddingValue = 0;
    const simple = (shader: Shader, uniforms: Uniforms): void => {
      this.stages.push((context, input, output) => pass(context, shader, uniforms, input, output));
    };
    const sized = (shader: Shader, uniforms: Uniforms): void => {
      this.stages.push((context, input, output) =>
        pass(
          context,
          shader,
          {
            ...uniforms,
            dimensions: [context.frameWidth, context.frameHeight],
            aspect: context.frameHeight / context.frameWidth,
          },
          input,
          output,
        ),
      );
    };
    if (
      v.brightness !== 1 ||
      v.contrast !== 1 ||
      v.saturation !== 1 ||
      v.gamma !== 1 ||
      v.colorRed !== 255 ||
      v.colorGreen !== 255 ||
      v.colorBlue !== 255
    ) {
      simple("adjustment", {
        brightness: v.brightness,
        contrast: v.contrast,
        saturation: v.saturation,
        gamma: Math.max(0.0001, v.gamma),
        red: v.colorRed / 255,
        green: v.colorGreen / 255,
        blue: v.colorBlue / 255,
        alpha: 1,
      });
    }
    if (
      v.bevel !== 0 ||
      v.bevelThickness !== 0 ||
      v.bevelRotation !== 0 ||
      v.bevelSoftness !== 0 ||
      v.bevelRed !== 255 ||
      v.bevelGreen !== 255 ||
      v.bevelBlue !== 255
    ) {
      const angle = (v.bevelRotation * Math.PI) / 180;
      const direction = [Math.cos(angle) * v.bevelThickness, Math.sin(angle) * v.bevelThickness];
      const softness = Math.min(1, Math.max(0, v.bevelSoftness));
      this.paddingValue += 1;
      this.stages.push((context, input, output) => {
        const mask = softness > 0 ? context.acquire() : input;
        try {
          if (mask !== input)
            pass(
              context,
              "motion-blur",
              {
                uVelocity: direction.map((value) => -value * softness),
                uKernelSize: direction.some((value) => value !== 0) ? 11 : 0,
                uOffset: 0,
              },
              input,
              mask,
            );
          pass(
            context,
            "edge",
            {
              direction,
              light: [v.bevelRed / 255, v.bevelGreen / 255, v.bevelBlue / 255],
              strength: v.bevel,
              edgeMask: mask,
            },
            input,
            output,
          );
        } finally {
          if (mask !== input) context.release(mask);
        }
      });
    }
    if (v.godrayFilm)
      sized("godray", {
        light: [Math.cos(Math.PI / 6), 0.5],
        parallel: true,
        gain: 0.5,
        lacunarity: 2.5,
        time: 0,
        alpha: 1,
      });
    if (v.bloom !== 0 || v.bloomBrightness !== 1 || v.bloomBlur !== 0 || v.bloomThreshold !== 0) {
      this.stages.push((context, input, output) => {
        const bright = context.acquire(),
          bloom = context.acquire();
        try {
          pass(context, "extract", { threshold: v.bloomThreshold }, input, bright);
          const kernels = v.bloomBlur > 0 ? [1, 0.75, 0.5, 0.25].map((scale) => scale * v.bloomBlur) : [0];
          run(
            kernels.map(
              (kernel) => (ctx, source, target) =>
                pass(
                  ctx,
                  "kawase-blur",
                  {
                    uOffset: [(kernel + 0.5) / source.width, (kernel + 0.5) / source.height],
                  },
                  source,
                  target,
                ),
            ),
            context,
            bright,
            bloom,
          );
          pass(
            context,
            "bloom",
            { bloomScale: v.bloom, brightness: v.bloomBrightness, bloomTexture: bloom },
            input,
            output,
          );
        } finally {
          context.release(bright);
          context.release(bloom);
        }
      });
    }
    if (v.oldFilm)
      sized("old-film", {
        sepia: 0.3,
        noise: 0.3,
        noiseSize: 1,
        scratch: 0.5,
        scratchDensity: 0.3,
        scratchWidth: 1,
        vignetting: 0.3,
        vignettingAlpha: 1,
        vignettingBlur: 0.3,
        seed: 0,
      });
    if (v.glitchFilm) {
      this.glitch ??= createGlitch();
      this.stages.push((context, input, output) =>
        pass(
          context,
          "glitch",
          {
            dimensions: [context.frameWidth, context.frameHeight],
            aspect: context.frameHeight / context.frameWidth,
            displacementMap: this.glitch!.image,
            offset: 100,
            sinDir: 0,
            cosDir: 1,
            fillMode: 0,
            seed: 0,
            red: [0, 0],
            green: [0, 0],
            blue: [0, 0],
          },
          input,
          output,
        ),
      );
    } else this.glitch = undefined;
    if (v.dotFilm) simple("dot", { scale: 1, angle: 5 });
    if (v.rgbFilm) simple("rgb-split", { red: [-10, 0], green: [0, 10], blue: [0, 0] });
    if (v.blur !== 0) {
      this.paddingValue += Math.abs(v.blur) * 2;
      for (const axis of [0, 1])
        for (let i = 0; i < 4; i++) {
          this.stages.push((context, input, output) =>
            pass(
              context,
              "gaussian",
              {
                stepSize: axis === 0 ? [v.blur / input.width / 4, 0] : [0, v.blur / input.height / 4],
              },
              input,
              output,
            ),
          );
        }
    }
    if (v.shockwaveFilter !== 0)
      simple("shockwave", {
        center: [1280, 720],
        amplitude: 30,
        wavelength: 160,
        brightness: 1,
        speed: 500,
        radius: -1,
        time: v.shockwaveFilter,
      });
    if (v.radiusAlphaFilter !== 0) simple("radius", { radius: v.radiusAlphaFilter });
    if (v.reflectionFilm)
      sized("reflection", {
        mirror: true,
        boundary: 0.5,
        amplitude: [0, 20],
        waveLength: [30, 100],
        alpha: [1, 1],
        time: 0,
      });
    if (v.alpha !== 1) simple("alpha", { uAlpha: v.alpha });
    if (patch.colorMatrixEnabled === 1)
      simple("color-matrix", {
        m: Array.from({ length: 20 }, (_, i) => patch[`colorMatrix${i}`] ?? Number(i % 6 === 0)),
        uAlpha: 1,
      });
  }
  render(context: StoryFilterContext): void {
    run(this.stages, context, context.input, context.output);
  }
  snapshot(): unknown {
    return this.glitch ? { glitch: { sizes: [...this.glitch.sizes], offsets: [...this.glitch.offsets] } } : {};
  }
  restore(value: unknown): void {
    const saved = value as { glitch?: { sizes: number[]; offsets: number[] } };
    if (this.glitch && saved.glitch) {
      this.glitch = { ...saved.glitch, image: glitchImage(saved.glitch.sizes, saved.glitch.offsets) };
    }
  }
  dispose(): void {
    this.stages = [];
    this.glitch = undefined;
    this.values = {};
  }
}

export const screenFilterProvider: StoryScreenFilterProvider = Object.freeze({
  channels: [
    ...Object.keys(WEBGAL_TRANSFORM_DEFAULTS).filter(
      (key) => !["x", "y", "scaleX", "scaleY", "rotation"].includes(key),
    ),
    "colorMatrixEnabled",
    ...Array.from({ length: 20 }, (_, i) => `colorMatrix${i}`),
  ],
  create: () => new ScreenFilterController(),
});
