import {
  defineVegaPlugin,
  type AdvCommand,
  type StorySceneBackend,
  type VegaPlugin,
} from "@haneoka/vega";
import {
  PixiStoryScene,
  type PixiAmbientEffect,
  type PixiAmbientEffectOptions,
  type PixiRendererOptions,
} from "@haneoka/vega-renderer-pixi";

export const WEBGAL_COMPATIBILITY_BACKEND = "webgal-pixi";
export const WEBGAL_COMPATIBILITY_THEME = "webgal";

export const WEBGAL_OFFICIAL_OPCODES = Object.freeze({
  pixiInit: 501,
  pixiPerform: 502,
  stageTransform: 503,
  filmMode: 504,
} as const);

export interface WebGalCompatibilityOptions
  extends Omit<PixiRendererOptions, "profile" | "backend"> {
  readonly commandBase?: number;
  readonly enableCommands?: boolean;
  readonly enableRenderer?: boolean;
  readonly enableTheme?: boolean;
}

export interface WebGalPixiPerform {
  readonly action:
    | "rain"
    | "snow"
    | "heavy-snow"
    | "petals"
    | "clear"
    | "blur"
    | "color-matrix"
    | "clear-color-matrix"
    | "transform";
  readonly target?: string;
  readonly value?: number;
  readonly values?: readonly number[];
  readonly options?: PixiAmbientEffectOptions;
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

[data-vega-theme="webgal"] [data-vega-slot="dialogue"] {
  right: 7%;
  bottom: 5.5%;
  left: 7%;
  min-height: 21%;
  padding: clamp(18px, 2.4cqw, 34px) clamp(22px, 3.2cqw, 48px);
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgb(13 17 29 / 88%), rgb(20 25 39 / 72%)),
    rgb(13 17 29 / 82%);
  box-shadow: 0 16px 52px rgb(0 0 0 / 22%);
  backdrop-filter: blur(10px);
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
  values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) ?? "";

const pixiScene = (backend: StorySceneBackend): PixiStoryScene => {
  if (
    backend instanceof PixiStoryScene ||
    (typeof (backend as PixiStoryScene).setAmbientEffect === "function" &&
      typeof (backend as PixiStoryScene).setWorldTransform === "function")
  ) {
    return backend as PixiStoryScene;
  }
  throw new Error(
    "WebGAL Pixi command requires the webgal-pixi render backend",
  );
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
    ...((direct.value ?? command.value) !== undefined
      ? { value: finite(direct.value ?? command.value) }
      : {}),
    ...(Array.isArray(direct.values)
      ? { values: direct.values.map(Number) }
      : {}),
    ...(Object.keys(object(direct.options)).length > 0
      ? { options: object(direct.options) as PixiAmbientEffectOptions }
      : {}),
    ...((direct.x ?? command.x) !== undefined
      ? { x: finite(direct.x ?? command.x) }
      : {}),
    ...((direct.y ?? command.y) !== undefined
      ? { y: finite(direct.y ?? command.y) }
      : {}),
    ...((direct.scale ?? command.scale) !== undefined
      ? { scale: finite(direct.scale ?? command.scale, 1) }
      : {}),
    ...((direct.rotation ?? command.rotation) !== undefined
      ? { rotation: finite(direct.rotation ?? command.rotation) }
      : {}),
  };
};

export const executeWebGalPixiPerform = async (
  payload: WebGalPixiPerform,
  backend: StorySceneBackend,
): Promise<void> => {
  const scene = pixiScene(backend);
  switch (payload.action) {
    case "rain":
    case "snow":
    case "petals":
      scene.setAmbientEffect(
        payload.action as PixiAmbientEffect,
        payload.options,
      );
      return;
    case "heavy-snow":
      scene.setAmbientEffect("snow", {
        count: 512,
        speed: 12,
        alpha: 0.9,
        ...payload.options,
      });
      return;
    case "clear":
      scene.clearAmbientEffect(
        payload.target === "rain" ||
          payload.target === "snow" ||
          payload.target === "petals"
          ? payload.target
          : undefined,
      );
      return;
    case "blur":
      if (payload.target) {
        await scene.setCharacterDoF(
          payload.target,
          Math.max(0, finite(payload.value)),
        );
      } else {
        await scene.setBackgroundDoF(Math.max(0, finite(payload.value)));
      }
      return;
    case "color-matrix":
      scene.applyColorMatrix(payload.values ?? []);
      return;
    case "clear-color-matrix":
      scene.clearColorMatrix();
      return;
    case "transform":
      scene.setWorldTransform({
        ...(payload.x === undefined ? {} : { x: payload.x }),
        ...(payload.y === undefined ? {} : { y: payload.y }),
        ...(payload.scale === undefined ? {} : { scale: payload.scale }),
        ...(payload.rotation === undefined
          ? {}
          : { rotationDegrees: payload.rotation }),
      });
      return;
    default:
      throw new RangeError(`Unsupported WebGAL Pixi action: ${payload.action}`);
  }
};

const extensionExecutor = (
  action:
    | "pixi-init"
    | "pixi-perform"
    | "stage-transform"
    | "film-mode",
) =>
  async (
    command: AdvCommand,
    context: {
      readonly SceneRoot: StorySceneBackend;
      readonly state: Record<string, unknown>;
    },
  ): Promise<void> => {
    if (action === "pixi-init") {
      pixiScene(context.SceneRoot).clearAmbientEffect();
      return;
    }
    if (action === "pixi-perform") {
      await executeWebGalPixiPerform(performPayload(command), context.SceneRoot);
      return;
    }
    if (action === "stage-transform") {
      pixiScene(context.SceneRoot).setWorldTransform({
        x: finite(command.x),
        y: finite(command.y),
        scale: finite(command.scale, 1),
        rotationDegrees: finite(command.rotation),
      });
      return;
    }
    const stage = object(context.state.stage);
    const filmPreset = firstString(command.content, command.value);
    const normalizedPreset = filmPreset.toLowerCase();
    const enabled =
      command.enabled !== false &&
      normalizedPreset !== "" &&
      normalizedPreset !== "none" &&
      normalizedPreset !== "off";
    context.state.stage = {
      ...stage,
      webgalFilmMode: enabled,
      webgalFilmPreset: enabled ? filmPreset : "",
      webgalFilmRatio:
        command.ratio === undefined
          ? finite(Number(filmPreset), 2.35)
          : finite(command.ratio, 2.35),
    };
  };

export const createWebGalCompatibilityPlugin = (
  options: WebGalCompatibilityOptions = {},
): VegaPlugin => {
  const commandBase = Math.trunc(
    finite(options.commandBase, WEBGAL_OFFICIAL_OPCODES.pixiInit),
  );
  if (
    !Number.isSafeInteger(commandBase) ||
    commandBase < 501 ||
    commandBase > 2_147_483_644
  ) {
    throw new RangeError(
      "WebGAL official command base must be a safe integer from 501 to 2147483644",
    );
  }
  const enableRenderer = options.enableRenderer !== false;
  const enableTheme = options.enableTheme !== false;
  const enableCommands = options.enableCommands !== false;
  if (!enableRenderer && !enableTheme && !enableCommands) {
    throw new TypeError(
      "The WebGAL compatibility plugin must enable at least one contribution",
    );
  }
  return defineVegaPlugin({
    manifest: {
      id: "haneoka.webgal-runtime",
      name: "Vega WebGAL Compatibility",
      version: "0.1.0",
      apiVersion: 1,
      description:
        "WebGAL-compatible Pixi stage, stock performs and familiar game theme",
      capabilities: [
        ...(enableRenderer ? (["render"] as const) : []),
        ...(enableTheme ? (["theme"] as const) : []),
        ...(enableCommands ? (["commands"] as const) : []),
      ],
    },
    setup(context) {
      if (enableRenderer) {
        context.contribute("render", {
          id: "webgal-pixi",
          name: "WebGAL Pixi",
          backend: WEBGAL_COMPATIBILITY_BACKEND,
          create: (sceneContext) =>
            new PixiStoryScene(sceneContext, {
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
      for (const [offset, [name, action]] of (
        [
          ["webgal/pixi-init", "pixi-init"],
          ["webgal/pixi-perform", "pixi-perform"],
          ["webgal/stage-transform", "stage-transform"],
          ["webgal/film-mode", "film-mode"],
        ] as const
      ).entries()) {
        context.registerCommand({
          opcode: commandBase + offset,
          name,
          execute: extensionExecutor(action) as never,
          replaySafe: true,
        });
      }
    },
  });
};

export const webGalExtensionCommand = (
  name: keyof typeof WEBGAL_OFFICIAL_OPCODES,
  fields: Readonly<Record<string, unknown>> = {},
): AdvCommand => ({
  command: WEBGAL_OFFICIAL_OPCODES[name],
  name: `webgal/${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`,
  ...fields,
}) as AdvCommand;

export default createWebGalCompatibilityPlugin;
