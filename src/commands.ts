import { vegaCommandType } from "@haneoka/vega-protocol";
export const WEBGAL_COMMAND_OWNER = "haneoka.webgal-runtime";
export const WEBGAL_COMMAND_DEFINITIONS = [
  { name: "pixiInit", action: "pixi-init" },
  { name: "pixiPerform", action: "pixi-perform" },
  { name: "stageTransform", action: "stage-transform" },
  { name: "filmMode", action: "film-mode" },
  { name: "setTransform", action: "set-transform" },
  { name: "setTempAnimation", action: "set-temp-animation" },
  { name: "setTempAnimationV2", commandName: "setTempAnimation", schemaVersion: 2, action: "set-temp-animation" },
  { name: "figureDiff", action: "figure-diff" },
  { name: "dialoguePortrait", action: "dialogue-portrait" },
  { name: "intro", action: "intro" },
] as const;
export const WEBGAL_COMMAND_TYPES = Object.freeze(
  Object.fromEntries(
    WEBGAL_COMMAND_DEFINITIONS.map((definition) => [
      definition.name,
      vegaCommandType(
        WEBGAL_COMMAND_OWNER,
        "commandName" in definition ? definition.commandName : definition.name,
        "schemaVersion" in definition ? definition.schemaVersion : 1,
      ),
    ]),
  ) as Record<(typeof WEBGAL_COMMAND_DEFINITIONS)[number]["name"], string>,
);

export const WEBGAL_RUNTIME_REQUIREMENT = Object.freeze({
  id: WEBGAL_COMMAND_OWNER,
  version: "0.1.0",
  permissions: ["render:webgl", "ui:dom"] as const,
});
