function decodeHTMLEntities(text) {
    if (!text) return "";
    text = text.replace(/&#x([0-9A-Fa-f]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));
    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };
    for (const e in entities) text = text.replace(new RegExp(e, 'g'), entities[e]);
    return text;
}

async function searchResults(keyword) {
    try {
        const base = "https://w.cinamamix.com";
        const cleaned = (keyword || "").replace(/[\u0600-\u06FF]/g, "").trim();
        if (!cleaned) return JSON.stringify([{ title: "No results", image: "", href: "" }]);
        const encoded = encodeURIComponent(cleaned);
        const urls = [`${base}/search/${encoded}/`, `${base}/?s=${encoded}`];

        async function httpGet(u) {
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9"
            };
            if (typeof fetchv2 === "function") {
                const res = await fetchv2(u, headers, "GET", null);
                if (res && typeof res.text === "function") return await res.text();
                if (typeof res === "string") return res;
                return String(res);
            } else {
                const res = await fetch(u, { method: "GET", headers, redirect: "follow" });
                return await res.text();
            }
        }

        let results = [];
        for (const url of urls) {
            const html = await httpGet(url);
            if (!html || html.length < 50) continue;
            const secMatch = html.match(/<section[^>]*class=["'][^"']*secContainer[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
            const content = secMatch ? secMatch[1] : html;
            const anchorRegex = /(<a\b[^>]*href=['"]([^'"]+)['"][^>]*>)([\s\S]*?)<\/a>/gi;
            let m;
            while ((m = anchorRegex.exec(content)) !== null) {
                const openTag = m[1];
                const href = m[2];
                const inner = m[3];
                const imgMatch = inner.match(/<img[^>]+(?:src|data-src)=['"]([^'"]+)['"][^>]*(?:alt=['"]([^'"]*)['"])?/i);
                if (!imgMatch) continue;
                const image = imgMatch[1].trim();
                let title = "";
                if (imgMatch[2] && imgMatch[2].trim()) title = imgMatch[2].trim();
                if (!title) {
                    const t1 = (openTag.match(/title=['"]([^'"]+)['"]/) || [])[1];
                    if (t1) title = t1.trim();
                }
                if (!title) {
                    const hMatch = inner.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
                    if (hMatch) title = hMatch[1].trim();
                }
                if (!title) {
                    const textOnly = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                    if (textOnly) title = textOnly.split(" ").slice(0, 20).join(" ");
                }
                title = decodeHTMLEntities(title).trim();
                results.push({ title: title || "", image, href });
            }
            if (results.length) break;
        }

        if (results.length === 0) return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
