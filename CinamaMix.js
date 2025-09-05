async function searchResults(keyword) {
    try {
        const baseUrl = "https://w.cinamamix.com";

        // 🟢 نشيل أي حروف عربية ونسيب بس الإنجليزي
        let cleanedKeyword = keyword.replace(/[\u0600-\u06FF]/g, "").trim();
        if (!cleanedKeyword) {
            return JSON.stringify([{ title: "No results", image: "", href: "" }]);
        }

        const searchUrl = `${baseUrl}/search/${encodeURIComponent(cleanedKeyword)}/`;

        const hasFetchV2 = typeof fetchv2 === "function";
        async function httpGet(u) {
            if (hasFetchV2) {
                return await fetchv2(u, {}, "GET", null, true);
            }
            return await fetch(u, { redirect: "follow" }).then(r => r.text());
        }

        const html = await httpGet(searchUrl);

        // 🟢 Regex يمسك النتائج: لينك + صورة + عنوان
        const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/g;

        const results = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
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
