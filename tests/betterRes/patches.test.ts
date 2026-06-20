import { describe, expect, it } from "vitest";

import { fpsOptionsMatcher, resolutionOptionsMatcher } from "../../plugins/betterRes/patches";

const STREAM_OPTIONS_SOURCE = String.raw`
}p(720),p(1080),p(1440),p(0,()=>l.intl.string(l.t.XjXqzh)),p(720),p(1080),p(1440);let E=e=>0===e?l.intl.string(l.t.XjXqzh):l.intl.formatToPlainString(l.t.TEOC0I,{resolution:e}),m=[p(480,()=>E(480)),p(720,()=>E(720)),p(1080,()=>E(1080)),p(1440,()=>E(1440)),p(0,()=>E(0))];p(15),p(30),p(60);let g=[p(15,()=>l.intl.formatToPlainString(l.t["bW+JCW"],{value:15})),p(30,()=>l.intl.formatToPlainString(l.t["bW+JCW"],{value:30})),p(60,()=>l.intl.formatToPlainString(l.t["bW+JCW"],{value:60}))]}
`;

function canonicalizeVencordMatcher(match: RegExp): RegExp {
    return new RegExp(
        match.source.replaceAll(/(\\*)\\i/g, (fullMatch, leadingEscapes) =>
            leadingEscapes.length % 2 === 0
                ? `${leadingEscapes}(?:[A-Za-z_$][\\w$]*)`
                : fullMatch.slice(1)
        ),
        match.flags,
    );
}

describe("BetterRes patch matchers", () => {
    it("matches Discord's resolution menu array when it is declared after the formatter in one let statement", () => {
        expect(canonicalizeVencordMatcher(resolutionOptionsMatcher).test(STREAM_OPTIONS_SOURCE)).toBe(true);
    });

    it("matches Discord's frame rate menu array", () => {
        expect(canonicalizeVencordMatcher(fpsOptionsMatcher).test(STREAM_OPTIONS_SOURCE)).toBe(true);
    });
});
