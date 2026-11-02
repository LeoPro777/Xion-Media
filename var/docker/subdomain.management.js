"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookieUrlFromDomain = getCookieUrlFromDomain;
const tldts_1 = require("tldts");

// Initialize AI Switcher (defaults to Gemini)
try {
    require("./ai.switcher");
} catch (e) {
    // optional fallback if mounted elsewhere
}

function getCookieUrlFromDomain(domain) {
    const url = (0, tldts_1.parse)(domain);
    if (!url.hostname) return undefined;
    if (url.hostname.endsWith(".ts.net") || url.hostname === "localhost" || url.isIp) {
        return undefined;
    }
    return url.domain ? "." + url.domain : url.hostname;
}
//# sourceMappingURL=subdomain.management.js.map
