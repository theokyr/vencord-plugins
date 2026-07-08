export const MACOS_WINDOW_FULLSCREEN_CLASS = "vc-enrichedHeader-macosWindowFullscreen";

export interface MacosWindowFullscreenController {
    start(): void;
    stop(): void;
    refresh(): void;
}

const FULLSCREEN_SIZE_TOLERANCE_PX = 2;

function dimensionsMatch(a: number, b: number): boolean {
    return Math.abs(a - b) <= FULLSCREEN_SIZE_TOLERANCE_PX;
}

export function isMacosNativeWindowFullscreen(win: Window = window, doc: Document = document): boolean {
    if (!doc.documentElement.classList.contains("platform-osx")) return false;

    const screenWidth = win.screen?.width ?? 0;
    const screenHeight = win.screen?.height ?? 0;
    if (screenWidth <= 0 || screenHeight <= 0) return false;

    return dimensionsMatch(win.innerWidth, screenWidth)
        && dimensionsMatch(win.innerHeight, screenHeight);
}

export function createMacosWindowFullscreenController(
    win: Window = window,
    doc: Document = document,
): MacosWindowFullscreenController {
    let started = false;

    function refresh() {
        doc.body.classList.toggle(
            MACOS_WINDOW_FULLSCREEN_CLASS,
            isMacosNativeWindowFullscreen(win, doc),
        );
    }

    function start() {
        if (started) return;
        started = true;

        refresh();
        win.addEventListener("resize", refresh);
        win.visualViewport?.addEventListener("resize", refresh);
        doc.addEventListener("fullscreenchange", refresh);
    }

    function stop() {
        if (started) {
            win.removeEventListener("resize", refresh);
            win.visualViewport?.removeEventListener("resize", refresh);
            doc.removeEventListener("fullscreenchange", refresh);
            started = false;
        }

        doc.body.classList.remove(MACOS_WINDOW_FULLSCREEN_CLASS);
    }

    return { start, stop, refresh };
}
