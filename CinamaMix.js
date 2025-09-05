async function searchResults(keyword) {
    function decodeHTMLEntities(text) {
        if (!text) return "";
        return text
            .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }

    try {
        const base = "https://w.cinamamix.com";
        const encoded = encodeURIComponent(keyword.trim());
        const searchUrl = `${base}/search/${encoded}/`;

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": base
        };

        let html;
        if (typeof fetchv2 === "function") {
            html = await fetchv2(searchUrl, headers, "GET", null);
        } else {
            const res = await fetch(searchUrl, { method: "GET", headers });
            html = await res.text();
        }

        // ريجيكس غصب عنها يلم كل حاجة: الرابط + الصورة + العنوان
        const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<div[^>]*class="postThumb"[^>]*>\s*<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi;

        const results = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
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
