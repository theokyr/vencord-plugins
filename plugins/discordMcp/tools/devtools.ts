/*
 * DevTools tool handlers — eval, DOM query, webpack, stores, plugins.
 * The killer feature for agent-driven plugin development.
 */

import { filters, findAll, search } from "@webpack";
import { registerTool } from "../shared";
import { TOOL_NAMES } from "../../../proxy/src/protocol";

registerTool(TOOL_NAMES.eval, async (params) => {
    const code = params.code as string;

    try {
        const fn = new Function(`return (async () => { ${code} })();`);
        const result = await fn();

        let serialized: string;
        try {
            serialized = JSON.stringify(result, null, 2);
        } catch {
            serialized = String(result);
        }

        return { result: serialized };
    } catch (err) {
        return { error: String(err), stack: (err as Error).stack };
    }
});

registerTool(TOOL_NAMES.querySelector, async (params) => {
    const selector = params.selector as string;
    const cssProps = params.properties as string[] | undefined;

    const elements = document.querySelectorAll(selector);
    const results = Array.from(elements).slice(0, 50).map(el => {
        const result: Record<string, unknown> = {
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: el.className || undefined,
            textContent: el.textContent?.slice(0, 100) || undefined,
            childCount: el.children.length,
            attributes: {} as Record<string, string>,
        };

        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith("data-") || attr.name === "role" || attr.name === "aria-label") {
                (result.attributes as Record<string, string>)[attr.name] = attr.value;
            }
        }

        if (cssProps && el instanceof HTMLElement) {
            const computed = getComputedStyle(el);
            const styles: Record<string, string> = {};
            for (const prop of cssProps) {
                styles[prop] = computed.getPropertyValue(prop);
            }
            result.styles = styles;
        }

        return result;
    });

    return { count: elements.length, results };
});

registerTool(TOOL_NAMES.getWebpackModule, async (params) => {
    const findStr = params.find as string;
    const method = params.method as string | undefined;

    try {
        const candidates = search(findStr);
        const keys = Object.keys(candidates);

        if (keys.length === 0) return { error: "No modules found matching: " + findStr };

        const mod = candidates[keys[0]];
        let source = String(mod);

        if (method) {
            const methodSource = mod[method];
            if (typeof methodSource === "function") {
                source = String(methodSource);
            } else {
                return { error: `Method "${method}" not found on module. Available: ${Object.keys(mod).join(", ")}` };
            }
        }

        return {
            moduleCount: keys.length,
            source: source.slice(0, 10000),
            truncated: source.length > 10000,
        };
    } catch (err) {
        return { error: String(err) };
    }
});

registerTool(TOOL_NAMES.getStore, async (params) => {
    const storeName = params.store as string;
    const method = params.method as string | undefined;
    const args = params.args as unknown[] | undefined;

    try {
        const results = findAll(filters.byStoreName(storeName));
        if (results.length === 0) return { error: "Store not found: " + storeName };

        const store = results[0];

        if (!method) {
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store))
                .filter(k => typeof store[k] === "function" && k !== "constructor");
            return { storeName, methods };
        }

        if (typeof store[method] !== "function") {
            return { error: `"${method}" is not a method on ${storeName}` };
        }

        const result = store[method](...(args ?? []));

        let serialized: string;
        try {
            serialized = JSON.stringify(result, null, 2);
        } catch {
            serialized = String(result);
        }

        if (serialized.length > 10000) {
            serialized = serialized.slice(0, 10000) + "\n... (truncated)";
        }

        return { result: JSON.parse(serialized) };
    } catch (err) {
        return { error: String(err) };
    }
});

registerTool(TOOL_NAMES.getVencordPlugins, async (params) => {
    const name = params.name as string | undefined;
    const plugins = (window as any).Vencord?.Plugins?.plugins;
    if (!plugins) return { error: "Vencord.Plugins not available" };

    if (name) {
        const plugin = plugins[name];
        if (!plugin) return { error: "Plugin not found: " + name };
        return {
            name: plugin.name,
            description: plugin.description,
            enabled: plugin.started ?? false,
            authors: plugin.authors?.map((a: any) => a.name) ?? [],
            settings: plugin.settings?.store ? { ...plugin.settings.store } : null,
            patches: plugin.patches?.length ?? 0,
        };
    }

    return Object.values(plugins).map((p: any) => ({
        name: p.name,
        enabled: p.started ?? false,
        description: p.description?.slice(0, 100),
    }));
});
