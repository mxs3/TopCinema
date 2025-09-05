async function searchResults(keyword) {
    const hasFetchV2 = typeof fetchv2 === "function";
    async function httpGet(u, opts = {}) {
        if (hasFetchV2) {
            return await fetchv2(u, opts.headers || {}, "GET", null);
        }
        return await fetch(u, { method: "GET", headers: opts.headers || {} });
    }

    const url = `https://w.cinamamix.com/search/${encodeURIComponent(keyword)}/`;
    const response = await httpGet(url);
    const html = await response.text();

    // 🔥 ريجيكس قوي بيجيب كل النتائج
    const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<div class="postThumb">\s*<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h2 class="postTitle">([^<]+)<\/h2>/g;

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
