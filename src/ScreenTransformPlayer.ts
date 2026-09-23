import type { StorySceneBackend } from "@haneoka/vega";
import {
  PIXI_TRANSFORM_DEFAULTS,
  prepareTransformTimeline,
  transformValues,
  type PixiTransformFrame,
  type PixiTransformOptions,
  type PixiTransformValues,
} from "./TransformTimeline.js";
const running = new WeakMap<
  StorySceneBackend,
  Map<string, { target: string; cancel: (finish: boolean) => void; keep: boolean }>
>();
let sequence = 0;
export function clearScreenTransform(backend: StorySceneBackend, target: string): void {
  for (const animation of running.get(backend)?.values() ?? [])
    if (animation.target === target) animation.cancel(false);
  if (backend.clearScreenTransform) backend.clearScreenTransform(target);
  else backend.writeScreenTransform?.(target, { current: {}, planned: {} });
}
export async function playScreenTransform(
  backend: StorySceneBackend,
  target: string,
  frames: readonly PixiTransformFrame[],
  options: PixiTransformOptions,
  state: Record<string, unknown>,
  immediate: boolean,
): Promise<void> {
  if (!backend.readScreenTransform || !backend.writeScreenTransform)
    throw Error("The active renderer does not support screen transforms");
  if (options.signal?.aborted || !frames.length) return;
  for (const frame of frames)
    for (const [channel, value] of Object.entries(transformValues(frame)))
      if (
        !backend.screenTransformChannels?.includes(channel) &&
        value !== PIXI_TRANSFORM_DEFAULTS[channel as keyof typeof PIXI_TRANSFORM_DEFAULTS]
      )
        throw Error(`Screen transform channel is unavailable in this renderer: ${channel}`);
  let animations = running.get(backend);
  if (!animations) {
    animations = new Map();
    running.set(backend, animations);
  }
  const key = JSON.stringify(options.parallel ? [target, ++sequence] : [target]);
  if (!options.parallel) {
    const old = animations.get(key);
    old?.cancel(!old.keep);
  }
  const existing = backend.readScreenTransform(target),
    timeline = prepareTransformTimeline(frames, existing?.planned ?? {}, options);
  const update = (values: PixiTransformValues) => {
    const latest = backend.readScreenTransform!(target);
    if (
      Object.entries(values).every(([key, value]) => latest?.current[key] === value) &&
      Object.entries(timeline.end).every(([key, value]) => latest?.planned[key] === value)
    )
      return;
    backend.writeScreenTransform!(target, {
      current: { ...latest?.current, ...values },
      planned: { ...latest?.planned, ...timeline.end },
    });
  };
  if (immediate || timeline.duration === 0) {
    update(timeline.end);
    return;
  }
  update(timeline.start);
  await new Promise<void>((resolve) => {
    let elapsed = 0,
      last = performance.now(),
      request = 0,
      finished = false;
    const cancel = (finish: boolean) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(request);
      options.signal?.removeEventListener("abort", abort);
      animations!.delete(key);
      if (finish) update(timeline.end);
      resolve();
    };
    const abort = () => cancel(false);
    const tick = (now: number) => {
      if (finished) return;
      const delta = Math.max(0, now - last);
      last = now;
      if (state.paused !== true) elapsed += delta * (state.fastForward === true ? 2 : 1);
      update(timeline.sample(Math.min(elapsed, timeline.duration)));
      if (elapsed >= timeline.duration) cancel(true);
      else request = requestAnimationFrame(tick);
    };
    animations!.set(key, { target, cancel, keep: options.keep === true });
    options.signal?.addEventListener("abort", abort, { once: true });
    request = requestAnimationFrame(tick);
    if (options.signal?.aborted) abort();
  });
}
export function setScreenTransform(
  backend: StorySceneBackend,
  target: string,
  frame: PixiTransformFrame,
  options: PixiTransformOptions,
  state: Record<string, unknown>,
  immediate: boolean,
): Promise<void> {
  const previous = backend.readScreenTransform?.(target)?.planned,
    incoming = transformValues(frame);
  const initial = previous ? { ...PIXI_TRANSFORM_DEFAULTS, ...previous } : { ...incoming, alpha: 0 };
  const selected =
    options.parallel || options.ignoreDefault
      ? Object.fromEntries(Object.keys(incoming).map((key) => [key, initial[key as keyof typeof initial]]))
      : initial;
  const { x, y, scaleX, scaleY, ...rest } = selected;
  return playScreenTransform(
    backend,
    target,
    [
      {
        ...rest,
        position: { x, y },
        scale: { x: scaleX, y: scaleY },
        duration: 0,
      },
      { ...frame, duration: options.duration ?? 500, ease: options.ease ?? "" },
    ],
    options,
    state,
    immediate,
  );
}
