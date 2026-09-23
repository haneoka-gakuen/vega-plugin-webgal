import { Container, filters, type Filter, type FilterSystem, type RenderTexture, type Texture } from "pixi.js";
import type {
  StoryFilterContext,
  StoryFilterImage,
  StoryFilterSurface,
  StoryScreenFilterController,
  StoryScreenFilterProvider,
} from "@haneoka/vega/renderer-kit";
import { PixiTransformFilters, type PixiTransformFilterSnapshot } from "./TransformFilters.js";
import { PIXI_TRANSFORM_DEFAULTS } from "./TransformTimeline.js";
type Face = StoryFilterSurface & {
  _frame: { width: number; height: number };
  filterFrame: { x: number; y: number; width: number; height: number };
};
const imageValue = (value: unknown): unknown => {
  const texture = value as Texture | undefined;
  if (!texture?.baseTexture) return value;
  const base = texture.baseTexture,
    resource = base.resource as unknown as {
      source?: object;
      width?: number;
      height?: number;
    };
  if (!resource?.source) throw Error("Filter texture has no image source");
  return {
    source: resource.source,
    width: base.width,
    height: base.height,
    revision: base.dirtyId,
    nearest: base.scaleMode === 0,
    mipmap: base.mipmap >= 1 && (base.mipmap !== 1 || base.isPowerOfTwo),
  } satisfies StoryFilterImage;
};
class ScreenFilterController implements StoryScreenFilterController {
  private readonly owner = new Container();
  private readonly filters = new PixiTransformFilters();
  private colorMatrix: InstanceType<typeof filters.ColorMatrixFilter> | undefined;
  get active() {
    return Boolean(this.owner.filters?.length);
  }
  get padding() {
    return (this.owner.filters ?? []).reduce((sum, filter) => sum + Math.max(0, filter.padding), 0);
  }
  configure(values: Readonly<Record<string, number>>) {
    const transform = Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith("colorMatrix")));
    this.filters.apply(this.owner, transform);
    if (values.colorMatrixEnabled === 1) {
      const matrix = Array.from(
        { length: 20 },
        (_, index) =>
          values[`colorMatrix${index}`] ?? Number(index === 0 || index === 6 || index === 12 || index === 18),
      );
      const filter = this.colorMatrix ?? new filters.ColorMatrixFilter();
      filter.matrix = matrix as unknown as typeof filter.matrix;
      if (!this.colorMatrix) this.owner.filters = [...(this.owner.filters ?? []), filter];
      this.colorMatrix = filter;
    } else if (this.colorMatrix) {
      this.owner.filters = (this.owner.filters ?? []).filter((filter) => filter !== this.colorMatrix);
      this.colorMatrix.destroy();
      this.colorMatrix = undefined;
    }
  }
  snapshot() {
    return {
      ...this.filters.snapshot(),
      ...(this.colorMatrix ? { colorMatrixLast: this.owner.filters?.at(-1) === this.colorMatrix } : {}),
    };
  }
  restore(value: unknown) {
    const saved = (value ?? {}) as PixiTransformFilterSnapshot & { colorMatrixLast?: boolean };
    this.filters.restore(saved);
    if (this.colorMatrix && saved.colorMatrixLast !== undefined) {
      const other = (this.owner.filters ?? []).filter((filter) => filter !== this.colorMatrix);
      this.owner.filters = saved.colorMatrixLast ? [...other, this.colorMatrix] : [this.colorMatrix, ...other];
    }
  }
  dispose() {
    this.filters.dispose();
    this.colorMatrix?.destroy();
    this.colorMatrix = undefined;
    this.owner.filters = null;
    this.owner.destroy();
  }
  render(context: StoryFilterContext): void {
    const wrappers = new Map<StoryFilterSurface, Face>();
    const face = (surface: StoryFilterSurface): Face => {
      let result = wrappers.get(surface);
      if (!result) {
        result = Object.assign(Object.create(null), surface, {
          _frame: { width: surface.width, height: surface.height },
          filterFrame: {
            x: context.x,
            y: context.y,
            width: context.frameWidth,
            height: context.frameHeight,
          },
        });
        wrappers.set(surface, result!);
      }
      return result!;
    };
    const original = new Map<Face, StoryFilterSurface>();
    const wrap = (surface: StoryFilterSurface) => {
      const value = face(surface);
      original.set(value, surface);
      return value;
    };
    const input = wrap(context.input),
      output = wrap(context.output);
    let bound = output,
      shader: Filter | undefined;
    const draw = (filter: Filter, source: Face, destination: Face) => {
      const uniforms: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(filter.uniforms))
        uniforms[name] = original.get(value as Face) ?? imageValue(value);
      context.draw(
        {
          program: filter.program,
          vertex: filter.program.vertexSrc,
          fragment: filter.program.fragmentSrc,
          legacy: /\battribute\s+\w+\s+aTextureCoord\b/u.test(filter.program.vertexSrc),
          blend: filter.state.blend,
          uniforms,
        },
        original.get(source)!,
        original.get(destination)!,
      );
    };
    const manager = {
      getFilterTexture: () => wrap(context.acquire()),
      returnFilterTexture: (surface: Face) => {
        const actual = original.get(surface);
        if (actual) context.release(actual);
      },
      applyFilter: (filter: Filter, source: Face, destination: Face) => {
        bound = destination;
        shader = filter;
        draw(filter, source, destination);
      },
      bindAndClear: (surface: Face) => {
        bound = surface;
      },
      renderer: {
        width: input.width,
        height: input.height,
        shader: {
          bind: (filter: Filter) => {
            shader = filter;
          },
        },
        geometry: {
          draw: () => {
            if (!shader) throw Error("Filter shader is not bound");
            draw(shader, shader.uniforms.uSampler as Face, bound);
          },
        },
      },
    } as unknown as FilterSystem;
    const active = this.owner.filters ?? [];
    if (!active.length) return;
    const intermediate = active.length > 1 ? wrap(context.acquire()) : undefined;
    let source = input;
    for (let index = 0; index < active.length; index++) {
      const last = index === active.length - 1;
      const destination = last ? output : source === intermediate ? input : intermediate!;
      active[index]!.apply(manager, source as unknown as RenderTexture, destination as unknown as RenderTexture, 1);
      source = destination;
    }
    if (intermediate) context.release(original.get(intermediate)!);
  }
}
export const screenFilterProvider: StoryScreenFilterProvider = Object.freeze({
  channels: [
    ...Object.keys(PIXI_TRANSFORM_DEFAULTS).filter((key) => !["x", "y", "scaleX", "scaleY", "rotation"].includes(key)),
    "colorMatrixEnabled",
    ...Array.from({ length: 20 }, (_, index) => `colorMatrix${index}`),
  ],
  create: () => new ScreenFilterController(),
});
