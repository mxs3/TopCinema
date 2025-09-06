async function searchResults(keyword, debug = false) {
    function decodeHTMLEntities(text) {
        if (!text) return "";
        text = text.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
        return text
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }

    try {
        const base = "https://w.cinamamix.com";
        const q = (keyword || "").replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, "").trim();
        if (!q) return JSON.stringify([{ title: "No results", image: "", href: "" }]);

        const urls = [
            `${base}/search/${encodeURIComponent(q)}/`,
            `${base}/?s=${encodeURIComponent(q)}`
        ];

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
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

        let html = "";
        for (const url of urls) {
            html = await httpGet(url);
            if (debug) console.log("[searchResults] fetched:", url, "length:", html ? html.length : 0);
            if (html && html.length > 100 && (/<article[^>]*class=["']?post/i.test(html) || /class=["']poster["']/i.test(html) || /class=["']postBlockOne["']/i.test(html))) {
                break;
            }
        }

        if (!html || html.length < 50) {
            if (debug) console.log("[searchResults] empty html");
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        const secMatch = html.match(/<section[^>]*class=["'][^"']*secContainer[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
        const content = secMatch ? secMatch[1] : html;

        const patterns = [
            /<article[^>]*class=["'][^"']*post[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][\s\S]*?<div[^>]*class=["'][^"']*(poster|postThumb)[^"']*["'][\s\S]*?<img[^>]+(?:data-img|data-src|src)=["']([^"']+)["'][\s\S]*?<h[23][^>]*class=["']?title["']?[^>]*>\s*([^<]+)\s*<\/h[23]>/gi,
            /<article[^>]*>[\s\S]*?<a[^>]+class=["'][^"']*movies[^"']*["'][^>]*href=["']([^"']+)["'][\s\S]*?<img[^>]+(?:data-img|data-src|src)=["']([^"']+)["'][\s\S]*?<h3[^>]*class=["']?title["']?[^>]*>\s*([^<]+)\s*<\/h3>/gi,
            /<a[^>]+class=["'][^"']*movies[^"']*["'][^>]*href=["']([^"']+)["'][\s\S]*?<img[^>]+(?:data-img|data-src|src)=["']([^"']+)["'][\s\S]*?(?:<h3[^>]*class=["']?title["']?[^>]*>\s*([^<]+)\s*<\/h3>|<h2[^>]*>\s*([^<]+)\s*<\/h2>)/gi,
            /<a[^>]+href=["']([^"']+)["'][\s\S]*?<img[^>]+(?:data-img|data-src|src)=["']([^"']+)["'][^>]*alt=["']([^"']+)["']/gi,
            /<img[^>]+(?:data-img|data-src|src)=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][\s\S]*?<\/a>/gi
        ];

        const seen = new Set();
        const results = [];

        for (const pat of patterns) {
            let m;
            pat.lastIndex = 0;
            while ((m = pat.exec(content)) !== null) {
                const href = (m[1] || "").trim();
                const image = (m[2] || "").trim();
                const title = decodeHTMLEntities((m[3] || m[4] || m[2] || "").trim());
                if (!href || !image) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                results.push({ title: title || "", image, href });
            }
            if (results.length) break;
        }

        if (results.length === 0) {
            if (debug) {
                console.log("[searchResults] no matches — content sample:");
                console.log(content.slice(0, 1500));
            }
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        return JSON.stringify(results);
    } catch (e) {
        if (typeof console !== "undefined") console.log("[searchResults] error:", e);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
