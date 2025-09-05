async function searchResults(keyword) {
    try {
        const baseUrl = "https://w.cinamamix.com";

        // 🟢 إزالة أي حروف عربية
        let cleanedKeyword = keyword.replace(/[\u0600-\u06FF]/g, "").trim();
        if (!cleanedKeyword) {
            return JSON.stringify([{ title: "No results", image: "", href: "" }]);
        }

        const searchUrl = `${baseUrl}/?s=${encodeURIComponent(cleanedKeyword)}`;

        // 🟢 جلب الصفحة
        const hasFetchV2 = typeof fetchv2 === "function";
        async function httpGet(u) {
            if (hasFetchV2) return await fetchv2(u, {}, "GET");
            return await fetch(u).then(r => r.text());
        }

        const html = await httpGet(searchUrl);

        const results = [];
        let match;

        // 🟢 Regex 1: الشكل التقليدي (a + img + alt)
        const regex1 = /<a[^>]+href="([^"]+)"[^>]*>\s*<img[^>]+(?:src|data-src)="([^"]+)"[^>]+alt="([^"]+)"/g;
        while ((match = regex1.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        // 🟢 Regex 2: احتمال يكون داخل div/poster
        const regex2 = /<div[^>]+class="[^"]*poster[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>.*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]+alt="([^"]+)"/gs;
        while ((match = regex2.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        // 🟢 Regex 3: fallback (img داخل a، من غير alt → ناخد title أو نص الرابط)
        const regex3 = /<a[^>]+href="([^"]+)"[^>]*>\s*<img[^>]+(?:src|data-src)="([^"]+)"[^>]*(?:alt="([^"]*)")?/g;
        while ((match = regex3.exec(html)) !== null) {
            results.push({
                title: (match[3] || "Unknown").trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        if (results.length === 0) {
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        return JSON.stringify(results);

    } catch (error) {
        console.log("Search error:", error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };

    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}
