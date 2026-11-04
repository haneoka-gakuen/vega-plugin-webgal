import type { StorySceneBackend } from "@haneoka/vega";
import {
  WEBGAL_TRANSFORM_DEFAULTS,
  prepareTransformTimeline,
  transformValues,
  type WebGalTransformFrame,
  type WebGalTransformOptions,
  type WebGalTransformValues,
} from "./TransformTimeline.js";
export function clearScreenTransform(backend: StorySceneBackend, target: string): void {
  backend.cancelPropertyAnimations?.(target);
  if (backend.clearScreenTransform) backend.clearScreenTransform(target);
  else backend.writeScreenTransform?.(target, { current: {}, planned: {} });
}
export async function playScreenTransform(
  backend: StorySceneBackend,
  target: string,
  frames: readonly WebGalTransformFrame[],
  options: WebGalTransformOptions,
  _state: Record<string, unknown>,
  immediate: boolean,
): Promise<void> {
  if (!backend.playPropertyAnimation || !backend.readScreenTransform)
    throw Error("The active renderer does not support property animation");
  if (options.signal?.aborted || !frames.length) return;
  for (const frame of frames)
    for (const [channel, value] of Object.entries(transformValues(frame)))
      if (!backend.screenTransformChannels?.includes(channel) &&
          value !== WEBGAL_TRANSFORM_DEFAULTS[channel as keyof typeof WEBGAL_TRANSFORM_DEFAULTS])
        throw Error(`Screen transform channel is unavailable in this renderer: ${channel}`);
  const existing = backend.readScreenTransform(target);
  const timeline = prepareTransformTimeline(frames, (options.animationVersion === 2 ? existing?.current : existing?.planned) ?? {}, options);
  await backend.playPropertyAnimation(target, timeline.clip, { ...options, immediate });
}
export function setScreenTransform(
  backend: StorySceneBackend,
  target: string,
  frame: WebGalTransformFrame,
  options: WebGalTransformOptions,
  state: Record<string, unknown>,
  immediate: boolean,
): Promise<void> {
  const previous = backend.readScreenTransform?.(target)?.planned,
    incoming = transformValues(frame);
  const initial = previous ? { ...WEBGAL_TRANSFORM_DEFAULTS, ...previous } : { ...incoming, alpha: 0 };
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
