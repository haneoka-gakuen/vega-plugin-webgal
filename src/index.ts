import { stockWeatherEffect } from "./StockEffects.js";
import { FILM_FONT_FAMILY, FILM_FONT_URL, FILM_PRESENTATION_ID, mountFilmPresentation } from "./FilmPresentation.js";
import { WebGalStoryScene } from "./WebGalStoryScene.js";
import { STORY_SCREEN_FILTER_PROVIDER } from "@haneoka/vega/renderer-kit";
import { screenFilterProvider } from "./ScreenFilterProvider.js";
import { clearScreenTransform, playScreenTransform, setScreenTransform } from "./ScreenTransformPlayer.js";
import type { PixiTransformFrame, PixiTransformOptions } from "./TransformTimeline.js";
export { WebGalStoryScene } from "./WebGalStoryScene.js";
export * from "./TransformTimeline.js";
import { WEBGAL_COMMAND_TYPES, WEBGAL_COMMAND_DEFINITIONS } from "./commands.js";
export * from "./commands.js";
import {
  defineVegaPlugin,
  type AdvCommand,
  type StorySceneBackend,
  type StoryVideoLayout,
  type VegaPlugin,
} from "@haneoka/vega";
import { PixiStoryScene, type PixiRendererOptions } from "@haneoka/vega-renderer-pixi";

export const WEBGAL_COMPATIBILITY_BACKEND = "webgal-pixi";
export const WEBGAL_COMPATIBILITY_THEME = "webgal";

export interface WebGalCompatibilityOptions extends Omit<PixiRendererOptions, "profile" | "backend"> {
  readonly enableCommands?: boolean;
  readonly enableRenderer?: boolean;
  readonly enableTheme?: boolean;
  readonly enableUi?: boolean;
}

export interface WebGalPixiPerform {
  readonly action:
    "rain" | "snow" | "heavy-snow" | "petals" | "clear" | "blur" | "color-matrix" | "clear-color-matrix" | "transform";
  readonly target?: string;
  readonly value?: number;
  readonly values?: readonly number[];
  readonly options?: Readonly<Record<string, unknown>>;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
}

export const WEBGAL_THEME_CSS = String.raw`
[data-vega-theme="webgal"] {
  --vega-stage-background: #000;
  --vega-surface: rgb(19 21 29 / 92%);
  --vega-panel: rgb(22 24 34 / 78%);
  --vega-text: #fff;
  --vega-muted: rgb(255 255 255 / 68%);
  --vega-accent: #8fc8ff;
  color: #fff;
  color-scheme: dark;
}

[data-vega-theme="webgal"] .vega-portable-dialogue {
  inset:0; border:0; background:transparent; padding:0;
  font-family:"WebgalUI",system-ui,sans-serif;
  text-shadow:none;
}
[data-vega-theme="webgal"] .vega-portable-dialogue::before {
  left:.9765625cqw; right:.9765625cqw; bottom:1.388889cqh; top:auto;
  width:auto; height:22.916667cqh; transform:none;
  border-radius:11.458333cqh 1.388889cqh 1.388889cqh 11.458333cqh;
  background:linear-gradient(#f5f7fa,#bdc6de);
}
[data-vega-theme="webgal"] .vega-portable-speaker {
  left:6.8359375cqw; bottom:23.472222cqh; top:auto;
  width:max-content; min-width:0; max-width:80%; height:5.555556cqh;
  padding:0 2em; border:.277778cqh solid rgb(255 255 255 / 75%);
  border-radius:2.777778cqh; background:#0b346e;
  box-shadow:.208333cqh .208333cqh .694444cqh rgb(100 100 100 / 50%);
  color:white; font-size:3.555556cqh; font-weight:bold; line-height:4.722222cqh;
}
[data-vega-theme="webgal"] .vega-portable-text {
  left:8.7890625cqw; right:2.9296875cqw; bottom:6.25cqh; top:auto;
  width:auto; height:16.277778cqh;
  font-size:calc(3.644444cqh * var(--vega-text-size,1)); font-weight:bold; line-height:2.2;
  letter-spacing:.2em; color:#0b346e;
  -webkit-text-stroke:.1em white; paint-order:stroke fill; text-shadow:none;
}
[data-vega-theme="webgal"] .vega-portable-dialogue[data-window="center"]::before {
  inset:40% 0 auto; height:20%; border-radius:0; background:rgb(0 0 0 / 70%);
}
[data-vega-theme="webgal"] .vega-portable-dialogue[data-window="center"] .vega-portable-text {
  top:50%; bottom:auto; left:50%; width:86%; height:20%;
  color:white; -webkit-text-stroke:0; transform:translate(-50%,-50%);
}

[data-vega-theme="webgal"] .vega-default-toolbar {
  right: 2.2%;
  bottom: 2.2%;
  left: auto;
  width: auto;
  border: 0;
  background: transparent;
  box-shadow: none;
}

[data-vega-theme="webgal"] .vega-shell__menu-toggle {
  top: 2.2%;
  right: 2.2%;
}
`;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const finite = (value: unknown, fallback = 0): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const firstString = (...values: unknown[]): string =>
  values.map((value) => (typeof value === "string" ? value.trim() : "")).find(Boolean) ?? "";

const pixiScene = (backend: StorySceneBackend): PixiStoryScene => {
  if (
    backend instanceof PixiStoryScene ||
    (typeof (backend as PixiStoryScene).applyColorMatrix === "function" &&
      typeof (backend as PixiStoryScene).setWorldTransform === "function")
  ) {
    return backend as PixiStoryScene;
  }
  throw new Error("WebGAL Pixi command requires the webgal-pixi render backend");
};

const performPayload = (command: AdvCommand): WebGalPixiPerform => {
  const direct = object(command.perform ?? command.payload);
  const action = firstString(
    direct.action,
    command.action,
    direct.content,
    command.content,
    command.name,
    command.effect,
  ).toLowerCase();
  const normalized =
    action === "cherryblossoms" || action === "cherry-blossoms"
      ? "petals"
      : action === "heavysnow" || action === "heavy_snow"
        ? "heavy-snow"
        : action;
  return {
    action: normalized as WebGalPixiPerform["action"],
    ...(firstString(direct.target, command.targetName)
      ? { target: firstString(direct.target, command.targetName) }
      : {}),
    ...((direct.value ?? command.value) !== undefined ? { value: finite(direct.value ?? command.value) } : {}),
    ...(Array.isArray(direct.values) ? { values: direct.values.map(Number) } : {}),
    ...(Object.keys(object(direct.options)).length > 0 ? { options: object(direct.options) } : {}),
    ...((direct.x ?? command.x) !== undefined ? { x: finite(direct.x ?? command.x) } : {}),
    ...((direct.y ?? command.y) !== undefined ? { y: finite(direct.y ?? command.y) } : {}),
    ...((direct.scale ?? command.scale) !== undefined ? { scale: finite(direct.scale ?? command.scale, 1) } : {}),
    ...((direct.rotation ?? command.rotation) !== undefined
      ? { rotation: finite(direct.rotation ?? command.rotation) }
      : {}),
  };
};

export const executeWebGalPixiPerform = async (
  payload: WebGalPixiPerform,
  backend: StorySceneBackend,
  signal?: AbortSignal,
): Promise<void> => {
  switch (payload.action) {
    case "rain":
    case "snow":
    case "heavy-snow":
    case "petals":
      if (!backend.setScreenEffect) throw new Error("The renderer does not support screen effects");
      await backend.setScreenEffect(
        `webgal/${payload.action}`,
        { effectType: "webgal.weather", weather: payload.action, options: payload.options ?? {} },
        signal,
      );
      return;
    case "clear":
      for (const key of backend.screenEffectKeys ?? [])
        if (key.startsWith("webgal/") && (!payload.target || key === `webgal/${payload.target}`))
          backend.clearScreenEffects?.(key);
      return;
    case "blur": {
      const value = Math.max(0, finite(payload.value));
      if (backend.writeScreenTransform && backend.screenTransformChannels?.includes("blur")) {
        const target = payload.target || "bg-main",
          previous = backend.readScreenTransform?.(target);
        backend.writeScreenTransform(target, {
          current: { ...previous?.current, blur: value },
          planned: { ...previous?.planned, blur: value },
        });
      } else if (payload.target) await backend.setCharacterDoF(payload.target, value);
      else await backend.setBackgroundDoF(value);
      return;
    }
    case "color-matrix":
    case "clear-color-matrix": {
      const enabled = payload.action === "color-matrix",
        values = payload.values ?? [];
      if (enabled && (values.length !== 20 || values.some((value) => !Number.isFinite(value))))
        throw new TypeError("A color matrix must contain 20 finite values");
      if (backend.writeSceneTransform && backend.screenTransformChannels?.includes("colorMatrixEnabled")) {
        const target = payload.target || "stage-main",
          previous = backend.readSceneTransform?.(target);
        const matrix = {
          colorMatrixEnabled: Number(enabled),
          ...(enabled ? Object.fromEntries(values.map((value, index) => [`colorMatrix${index}`, value])) : {}),
        };
        backend.writeSceneTransform(target, {
          current: { ...previous?.current, ...matrix },
          planned: { ...previous?.planned, ...matrix },
        });
      } else if (enabled) pixiScene(backend).applyColorMatrix(values);
      else pixiScene(backend).clearColorMatrix();
      return;
    }
    case "transform":
      if (backend.writeScreenTransform) {
        const values = {
          x: finite(payload.x),
          y: finite(payload.y),
          scaleX: finite(payload.scale, 1),
          scaleY: finite(payload.scale, 1),
          rotation: (finite(payload.rotation) * Math.PI) / 180,
        };
        backend.writeScreenTransform("stage-main", { current: values, planned: values });
      } else
        pixiScene(backend).setWorldTransform({
          ...(payload.x !== undefined ? { x: payload.x } : {}),
          ...(payload.y !== undefined ? { y: payload.y } : {}),
          ...(payload.scale !== undefined ? { scale: payload.scale } : {}),
          ...(payload.rotation !== undefined ? { rotationDegrees: payload.rotation } : {}),
        });
      return;
    default:
      throw new RangeError(`Unsupported WebGAL Pixi action: ${payload.action}`);
  }
};

const extensionExecutor =
  (action: "pixi-init" | "pixi-perform" | "stage-transform" | "film-mode" | "set-transform" | "set-temp-animation") =>
  async (
    command: AdvCommand,
    context: {
      readonly SceneRoot: StorySceneBackend;
      readonly state: Record<string, unknown>;
      readonly Model: { readonly shouldShortCut: boolean };
    },
    signal?: AbortSignal,
  ): Promise<void> => {
    if (action === "set-transform" || action === "set-temp-animation") {
      const scene = context.SceneRoot as WebGalStoryScene;
      const target = firstString(command.targetName) || "0";
      if (typeof command.sourceIdentity === "string") {
        const pluginState = object(context.state.pluginState),
          compatibility = object(pluginState["haneoka.webgal-runtime"]),
          sources = object(compatibility.sources);
        const changed = sources[target] !== command.sourceIdentity;
        context.state.pluginState = {
          ...pluginState,
          "haneoka.webgal-runtime": { ...compatibility, sources: { ...sources, [target]: command.sourceIdentity } },
        };
        if (command.forgetSource === true) return;
        if (changed) clearScreenTransform(context.SceneRoot, target);
        if (
          !scene.setTransform &&
          !context.SceneRoot.writeScreenTransform &&
          !Object.keys(object(command.transform)).length
        )
          return;
      }
      const options: PixiTransformOptions = {
        duration: context.Model.shouldShortCut ? 0 : Math.max(0, finite(command.durationMs, 500)),
        ease: firstString(command.ease),
        writeDefault: command.writeDefault === true,
        ignoreDefault: command.ignoreDefault === true,
        parallel: command.parallel === true,
        keep: command.keep === true,
        ...(signal ? { signal } : {}),
      };
      if (action === "set-transform") {
        if (typeof scene.setTransform === "function")
          await scene.setTransform(target, object(command.transform) as PixiTransformFrame, options);
        else
          await setScreenTransform(
            context.SceneRoot,
            target,
            object(command.transform),
            options,
            context.state,
            context.Model.shouldShortCut,
          );
      } else {
        const frames = Array.isArray(command.frames)
          ? command.frames.map((value) => object(value) as PixiTransformFrame)
          : [];
        if (typeof scene.animateTransform === "function") await scene.animateTransform(target, frames, options);
        else
          await playScreenTransform(
            context.SceneRoot,
            target,
            frames,
            options,
            context.state,
            context.Model.shouldShortCut,
          );
      }
      return;
    }
    if (action === "pixi-init") {
      await executeWebGalPixiPerform({ action: "clear" }, context.SceneRoot);
      return;
    }
    if (action === "pixi-perform") {
      await executeWebGalPixiPerform(performPayload(command), context.SceneRoot, signal);
      return;
    }
    if (action === "stage-transform") {
      if (context.SceneRoot.writeScreenTransform) {
        const values = {
          x: finite(command.x),
          y: finite(command.y),
          scaleX: finite(command.scale, 1),
          scaleY: finite(command.scale, 1),
          rotation: (finite(command.rotation) * Math.PI) / 180,
        };
        context.SceneRoot.writeScreenTransform("stage-main", { current: values, planned: values });
        return;
      }
      pixiScene(context.SceneRoot).setWorldTransform({
        x: finite(command.x),
        y: finite(command.y),
        scale: finite(command.scale, 1),
        rotationDegrees: finite(command.rotation),
      });
      return;
    }
    const pluginState = object(context.state.pluginState),
      compatibility = object(pluginState["haneoka.webgal-runtime"]);
    const filmPreset = firstString(command.content, command.value);
    const enabled = typeof command.enabled === "boolean" ? command.enabled : filmPreset !== "" && filmPreset !== "none";
    const talk = object(context.state.talk),
      previous = object(compatibility.film);
    const video = object(context.state.video);
    const previousPresentation =
      previous.enabled === true ? previous.previousPresentation : (talk.presentation ?? "default");
    const previousVideoLayout = previous.enabled === true ? previous.previousVideoLayout : (video.layout ?? null);
    if (enabled) talk.presentation = FILM_PRESENTATION_ID;
    else if (talk.presentation === FILM_PRESENTATION_ID) talk.presentation = previousPresentation ?? "default";
    const videoLayout = enabled
      ? { viewport: [0, 0.12, 1, 0.76] as const, fit: "contain" as const, background: "#000000" }
      : previousVideoLayout && typeof previousVideoLayout === "object"
        ? (previousVideoLayout as StoryVideoLayout)
        : undefined;
    video.layout = videoLayout;
    context.SceneRoot.setVideoLayout?.(videoLayout);
    context.state.pluginState = {
      ...pluginState,
      "haneoka.webgal-runtime": {
        ...compatibility,
        film: {
          enabled,
          preset: enabled ? filmPreset : "",
          previousPresentation,
          previousVideoLayout,
        },
      },
    };
  };

export const createWebGalCompatibilityPlugin = (options: WebGalCompatibilityOptions = {}): VegaPlugin => {
  const enableRenderer = options.enableRenderer !== false;
  const enableTheme = options.enableTheme !== false;
  const enableCommands = options.enableCommands !== false;
  const enableUi = options.enableUi ?? enableCommands;
  if (!enableRenderer && !enableTheme && !enableCommands && !enableUi) {
    throw new TypeError("The WebGAL compatibility plugin must enable at least one contribution");
  }
  return defineVegaPlugin({
    manifest: {
      id: "haneoka.webgal-runtime",
      name: "Vega WebGAL Compatibility",
      version: "0.1.0",
      apiVersion: 1,
      description: "WebGAL-compatible Pixi stage, stock performs and familiar game theme",
      capabilities: [
        ...(enableRenderer ? (["render"] as const) : []),
        ...(enableTheme ? (["theme"] as const) : []),
        ...(enableCommands ? (["commands", "effect"] as const) : []),
        ...(enableUi ? (["ui-slot"] as const) : []),
      ],
    },
    setup(context) {
      if (enableUi)
        context.contribute("ui-slot", { id: "webgal.film", slot: "stage-overlay", mount: mountFilmPresentation });
      if (enableRenderer) {
        context.contribute("render", {
          id: "webgal-pixi",
          name: "WebGAL Pixi",
          backend: WEBGAL_COMPATIBILITY_BACKEND,
          create: (sceneContext) =>
            new WebGalStoryScene(sceneContext, {
              ...options,
              backend: WEBGAL_COMPATIBILITY_BACKEND,
              profile: "webgal",
            }),
        });
      }
      if (enableTheme) {
        context.contribute("theme", {
          id: WEBGAL_COMPATIBILITY_THEME,
          name: "WebGAL",
          default: true,
          cssText: WEBGAL_THEME_CSS,
          tokens: {
            surface: "#13151d",
            text: "#ffffff",
            accent: "#8fc8ff",
          },
        });
      }
      if (!enableCommands) return;
      context.provide(STORY_SCREEN_FILTER_PROVIDER, screenFilterProvider);
      context.contribute("effect", stockWeatherEffect);
      for (const { name, action } of WEBGAL_COMMAND_DEFINITIONS) {
        context.registerCommand({
          name,
          schemaVersion: 1,
          execute: extensionExecutor(action) as never,
          replaySafe: true,
          ...(action === "film-mode" && enableUi
            ? {
                enumerateCommandResources: (command: AdvCommand) =>
                  command.enabled !== false &&
                  (command.enabled === true ||
                    (firstString(command.content, command.value) !== "" &&
                      firstString(command.content, command.value) !== "none"))
                    ? [
                        {
                          source: FILM_FONT_URL,
                          kind: "font" as const,
                          font: { family: FILM_FONT_FAMILY, format: "woff2" },
                        },
                      ]
                    : [],
              }
            : {}),
        });
      }
    },
  });
};

export const webGalExtensionCommand = (
  name: keyof typeof WEBGAL_COMMAND_TYPES,
  fields: Readonly<Record<string, unknown>> = {},
): AdvCommand =>
  ({
    command: WEBGAL_COMMAND_TYPES[name],
    name: `webgal/${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`,
    ...fields,
  }) as AdvCommand;

export default createWebGalCompatibilityPlugin;
