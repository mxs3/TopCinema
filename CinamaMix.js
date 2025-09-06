async function searchResults(keyword) {
    function decodeHTMLEntities(text) {
        if (!text) return "";
        text = text.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
        return text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    try {
        const base = "https://w.cinamamix.com";
        const q = (keyword || "").replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, "").trim();
        if (!q) return JSON.stringify([{ title: "No results", image: "", href: "" }]);
        const url = `${base}/search/${encodeURIComponent(q)}/`;
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": base,
            "Cache-Control": "no-cache"
        };

        async function httpGet(u) {
            if (typeof fetchv2 === "function") {
                const res = await fetchv2(u, headers, "GET", null);
                if (!res) return "";
                if (typeof res === "string") return res;
                if (typeof res.text === "function") return await res.text();
                return String(res);
            } else {
                const r = await fetch(u, { method: "GET", headers, redirect: "follow" });
                return await r.text();
            }
        }

        const html = await httpGet(url);
        if (!html || html.length < 50) return JSON.stringify([{ title: "No results found", image: "", href: "" }]);

        const articleRegex = /<article[^>]*class=["'][^"']*post[^"']*["'][\s\S]*?<\/article>/gi;
        const results = [];
        const seen = new Set();
        let aMatch;
        while ((aMatch = articleRegex.exec(html)) !== null) {
            const block = aMatch[0];

            const hrefMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
            const hrefRaw = hrefMatch ? hrefMatch[1].trim() : "";
            const href = hrefRaw && /^https?:\/\//i.test(hrefRaw) ? hrefRaw : (hrefRaw ? new URL(hrefRaw, base).toString() : "");

            if (!href) continue;
            if (seen.has(href)) continue;

            let imgMatch = block.match(/<div[^>]*class=["'][^"']*(poster|postThumb)[^"']*["'][\s\S]*?<img[^>]+(?:data-img|data-src|data-lazy|src)=["']([^"']+)["'][^>]*>/i);
            if (!imgMatch) imgMatch = block.match(/<img[^>]+(?:data-img|data-src|data-lazy|src)=["']([^"']+)["'][^>]*>/i);
            const imageRaw = imgMatch ? imgMatch[2] || imgMatch[1] : "";
            const image = imageRaw && /^https?:\/\//i.test(imageRaw) ? imageRaw : (imageRaw ? new URL(imageRaw, base).toString() : "");

            let title = "";
            const h3 = block.match(/<h3[^>]*class=["']?title["']?[^>]*>\s*([^<]+?)\s*<\/h3>/i);
            if (h3) title = h3[1].trim();
            if (!title) {
                const h2 = block.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
                if (h2) title = h2[1].trim();
            }
            if (!title) {
                const aTitle = block.match(/<a[^>]+title=["']([^"']+)["']/i);
                if (aTitle) title = aTitle[1].trim();
            }
            if (!title) {
                const imgAlt = block.match(/<img[^>]+alt=["']([^"']+)["']/i);
                if (imgAlt) title = imgAlt[1].trim();
            }
            if (!title) {
                const textOnly = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                title = textOnly.split(' ').slice(0, 40).join(' ');
            }
            title = decodeHTMLEntities(title);

            seen.add(href);
            results.push({ title: title || "", image: image || "", href });
        }

        if (results.length === 0) return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
