async function searchResults(keyword) {
    const url = `https://w.cinamamix.com/search/${encodeURIComponent(keyword)}/`;
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://w.cinamamix.com/"
    };

    let html;
    if (typeof fetchv2 === "function") {
        html = await fetchv2(url, headers, "GET", null);
    } else {
        const res = await fetch(url, { method: "GET", headers });
        html = await res.text();
    }

    // 🔥 Regex قوي يجيب اللينك + الصورة + العنوان
    const regex = /<article class="post">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<div class="poster">[\s\S]*?<img[^>]+(?:data-img|src)="([^"]+)"[^>]*>[\s\S]*?<h3 class="title">\s*([^<]+)\s*<\/h3>/gi;

    const results = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            title: match[3].trim(),
            image: match[2].trim(),
            href: match[1].trim()
        });
    }

    return results.length > 0
        ? JSON.stringify(results)
        : JSON.stringify([{ title: "No results found", image: "", href: "" }]);
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
