import { PixiStoryScene } from "@haneoka/vega-renderer-pixi";
import type { Container } from "pixi.js";
import {
  PIXI_TRANSFORM_DEFAULTS,
  prepareTransformTimeline,
  transformValues,
  type PixiTransformFrame,
  type PixiTransformOptions,
  type PixiTransformValues,
} from "./TransformTimeline.js";
import { PixiTransformFilters, type PixiTransformFilterSnapshot } from "./TransformFilters.js";

const finite = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
interface TransformSnapshot {
  readonly target: string;
  readonly current: PixiTransformValues;
  readonly planned: PixiTransformValues;
  readonly filters: PixiTransformFilterSnapshot;
}

export class WebGalStoryScene extends PixiStoryScene {
  private readonly transforms = new Map<
    string,
    {
      current: PixiTransformValues;
      planned: PixiTransformValues;
      filters: PixiTransformFilters;
    }
  >();
  private readonly transformAnimations = new Map<
    string,
    { target: string; cancel: (finish: boolean) => void; keep: boolean }
  >();
  private transformSequence = 0;

  clearScreenTransform(target: string): void {
    for (const animation of this.transformAnimations.values()) if (animation.target === target) animation.cancel(false);
    if (target === "stage-main") this.clearColorMatrix();
    const state = this.transforms.get(target);
    if (!state) return;
    state.current = {};
    state.planned = {};
    this.presentTransform(target);
    state.filters.dispose();
    this.transforms.delete(target);
  }

  override createSeekSnapshot(): ReturnType<PixiStoryScene["createSeekSnapshot"]> {
    const snapshot = super.createSeekSnapshot();
    if (!snapshot) return null;
    const transforms: TransformSnapshot[] = [...this.transforms].map(([target, state]) => ({
      target,
      current: { ...state.current },
      planned: { ...state.planned },
      filters: state.filters.snapshot(),
    }));
    return {
      ...snapshot,
      rendererState: {
        ...object(snapshot.rendererState),
        webgal: { transforms },
      },
    };
  }

  override async restoreSeekSnapshot(
    snapshot: Parameters<PixiStoryScene["restoreSeekSnapshot"]>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted || this.pixiDestroyed) return;
    this.cancelTransitionsForSeek();
    this.clearTransforms();
    await super.restoreSeekSnapshot(snapshot, signal);
    if (signal?.aborted || this.pixiDestroyed) return;
    const saved = object(object(snapshot.rendererState).webgal).transforms as TransformSnapshot[] | undefined;
    for (const item of saved ?? []) {
      const filters = new PixiTransformFilters();
      this.transforms.set(item.target, {
        current: { ...item.current },
        planned: { ...item.planned },
        filters,
      });
      this.presentTransform(item.target);
      filters.restore(item.filters);
    }
    this.requestRender();
  }

  override resize(): void {
    super.resize();
    for (const target of this.transforms.keys()) this.presentTransform(target);
  }
  override async setBackground(...args: Parameters<PixiStoryScene["setBackground"]>): Promise<boolean> {
    const result = await super.setBackground(...args);
    this.presentTransform("bg-main");
    return result;
  }
  override async placeCharacter(...args: Parameters<PixiStoryScene["placeCharacter"]>): Promise<void> {
    await super.placeCharacter(...args);
    const command = args[0];
    const target = command.targetName || command.targets?.[0]?.target || command.characterKey;
    if (target) this.presentTransform(target);
  }
  override setWorldTransform(...args: Parameters<PixiStoryScene["setWorldTransform"]>): void {
    super.setWorldTransform(...args);
    const animated = this.transforms.get("stage-main");
    if (!animated) return;
    const values = {
      x: finite(args[0].x),
      y: finite(args[0].y),
      scaleX: this.world.scale.x,
      scaleY: this.world.scale.y,
      rotation: this.world.rotation,
    };
    Object.assign(animated.current, values);
    Object.assign(animated.planned, values);
  }
  override async destroy(...args: Parameters<PixiStoryScene["destroy"]>): Promise<void> {
    this.cancelTransitionsForSeek();
    this.clearTransforms();
    await super.destroy(...args);
  }

  setTransform(target: string, frame: PixiTransformFrame, options: PixiTransformOptions = {}): Promise<void> {
    const previous = this.transforms.get(target)?.planned;
    const incoming = transformValues(frame);
    const initial = previous ? { ...PIXI_TRANSFORM_DEFAULTS, ...previous } : { ...incoming, alpha: 0 };
    const selected =
      options.parallel || options.ignoreDefault
        ? Object.fromEntries(Object.keys(incoming).map((key) => [key, initial[key as keyof typeof initial]]))
        : initial;
    const expand = (values: PixiTransformValues): PixiTransformFrame => {
      const { x, y, scaleX, scaleY, ...rest } = values;
      return {
        ...rest,
        position: { x, y },
        scale: { x: scaleX, y: scaleY },
        duration: 0,
      };
    };
    return this.animateTransform(
      target,
      [
        expand(selected),
        {
          ...frame,
          duration: options.duration ?? 500,
          ease: options.ease ?? "",
        },
      ],
      options,
    );
  }

  animateTransform(
    target: string,
    frames: readonly PixiTransformFrame[],
    options: PixiTransformOptions = {},
  ): Promise<void> {
    if (options.signal?.aborted || this.pixiDestroyed || !frames.length) return Promise.resolve();
    const primaryKey = JSON.stringify(["transform", target]);
    if (!options.parallel) {
      const prior = this.transformAnimations.get(primaryKey);
      prior?.cancel(!prior.keep);
    }
    const key = options.parallel ? JSON.stringify(["transform", target, ++this.transformSequence]) : primaryKey;
    let state = this.transforms.get(target);
    if (!state) {
      state = { current: {}, planned: {}, filters: new PixiTransformFilters() };
      this.transforms.set(target, state);
    }
    const timeline = prepareTransformTimeline(frames, state.planned, options);
    state.planned = { ...state.planned, ...timeline.end };
    const update = (values: PixiTransformValues) => {
      Object.assign(state.current, values);
      this.presentTransform(target);
    };
    const app = this.app;
    if (!app || this.pixiDeterministicReplay || timeline.duration === 0) {
      update(timeline.end);
      return Promise.resolve();
    }
    update(timeline.start);
    return new Promise((resolve) => {
      let elapsed = 0;
      let settled = false;
      let release = () => {};
      const cancel = (finish = false) => {
        if (settled) return;
        settled = true;
        app.ticker.remove(tick);
        options.signal?.removeEventListener("abort", abort);
        this.animations.delete(key);
        this.transformAnimations.delete(key);
        if (finish) update(timeline.end);
        release();
        resolve();
      };
      const abort = () => cancel(false);
      const tick = (delta: number) => {
        if (this.context.state.paused) return;
        elapsed += Math.max(0, finite(delta)) * (1000 / 60) * (this.context.state.fastForward ? 2 : 1);
        update(timeline.sample(Math.min(elapsed, timeline.duration)));
        if (elapsed >= timeline.duration) cancel(true);
      };
      this.animations.set(key, { cancel: abort });
      this.transformAnimations.set(key, {
        target,
        cancel,
        keep: options.keep === true,
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      app.ticker.add(tick);
      release = this.retainContinuousRender();
      if (options.signal?.aborted) abort();
    });
  }

  private presentTransform(target: string): void {
    const state = this.transforms.get(target);
    if (!state) return;
    const v = { ...PIXI_TRANSFORM_DEFAULTS, ...state.current };
    let object: Container | undefined;
    if (target === "stage-main") {
      object = this.world;
      object.pivot.set(this.options.referenceWidth / 2, this.options.referenceHeight / 2);
      object.position.set(this.options.referenceWidth / 2 + v.x, this.options.referenceHeight / 2 + v.y);
      object.scale.set(v.scaleX, v.scaleY);
    } else if (target === "bg-main") {
      const sprite = this.pixiBackgroundLease?.sprite;
      if (!sprite) return;
      this.fitLease(this.pixiBackgroundLease, "cover");
      object = sprite;
      sprite.x += v.x;
      sprite.y += v.y;
      sprite.scale.x *= v.scaleX;
      sprite.scale.y *= v.scaleY;
    } else {
      const character = this.pixiCharacters.get(target);
      if (!character) return;
      this.layoutCharacter(character);
      object = character.sprite;
      object.x += v.x;
      object.y += v.y;
      object.scale.x *= v.scaleX;
      object.scale.y *= v.scaleY;
    }
    object.rotation = v.rotation;
    object.alpha = 1;
    state.filters.apply(object, v);
    this.requestRender();
  }

  private clearTransforms(): void {
    for (const state of this.transforms.values()) state.filters.dispose();
    this.transforms.clear();
  }
}
