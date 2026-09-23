import type {
  StoryScreenSpriteBatch,
  StoryScreenSpriteEffect,
  StoryScreenSpriteImage,
} from "@haneoka/vega/renderer-kit";
export type StockWeather = "rain" | "snow" | "heavy-snow" | "petals";
interface Profile {
  count: number;
  speed: number;
  scale: number;
  angle: number;
  horizontal: number;
}
interface Particle {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  alpha: number;
  frame: number;
  vx: number;
  vy: number;
  spin: number;
  positionPhase: number;
  scalePhase: number;
}
interface Layer {
  profile: Profile;
  width: number;
  height: number;
  particles: Particle[];
  batch: StoryScreenSpriteBatch & { revision: number };
}
const profiles: Record<StockWeather, readonly [Profile, Profile]> = {
  rain: [
    { count: 50, speed: 30, scale: 0.4, angle: 1, horizontal: 0 },
    { count: 150, speed: 20, scale: 0.3, angle: 1, horizontal: 0 },
  ],
  snow: [
    { count: 250, speed: 3, scale: 0.4, angle: 0, horizontal: 0 },
    { count: 750, speed: 1, scale: 0.2, angle: 0, horizontal: 0 },
  ],
  "heavy-snow": [
    { count: 1000, speed: 20, scale: 0.6, angle: -75, horizontal: 0 },
    { count: 2000, speed: 10, scale: 0.3, angle: -80, horizontal: 0 },
  ],
  petals: [
    { count: 100, speed: 2, scale: 0.05, angle: 0, horizontal: 3 },
    { count: 300, speed: 1, scale: 0.025, angle: 0, horizontal: 2 },
  ],
};
const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export class StockWeatherSimulation implements StoryScreenSpriteEffect {
  readonly kind = "screenSprites" as const;
  readonly batches: readonly StoryScreenSpriteBatch[];
  private readonly layers: Layer[] = [];
  private seed: number;
  private time = 0;
  private saved: unknown;
  private disposed = false;
  constructor(
    readonly weather: StockWeather,
    image: StoryScreenSpriteImage,
    options: Readonly<Record<string, unknown>> = {},
  ) {
    this.seed = Math.trunc(finite(options.seed, 0x51a7e)) >>> 0;
    const width = Math.max(1, finite(options.width, 2560)),
      height = Math.max(1, finite(options.height, 1440));
    for (const [index, defaults] of profiles[weather].entries()) {
      const name = index === 0 ? "foreground" : "background",
        override = object(options[name]);
      const profile: Profile = {
        count: Math.max(0, Math.min(65536, Math.trunc(finite(override.count, defaults.count)))),
        speed: finite(override.speed, defaults.speed),
        scale: finite(override.scale, defaults.scale),
        angle: finite(override.angle, defaults.angle),
        horizontal: finite(override.horizontal, defaults.horizontal),
      };
      const angle = profile.angle * (Math.PI / 180),
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      const stageWidth = width * Math.abs(cos) + height * Math.abs(sin),
        stageHeight = width * Math.abs(sin) + height * Math.abs(cos);
      const batch: Layer["batch"] = {
        id: `${weather}/${name}`,
        layer: name,
        image,
        width: weather === "rain" ? 128 : weather === "petals" ? image.width : 128,
        height: weather === "rain" ? 640 : weather === "petals" ? image.height : 128,
        referenceWidth: width,
        referenceHeight: height,
        transform: [
          cos,
          sin,
          -sin,
          cos,
          width / 2 - (cos * stageWidth) / 2 + (sin * stageHeight) / 2,
          height / 2 - (sin * stageWidth) / 2 - (cos * stageHeight) / 2,
        ],
        instances: new Float32Array(profile.count * 10),
        tint: Math.trunc(finite(options.color, 0xffffff)) & 0xffffff,
        revision: 0,
      };
      const layer: Layer = { profile, width: stageWidth, height: stageHeight, particles: [], batch };
      for (let i = 0; i < profile.count; i++) {
        const particle: Particle = {
          x: 0,
          y: 0,
          rotation: 0,
          sx: 1,
          sy: 1,
          alpha: 1,
          frame: 0,
          vx: 0,
          vy: 0,
          spin: 0,
          positionPhase: 0,
          scalePhase: 0,
        };
        if (weather === "petals") {
          const phase = this.random() * Math.PI * 2;
          particle.x = this.random() * stageWidth;
          particle.y = this.random() * stageHeight;
          particle.rotation = this.random() * Math.PI * 2;
          particle.sx = Math.cos(phase) * profile.scale;
          particle.sy = Math.sin(phase) * profile.scale;
          particle.vy = (0.5 + this.random() * 1.5 + (0.1 + this.random() * 0.9)) * profile.speed;
          particle.spin = this.random() * 0.015 * (this.random() < 0.5 ? 1 : -1);
          particle.positionPhase = this.random() * Math.PI * 2;
          particle.scalePhase = phase;
        } else {
          particle.frame = this.weighted(weather === "rain" ? [10, 5, 2, 2, 1] : [10, 2, 2, 2, 1, 1, 1, 2, 2, 2]);
          this.reset(layer, particle, true);
        }
        layer.particles.push(particle);
      }
      this.layers.push(layer);
      this.write(layer);
    }
    this.batches = this.layers.map((layer) => layer.batch);
  }
  private random(): number {
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), this.seed | 1) + 0x6d2b79f5) >>> 0;
    return ((this.seed ^ (this.seed >>> 14)) >>> 0) / 4294967296;
  }
  private weighted(weights: readonly number[]): number {
    let choice = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      if (choice < weights[i]!) return i;
      choice -= weights[i]!;
    }
    return weights.length - 1;
  }
  private reset(layer: Layer, particle: Particle, initial: boolean): void {
    const { profile } = layer;
    particle.sx = particle.sy = profile.scale * (this.random() * 0.5 + 0.5);
    particle.x = this.random() * layer.width;
    particle.y = initial
      ? this.random() * layer.height
      : -this.random() * 50 - Math.abs(layer.batch.height * particle.sy);
    particle.alpha = this.weather === "rain" ? this.random() * 0.5 + 0.5 : this.random() * 0.2 + 0.8;
    particle.vy = (this.random() * 0.4 + 0.8) * profile.speed;
    if (this.weather !== "rain") {
      particle.vx = (this.random() - 0.5) * 0.25 * profile.speed;
      particle.spin = (this.random() - 0.5) * 0.005;
    }
  }
  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const seconds = Math.max(0, finite(deltaSeconds, 0)),
      delta = seconds * 60;
    this.time += seconds;
    this.saved = undefined;
    for (const layer of this.layers) {
      const { profile } = layer;
      for (const p of layer.particles) {
        if (this.weather === "petals") {
          p.x += Math.sin(this.time + p.positionPhase) * profile.horizontal * delta;
          p.y += p.vy * delta;
          p.rotation += p.spin * delta;
          p.sx = Math.cos(this.time + p.scalePhase) * profile.scale;
          p.sy = Math.sin(this.time + p.scalePhase) * profile.scale;
          const width = Math.abs(layer.batch.width * p.sx * profile.scale),
            height = Math.abs(layer.batch.height * p.sy * profile.scale);
          if (p.x + width / 2 < -layer.width) p.x = layer.width + width / 2;
          else if (p.x - width / 2 > layer.width) p.x = -layer.width - width / 2;
          if (p.y - height / 2 > layer.height) {
            p.x = this.random() * layer.width;
            p.y = -this.random() * 50 - height;
            p.positionPhase = this.random() * Math.PI * 2;
            p.scalePhase = this.random() * Math.PI * 2;
            p.vy = (0.5 + this.random() * 1.5 + (0.1 + this.random() * 0.9)) * profile.speed;
            p.spin = this.random() * 0.015 * (this.random() < 0.5 ? 1 : -1);
          }
        } else {
          p.y += p.vy * delta;
          if (this.weather !== "rain") {
            p.x += p.vx * delta;
            p.rotation += p.spin * delta;
          }
          const width = Math.abs(layer.batch.width * p.sx),
            height = Math.abs(layer.batch.height * p.sy);
          if (p.y - height / 2 > layer.height || p.x < -width || p.x > layer.width + width) this.reset(layer, p, false);
        }
      }
      this.write(layer);
    }
  }
  private write(layer: Layer): void {
    const data = layer.batch.instances,
      columns = this.weather === "rain" ? 5 : this.weather === "petals" ? 1 : 10;
    layer.particles.forEach((p, index) => {
      const offset = index * 10;
      data[offset] = p.x;
      data[offset + 1] = p.y;
      data[offset + 2] = p.rotation;
      data[offset + 3] = p.sx;
      data[offset + 4] = p.sy;
      data[offset + 5] = p.alpha;
      data[offset + 6] = p.frame / columns;
      data[offset + 7] = 0;
      data[offset + 8] = (p.frame + 1) / columns;
      data[offset + 9] = 1;
    });
    layer.batch.revision++;
  }
  snapshot(): unknown {
    return (this.saved ??= {
      version: 1,
      weather: this.weather,
      seed: this.seed,
      time: this.time,
      layers: this.layers.map((layer) => layer.particles.map((p) => ({ ...p }))),
    });
  }
  restore(value: unknown): void {
    const state = object(value);
    if (
      state.version !== 1 ||
      state.weather !== this.weather ||
      !Array.isArray(state.layers) ||
      state.layers.length !== this.layers.length
    )
      throw new TypeError("Invalid weather snapshot");
    this.seed = finite(state.seed, 0x51a7e) >>> 0;
    this.time = finite(state.time, 0);
    state.layers.forEach((entries, index) => {
      const layer = this.layers[index]!;
      if (!Array.isArray(entries) || entries.length !== layer.particles.length)
        throw new TypeError("Weather particle count changed");
      entries.forEach((entry, index) => {
        const data = object(entry),
          particle = layer.particles[index]!;
        for (const key of Object.keys(particle) as (keyof Particle)[]) {
          const value = data[key];
          if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Invalid weather particle");
          particle[key] = value;
        }
      });
      this.write(layer);
    });
    this.saved = undefined;
  }
  dispose(): void {
    this.disposed = true;
  }
}
