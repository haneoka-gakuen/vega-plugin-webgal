import type { AdvCommand, AdvCommandService } from "@haneoka/vega";
import type { VegaJsonObject } from "@haneoka/vega-protocol";
import type { VegaWebUiSlotContext } from "@haneoka/vega/web";

type CommandContext = Parameters<AdvCommandService["executeCommand"]>[2];
interface IntroState extends VegaJsonObject {
  text: string;
  elapsed: number;
  delay: number;
  userForward: boolean;
  revealed: number;
  revealAt: number;
  backgroundRef: string;
  backgroundColor: string;
  fontColor: string;
  fontSize: string;
  animation: string;
}
const object = (value: unknown): VegaJsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as VegaJsonObject) : {};
const lines = (text: string) => text.split(/(?<!\\)\|/u).map((line) => line.replace(/\\\|/gu, "|"));
const introOf = (state: { pluginState?: unknown }) =>
  object(object(state.pluginState)["haneoka.webgal-runtime"]).intro as IntroState | undefined;

export async function executeIntro(command: AdvCommand, context: CommandContext, signal?: AbortSignal): Promise<void> {
  if (context.Model.shouldShortCut || signal?.aborted) return;
  const userForward = command.userForward === true;
  const intro: IntroState = {
    text: String(command.text ?? ""),
    elapsed: 0,
    delay: Math.max(0, Number.isFinite(Number(command.delayTime)) ? Number(command.delayTime) : 1500),
    userForward,
    revealed: 1,
    revealAt: 0,
    backgroundRef: String(command.backgroundRef ?? ""),
    backgroundColor: String(command.backgroundColor ?? "rgba(0,0,0,1)"),
    fontColor: String(command.fontColor ?? "white"),
    fontSize: String(command.fontSize ?? "medium"),
    animation: String(command.animation ?? "fadeIn"),
  };
  const state = context.state,
    pluginState = object(state.pluginState);
  const compatibility = object(pluginState["haneoka.webgal-runtime"]);
  state.pluginState = { ...pluginState, "haneoka.webgal-runtime": { ...compatibility, intro } };
  const count = lines(intro.text).length,
    hold = userForward || command.hold === true;
  const duration = 1000 + intro.delay * count;
  const lifetime = new AbortController();
  const clock = context.SceneRoot.storyClock;
  let releaseClock: (() => void) | undefined;
  let frame = 0,
    last = clock ? clock.nowSeconds() * 1000 : performance.now(),
    finished = false;
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      releaseClock?.();
      signal?.removeEventListener("abort", finish);
      lifetime.abort();
      const current = object(object(state.pluginState)["haneoka.webgal-runtime"]);
      if (current.intro === intro) {
        const { intro: _, ...rest } = current;
        state.pluginState = { ...object(state.pluginState), "haneoka.webgal-runtime": rest };
      }
      resolve();
    };
    const tick = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      if (!state.paused) intro.elapsed += delta * (clock ? 1 : context.Model.getCurrentSpeedRate());
      if (!hold && intro.elapsed >= duration) finish();
      else if (!clock) frame = requestAnimationFrame(tick);
    };
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
    else if (clock) releaseClock = clock.subscribe(seconds => tick(seconds * 1000), finish);
    else frame = requestAnimationFrame(tick);
  });
  const input = async () => {
    while (!finished) {
      await context.Model.waitForNext(lifetime.signal);
      if (finished) return;
      if (state.paused) continue;
      if (userForward ? intro.revealed >= count : intro.elapsed >= intro.delay * (count - 1)) finish();
      else if (userForward) {
        intro.revealed = count;
        intro.revealAt = intro.elapsed;
      } else intro.elapsed = Math.min(duration, intro.elapsed + intro.delay);
    }
  };
  const reading = input();
  await completion;
  await reading;
}

export function mountIntroPresentation(host: HTMLElement, context: VegaWebUiSlotContext) {
  const document = host.ownerDocument,
    root = document.createElement("div"),
    content = document.createElement("div");
  root.className = "vega-webgal-intro";
  root.hidden = true;
  Object.assign(root.style, {
    position: "absolute",
    inset: "0",
    zIndex: "11",
    pointerEvents: "none",
    overflow: "hidden",
    boxSizing: "border-box",
    backgroundPosition: "center",
    backgroundSize: "cover",
    fontFamily: '"WebgalUI",serif',
  });
  Object.assign(content.style, { padding: "3em 4em", boxSizing: "border-box", width: "100%", height: "100%" });
  root.append(content);
  host.append(root);
  let current: IntroState | undefined,
    frame = 0,
    disposed = false,
    resourceRelease: (() => void) | undefined;
  let animations: { element: HTMLElement; animation: Animation; offset: number }[] = [];
  const keyframes: Record<string, Keyframe[]> = {
    fadeIn: [{ opacity: 0 }, { opacity: 1 }],
    slideIn: [
      { opacity: 0, transform: "translateX(-100%)" },
      { opacity: 1, transform: "translateX(0)" },
    ],
    typingEffect: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
    pixelateEffect: [
      { opacity: 0, filter: "none" },
      { opacity: 0.5, filter: "blur(5px)" },
      { opacity: 1, filter: "none" },
    ],
    revealAnimation: [
      { opacity: 0, clipPath: "inset(0 100% 0 0)" },
      { opacity: 1, clipPath: "inset(0 0 0 0)" },
    ],
  };
  const update = () => {
    if (disposed || context.signal.aborted) return;
    const intro = introOf(context.state);
    root.hidden = !intro || !context.state.ready || context.state.loading || context.state.seeking;
    if (intro !== current) {
      animations.forEach((item) => item.animation.cancel());
      animations = [];
      content.replaceChildren();
      resourceRelease?.();
      resourceRelease = undefined;
      current = intro;
      root.style.backgroundImage = "none";
      if (intro) {
        root.style.backgroundColor = intro.backgroundColor;
        root.style.color = intro.fontColor;
        root.style.fontSize = `${intro.fontSize === "small" ? 2.8 : intro.fontSize === "large" ? 4.2 : 3.5}cqw`;
        lines(intro.text).forEach((line, index) => {
          const element = document.createElement("div");
          element.textContent = line || "\u00a0";
          content.append(element);
          const animation = element.animate(keyframes[intro.animation] ?? keyframes.fadeIn!, {
            duration: ["pixelateEffect", "revealAnimation"].includes(intro.animation) ? 3000 : 1500,
            easing: "ease-out",
            fill: "both",
          });
          animation.pause();
          animations.push({ element, animation, offset: index * intro.delay });
        });
        if (intro.backgroundRef && context.resources)
          void context.resources
            .resolveRenderable(intro.backgroundRef, context.signal)
            .then((resource) => {
              if (disposed || current !== intro) {
                resource.release();
                return;
              }
              resourceRelease = resource.release;
              root.style.backgroundImage = `url(${JSON.stringify(resource.url)})`;
            })
            .catch(() => undefined);
      }
    }
    if (intro) {
      const reduced = document.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches;
      for (const [index, item] of animations.entries()) {
        const offset = intro.userForward ? (index === 0 ? 0 : intro.revealAt) : item.offset;
        item.element.style.visibility = (intro.userForward ? index >= intro.revealed : intro.elapsed < offset)
          ? "hidden"
          : "visible";
        item.animation.currentTime = reduced
          ? (item.animation.effect!.getComputedTiming().endTime as number)
          : Math.max(0, intro.elapsed - offset);
      }
    }
    frame = requestAnimationFrame(update);
  };
  update();
  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      animations.forEach((item) => item.animation.cancel());
      resourceRelease?.();
      root.remove();
    },
  };
}
