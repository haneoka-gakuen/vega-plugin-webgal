# Vega WebGAL Compatibility

Vega WebGAL Compatibility lets [Vega](https://github.com/haneoka-gakuen/vega)
play stories written for [WebGAL](https://github.com/OpenWebGAL/WebGAL) the way
WebGAL plays them. It brings a Pixi stage with WebGAL's layout and transform
rules, WebGAL's stock weather (rain, snow, heavy snow, falling petals), its
blur and colour-matrix filters, `setTransform` and `setTempAnimation`
timelines, the film-mode letterbox, and a game theme that looks familiar to
WebGAL players.

Pair it with [Altair WebGAL](https://github.com/haneoka-gakuen/altair-plugin-webgal):
Altair imports the WebGAL project, this plugin makes the commands that have no
native ADV counterpart run as WebGAL intended.

## Install

```sh
pnpm add @haneoka/vega @haneoka/vega-plugin-webgal pixi.js@6
```

Requires PixiJS 6.3 or newer within 6.x.

## Use it

```ts
import { VegaEngine } from "@haneoka/vega/engine";
import createWebGalCompatibilityPlugin from "@haneoka/vega-plugin-webgal";

const engine = new VegaEngine({ officialPlugins: [createWebGalCompatibilityPlugin()] });
```

Or through the preset: `createVegaFullPreset({ renderer: "webgal" })`.

The plugin (`haneoka.webgal-runtime`) has four independent parts. Turn off
what you do not need:

| Option | Part | Contributes |
| --- | --- | --- |
| `enableRenderer` | WebGAL stage | Render backend `webgal-pixi`: the Pixi renderer with WebGAL's stage profile. |
| `enableTheme` | WebGAL theme | Theme `webgal`, marked as default: dark surfaces, white text, light-blue accents. |
| `enableCommands` | WebGAL commands | The extension commands below, the weather effect and the screen-filter service. |
| `enableUi` | Film mode | The `webgal.film` letterbox overlay. Defaults to `enableCommands`. |

All default to `true`; at least one must stay on. The remaining options are
passed to the [Pixi renderer](https://github.com/haneoka-gakuen/vega-renderer-pixi).

To use WebGAL's commands and theme on the Three.js renderer:

```ts
createWebGalCompatibilityPlugin({ enableRenderer: false });
```

## Commands

The plugin registers these extension commands under the owner
`haneoka.webgal-runtime`. All are safe to replay when seeking.

| Command | Does |
| --- | --- |
| `pixiInit` | Clears running performs, like WebGAL's `pixiInit`. |
| `pixiPerform` | `rain`, `snow`, `heavy-snow`, `petals`, `clear`, `blur`, `color-matrix`, `clear-color-matrix` or a stage `transform`. |
| `stageTransform` | Moves, scales or rotates the whole stage. |
| `filmMode` | Shows or hides the film letterbox with its caption font. |
| `setTransform` | WebGAL transforms on a figure or background, including filters Vega has no native command for. |
| `setTempAnimation` | A WebGAL keyframe animation on a target. |

Build one in code with `webGalExtensionCommand`:

```ts
import { webGalExtensionCommand } from "@haneoka/vega-plugin-webgal";

const snow = webGalExtensionCommand("pixiPerform", { action: "snow" });
```

The command type ids are in `WEBGAL_COMMAND_TYPES`. A project that uses them
declares `WEBGAL_RUNTIME_REQUIREMENT` (plugin id, version and the
`render:webgl` and `ui:dom` permissions) so Vega can check the plugin is
present before playing.

## What is not included

Not WebGAL itself, its default assets, or its Live2D runtime. Characters use
whatever character plugins you install in Vega.

## License

MPL-2.0. See [LICENSE](LICENSE).
