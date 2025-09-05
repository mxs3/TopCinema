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

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml",
            "Referer": base,
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache"
        };

        let html;
        if (typeof fetchv2 === "function") {
            html = await fetchv2(searchUrl, headers, "GET", null);
        } else {
            const res = await fetch(searchUrl, { method: "GET", headers });
            html = await res.text();
        }

        if (typeof html !== "string") {
            html = await html.text();
        }

        // مسك بلوك البحث بس
        const searchBlockMatch = html.match(/<section[^>]*class="secContainer"[^>]*>([\s\S]*?)<\/section>/i);
        const searchHtml = searchBlockMatch ? searchBlockMatch[1] : html;

        const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<div[^>]*class="postThumb"[^>]*>\s*<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi;

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
