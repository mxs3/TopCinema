async function searchResults(keyword) {
    function decodeHTMLEntities(text) {
        if (!text) return "";
        text = text.replace(/&#x([0-9A-Fa-f]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));
        const entities = { '&quot;': '"', '&amp;': '&', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
        for (const e in entities) text = text.replace(new RegExp(e, 'g'), entities[e]);
        return text;
    }

    try {
        const base = "https://w.cinamamix.com";
        const encoded = encodeURIComponent(keyword.trim());
        const searchUrl = `${base}/search/${encoded}/`;

        async function httpGet(u) {
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "text/html,application/xhtml+xml",
                "Referer": base,
                "X-Requested-With": "XMLHttpRequest"
            };
            if (typeof fetchv2 === "function") {
                const res = await fetchv2(u, headers, "GET", null);
                if (res && typeof res.text === "function") return await res.text();
                if (typeof res === "string") return res;
                return String(res);
            } else {
                const res = await fetch(u, { method: "GET", headers });
                return await res.text();
            }
        }

        const html = await httpGet(searchUrl);

        // 🟢 فلترة على منطقة البحث فقط
        const searchBlockMatch = html.match(/<section[^>]*class="search"[^>]*>([\s\S]*?)<\/section>/i);
        const searchHtml = searchBlockMatch ? searchBlockMatch[1] : html;

        // 🔥 استخراج النتائج من البلوك
        const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<div[^>]*class="postThumb"[^>]*>\s*<img[^>]+(?:data-src|data-lazy|src)="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi;

        const results = [];
        let match;
        while ((match = regex.exec(searchHtml)) !== null) {
            results.push({
                title: decodeHTMLEntities(match[3].trim()),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        if (results.length === 0) {
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
