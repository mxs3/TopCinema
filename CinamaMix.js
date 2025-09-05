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
        const cleaned = (keyword || "").replace(/[\u0600-\u06FF]/g, "").trim();
        if (!cleaned) return JSON.stringify([{ title: "No results", image: "", href: "" }]);
        const encoded = encodeURIComponent(cleaned);
        const searchUrl = `${base}/search/${encoded}/`;

        async function httpGet(u) {
            const headers = {
                "User-Agent": "Mozilla/5.0",
                "Accept": "text/html"
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
        if (!html || html.length < 50) {
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        // 🔥 استخرج فقط البلوكات الخاصة بالأفلام/الأنمي
        const blockRegex = /<div[^>]+class="[^"]*(MovieBlock|PostBlock)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        const results = [];
        let match;

        while ((match = blockRegex.exec(html)) !== null) {
            const block = match[2];

            // الرابط
            const hrefMatch = block.match(/<a[^>]+href="([^"]+)"/i);
            const href = hrefMatch ? hrefMatch[1] : "";

            // الصورة (بوستر)
            const imgMatch = block.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i);
            const image = imgMatch ? imgMatch[1] : "";

            // العنوان
            let title = "";
            const titleMatch = block.match(/<h2[^>]*>([^<]+)<\/h2>/i) || block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
            if (titleMatch) title = titleMatch[1];
            if (!title) {
                const altMatch = block.match(/<img[^>]+alt="([^"]+)"/i);
                if (altMatch) title = altMatch[1];
            }

            title = decodeHTMLEntities(title).trim();
            if (href && image && title) {
                results.push({ title, image, href });
            }
        }

        if (results.length === 0) {
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
