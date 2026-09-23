import type { VegaUiSlotContext } from "@haneoka/vega/plugin";
import { VEGA_SHELL_CONTROLLER } from "@haneoka/vega/shell";

export const FILM_PRESENTATION_ID = "webgal.film";
export const FILM_FONT_URL = new URL("../assets/fonts/film.woff2", import.meta.url).href;
export const FILM_FONT_FAMILY = "VegaWebGalFilm";

export function mountFilmPresentation(host: HTMLElement, context: VegaUiSlotContext) {
  const document = host.ownerDocument,
    view = document.defaultView;
  const root = document.createElement("div"),
    content = document.createElement("div"),
    styles = document.createElement("style");
  root.className = "vega-webgal-film";
  root.hidden = true;
  root.tabIndex = 0;
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", "Advance dialogue");
  content.className = "vega-webgal-film__text";
  content.dir = "auto";
  const referenceHeight = Number(context.player.runtime.stage.screenReferenceHeight) || 1440;
  content.style.fontSize = `calc(${6400 / referenceHeight}cqh * var(--vega-text-size, 1))`;
  styles.textContent = `
    .vega-webgal-film{position:absolute;inset:auto 0 0;height:12%;color:white;background:black;overflow:hidden;box-sizing:border-box;display:flex;flex-flow:column;align-items:center;justify-content:center;pointer-events:auto;font-family:${FILM_FONT_FAMILY},serif;font-style:italic;letter-spacing:.2em;animation:vega-film-show .7s ease-out both}
    .vega-webgal-film[hidden],[data-vega-ui-hidden=true] .vega-webgal-film{display:none}
    .vega-webgal-film__text>span{animation:vega-film-show .7s ease-out both}
    .vega-webgal-film[data-instant] .vega-webgal-film__text>span{animation:none}
    .vega-webgal-film:focus-visible{outline:2px solid white;outline-offset:-3px}
    @keyframes vega-film-show{from{opacity:0}to{opacity:1}}
    @media(prefers-reduced-motion:reduce){.vega-webgal-film,.vega-webgal-film__text>span{animation:none}}
  `;
  root.append(content);
  host.append(styles, root);
  const events = new AbortController(),
    shell = context.services(VEGA_SHELL_CONTROLLER);
  const advance = (event: Event) => {
    event.stopPropagation();
    context.player.requestNext();
  };
  root.addEventListener("click", advance, { signal: events.signal });
  root.addEventListener(
    "keydown",
    (event) => {
      if (!event.repeat && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        advance(event);
      }
    },
    { signal: events.signal },
  );
  let shellSnapshot = shell?.snapshot();
  let frame = 0,
    lastSource: unknown,
    text = "",
    seekRevision = context.player.seekRevision,
    disposed = false;
  const render = () => {
    if (context.state.seeking) return !root.hidden;
    const talk = context.state.talk,
      screen = shellSnapshot;
    const active =
      talk.presentation === FILM_PRESENTATION_ID &&
      context.state.ready &&
      !context.state.loading &&
      (!screen || screen.screen === "game");
    const entering = root.hidden && active;
    root.hidden = !active;
    if (!active) return false;
    const restored = seekRevision !== context.player.seekRevision;
    seekRevision = context.player.seekRevision;
    const next = talk.visible ? talk.text.replace(/ {2,}/g, (spaces) => "\u00a0".repeat(spaces.length)) : "";
    const immediate = talk.instantReveal || context.state.instantText || restored || screen?.settings.reducedMotion;
    if (entering) root.style.animation = immediate ? "none" : "";
    else if (immediate) root.style.animation = "none";
    root.toggleAttribute("data-instant", Boolean(immediate));
    content.lang = talk.textLang ?? "";
    const locale =
      (screen?.settings.uiLanguage === "auto" ? view?.navigator.language : screen?.settings.uiLanguage) ?? "en";
    root.setAttribute(
      "aria-label",
      locale.startsWith("ja")
        ? "次の台詞へ"
        : locale.startsWith("ko")
          ? "다음 대사"
          : /zh-(TW|HK|Hant)/i.test(locale)
            ? "下一句對話"
            : locale.startsWith("zh")
              ? "下一句对话"
              : "Advance dialogue",
    );
    if (lastSource !== talk.sourceCommand || next !== text) {
      content.replaceChildren();
      text = "";
      lastSource = talk.sourceCommand;
      const rate = Math.max(0.1, screen?.settings.textSpeed ?? 1);
      const sourceSpeed = Math.max(0, Math.min(100, 100 - (78 / rate - 3) / 1.5));
      const characterDelay = 80 - 20 * sourceSpeed;
      let offset = 0;
      const fragment = document.createDocumentFragment();
      for (const character of Array.from(next)) {
        const span = document.createElement("span");
        span.textContent = character;
        const prefixLength = talk.prefixLength ?? 0;
        if (offset < prefixLength) span.style.animation = "none";
        else span.style.animationDelay = `${(offset - prefixLength) * characterDelay}ms`;
        offset += character.length;
        fragment.append(span);
      }
      content.append(fragment);
      text = next;
    }
    return true;
  };
  const update = () => {
    if (disposed || context.signal.aborted) return;
    if (render() && !frame)
      frame =
        view?.requestAnimationFrame(() => {
          frame = 0;
          update();
        }) ?? 0;
  };
  const release = context.player.subscribePresentationObserver?.(update);
  const releaseExecution = context.player.subscribeExecutionObserver(() => update());
  const releaseShell = shell?.subscribe((snapshot) => {
    shellSnapshot = snapshot;
    update();
  });
  update();
  return {
    dispose() {
      disposed = true;
      events.abort();
      view?.cancelAnimationFrame(frame);
      release?.();
      releaseExecution();
      if (typeof releaseShell === "function") void releaseShell();
      else if (releaseShell && "dispose" in releaseShell) void releaseShell.dispose();
      else if (releaseShell && "destroy" in releaseShell) void releaseShell.destroy();
      else if (releaseShell) void releaseShell.close();
      root.remove();
      styles.remove();
    },
  };
}
