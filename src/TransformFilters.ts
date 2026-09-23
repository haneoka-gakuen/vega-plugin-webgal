import { CLEAR_MODES, Container, Filter, filters } from "pixi.js";
import {
  AdjustmentFilter,
  AdvancedBloomFilter,
  MotionBlurFilter,
  DotFilter,
  GlitchFilter,
  GodrayFilter,
  OldFilmFilter,
  ReflectionFilter,
  RGBSplitFilter,
  ShockwaveFilter,
} from "pixi-filters";
import { PIXI_TRANSFORM_DEFAULTS, type PixiTransformValues } from "./TransformTimeline.js";

class SpriteEdgeLightFilter extends Filter {
  private readonly smoothing = new MotionBlurFilter([0, 0], 11);
  private soft = false;
  constructor() {
    super(
      undefined,
      `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform sampler2D edgeMask;
      uniform vec4 filterArea;
      uniform vec2 direction;
      uniform vec3 light;
      uniform float strength;
      void main() {
        vec4 c = texture2D(uSampler, vTextureCoord);
        float edge = texture2D(edgeMask, vTextureCoord - direction / filterArea.xy).a;
        float amount = clamp((c.a - edge) * strength, 0.0, 1.0);
        gl_FragColor = vec4(c.rgb + (vec3(1.0) - c.rgb) * light * amount, c.a);
      }`,
      { direction: [0, 0], light: [1, 1, 1], strength: 0 },
    );
    this.padding = 1;
  }
  configure(v: typeof PIXI_TRANSFORM_DEFAULTS | Record<keyof typeof PIXI_TRANSFORM_DEFAULTS, number>): void {
    const angle = (v.bevelRotation * Math.PI) / 180;
    const x = Math.cos(angle) * v.bevelThickness,
      y = Math.sin(angle) * v.bevelThickness;
    this.uniforms.direction[0] = x;
    this.uniforms.direction[1] = y;
    this.uniforms.light[0] = v.bevelRed / 255;
    this.uniforms.light[1] = v.bevelGreen / 255;
    this.uniforms.light[2] = v.bevelBlue / 255;
    this.uniforms.strength = v.bevel;
    const softness = Math.min(1, Math.max(0, v.bevelSoftness));
    this.soft = softness > 0;
    this.smoothing.velocity.set(-x * softness, -y * softness);
  }
  override apply(...args: Parameters<Filter["apply"]>): void {
    const [manager, input, output, clear] = args;
    const mask = this.soft ? manager.getFilterTexture() : input;
    try {
      if (this.soft) this.smoothing.apply(manager, input, mask, CLEAR_MODES.YES);
      this.uniforms.edgeMask = mask;
      manager.applyFilter(this, input, output, clear);
    } finally {
      if (this.soft) manager.returnFilterTexture(mask);
    }
  }
  override destroy(): void {
    this.smoothing.destroy();
    super.destroy();
  }
}

export interface PixiTransformFilterSnapshot {
  readonly glitch?: {
    readonly sizes: readonly number[];
    readonly offsets: readonly number[];
  };
}

export class PixiTransformFilters {
  private readonly owned = new Map<string, Filter>();
  private attached: Container | undefined;
  private previous: PixiTransformValues | undefined;

  apply(target: Container, patch: PixiTransformValues): void {
    if (this.attached && this.attached !== target) this.detach();
    this.attached = target;
    const values = { ...PIXI_TRANSFORM_DEFAULTS, ...patch };
    const unchanged =
      this.previous &&
      Object.keys(values).every(
        (key) =>
          ["x", "y", "scaleX", "scaleY", "rotation"].includes(key) ||
          values[key as keyof typeof values] === this.previous![key as keyof typeof values],
      );
    if (unchanged) return;
    this.previous = values;
    const active: Filter[] = [];
    const use = <T extends Filter>(key: string, enabled: boolean, create: () => T, configure: (filter: T) => void) => {
      let filter = this.owned.get(key) as T | undefined;
      if (!enabled) {
        if (filter) {
          this.owned.delete(key);
          filter.destroy();
        }
        return;
      }
      if (!filter) {
        filter = create();
        this.owned.set(key, filter);
      }
      configure(filter);
      active.push(filter);
    };
    use(
      "adjustment",
      values.brightness !== 1 ||
        values.contrast !== 1 ||
        values.saturation !== 1 ||
        values.gamma !== 1 ||
        values.colorRed !== 255 ||
        values.colorGreen !== 255 ||
        values.colorBlue !== 255,
      () => new AdjustmentFilter(),
      (f) => {
        f.brightness = values.brightness;
        f.contrast = values.contrast;
        f.saturation = values.saturation;
        f.gamma = values.gamma;
        f.red = values.colorRed / 255;
        f.green = values.colorGreen / 255;
        f.blue = values.colorBlue / 255;
      },
    );
    use(
      "bevel",
      values.bevel !== 0 ||
        values.bevelThickness !== 0 ||
        values.bevelRotation !== 0 ||
        values.bevelSoftness !== 0 ||
        values.bevelRed !== 255 ||
        values.bevelGreen !== 255 ||
        values.bevelBlue !== 255,
      () => new SpriteEdgeLightFilter(),
      (f) => f.configure(values),
    );
    use(
      "godray",
      !!values.godrayFilm,
      () => new GodrayFilter(),
      () => {},
    );
    use(
      "bloom",
      values.bloom !== 0 || values.bloomBrightness !== 1 || values.bloomBlur !== 0 || values.bloomThreshold !== 0,
      () => new AdvancedBloomFilter(),
      (f) => {
        f.bloomScale = values.bloom;
        f.brightness = values.bloomBrightness;
        f.blur = values.bloomBlur;
        f.threshold = values.bloomThreshold;
      },
    );
    use(
      "old-film",
      !!values.oldFilm,
      () => new OldFilmFilter(),
      () => {},
    );
    use(
      "glitch",
      !!values.glitchFilm,
      () => new GlitchFilter(),
      () => {},
    );
    use(
      "dot",
      !!values.dotFilm,
      () => new DotFilter(),
      () => {},
    );
    use(
      "rgb",
      !!values.rgbFilm,
      () => new RGBSplitFilter(),
      () => {},
    );
    use(
      "blur",
      values.blur !== 0,
      () => new filters.BlurFilter(),
      (f) => {
        f.blur = values.blur;
      },
    );
    use(
      "shockwave",
      values.shockwaveFilter !== 0,
      () => new ShockwaveFilter([1280, 720]),
      (f) => {
        f.time = values.shockwaveFilter;
      },
    );
    use(
      "radius",
      values.radiusAlphaFilter !== 0,
      () =>
        new Filter(
          undefined,
          `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform float radius;
      void main() {
        float d = length((vTextureCoord - vec2(0.5)) * vec2(16.0/9.0, 1.0));
        gl_FragColor = texture2D(uSampler, vTextureCoord) * (1.0 - smoothstep(radius, radius + 0.05, d));
      }`,
          { radius: 0 },
        ),
      (f) => {
        f.uniforms.radius = values.radiusAlphaFilter;
      },
    );
    use(
      "reflection",
      !!values.reflectionFilm,
      () => new ReflectionFilter(),
      () => {},
    );
    use(
      "alpha",
      values.alpha !== 1,
      () => new filters.AlphaFilter(),
      (f) => {
        f.alpha = values.alpha;
      },
    );
    const external = (target.filters ?? []).filter((f) => !this.lastApplied.includes(f));
    target.filters = active.length || external.length ? [...external, ...active] : null;
    this.lastApplied = active;
  }

  snapshot(): PixiTransformFilterSnapshot {
    const glitch = this.owned.get("glitch") as GlitchFilter | undefined;
    return glitch
      ? {
          glitch: {
            sizes: Array.from(glitch.sizes),
            offsets: Array.from(glitch.offsets),
          },
        }
      : {};
  }
  restore(snapshot: PixiTransformFilterSnapshot): void {
    const glitch = this.owned.get("glitch") as GlitchFilter | undefined;
    if (glitch && snapshot.glitch) {
      glitch.sizes = new Float32Array(snapshot.glitch.sizes);
      glitch.offsets = new Float32Array(snapshot.glitch.offsets);
      glitch.redraw();
    }
  }

  private lastApplied: Filter[] = [];
  private detach(): void {
    if (this.attached && !this.attached.destroyed) {
      this.attached.filters = (this.attached.filters ?? []).filter((f) => !this.lastApplied.includes(f));
    }
    this.lastApplied = [];
    this.attached = undefined;
    this.previous = undefined;
  }
  dispose(): void {
    this.detach();
    for (const filter of this.owned.values()) filter.destroy();
    this.owned.clear();
  }
}
