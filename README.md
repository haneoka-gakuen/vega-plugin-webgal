# `@haneoka/vega-plugin-webgal`

WebGAL runtime compatibility for Vega. It provides stock
rain/snow/heavy-snow/petal performs, blur,
color-matrix and stage-transform commands, plus a familiar WebGAL game theme.

Use it with Altair's WebGAL authoring plugin when importing WebGAL projects.

This package does not bundle WebGAL, its default assets, or its model runtime.
Its theme, commands and film UI can be enabled independently. Use
`createThreeRendererPlugin()` with `createWebGalCompatibilityPlugin()`; the
compatibility plugin does not create a second stage.

## Runtime

Use `vega-three-webgl2` and select the WebGAL theme independently. WebGAL source
commands, including `pixiInit` and `pixiPerform`, compile to screen effects and
transforms on this same stage.

Filters submit shader programs and uniforms directly through Vega's
screen-filter provider. Their equations and upstream MIT notices ship in
`NOTICE.filters.md`.
