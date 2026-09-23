import { storyResourceContentType } from "@haneoka/vega/renderer-kit";
import type {
  StoryRendererEffectContribution,
  StoryScreenSpriteImage,
  StoryResourceResolver,
} from "@haneoka/vega/renderer-kit";
import { StockWeatherSimulation, type StockWeather } from "./StockParticles.js";
const imageCaches = new WeakMap<object, Map<string, Promise<StoryScreenSpriteImage>>>();
function imageFor(resources: StoryResourceResolver, source: string): Promise<StoryScreenSpriteImage> {
  let cache = imageCaches.get(resources);
  if (!cache) {
    cache = new Map();
    imageCaches.set(resources, cache);
  }
  let pending = cache.get(source);
  if (!pending) {
    pending = (async () => {
      const lease = resources.resolveRenderable
        ? await resources.resolveRenderable(source)
        : await (async () => {
            const bytes = await resources.load(source),
              url = URL.createObjectURL(
                new Blob([new Uint8Array(bytes)], { type: storyResourceContentType(source, bytes) }),
              );
            return { url, release: () => URL.revokeObjectURL(url) };
          })();
      try {
        const image = new Image();
        image.decoding = "async";
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Weather texture could not be decoded"));
          image.src = lease.url;
        });
        return { source: image, width: image.naturalWidth, height: image.naturalHeight };
      } finally {
        lease.release();
      }
    })();
    cache.set(source, pending);
    void pending.catch(() => {
      if (cache!.get(source) === pending) cache!.delete(source);
    });
  }
  return pending;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export const stockWeatherEffect: StoryRendererEffectContribution = {
  id: "stockWeather",
  effectType: "webgal.weather",
  name: "Weather",
  async create(definition, context, signal) {
    const weather = String(definition.weather) as StockWeather;
    if (!["rain", "snow", "heavy-snow", "petals"].includes(weather))
      throw new RangeError(`Unknown weather effect: ${weather}`);
    const options = object(definition.options),
      stage = object(context.runtime.stage);
    const { stockTextures } = await import("./StockTextures.js");
    const source =
      typeof options.texture === "string"
        ? options.texture
        : stockTextures[weather === "heavy-snow" ? "snow" : weather];
    const image = await imageFor(context.resources, source);
    signal.throwIfAborted();
    return new StockWeatherSimulation(weather, image, {
      width: stage.screenReferenceWidth ?? 2560,
      height: stage.screenReferenceHeight ?? 1440,
      ...options,
    });
  },
};
