async function searchResults(keyword) {
    const query = keyword.replace(/[\u0600-\u06FF]/g, "").trim(); 
    const url = `https://w.cinamamix.com/search/${encodeURIComponent(query)}/`;

    const response = await soraFetch(url);
    const html = await response.text();

    const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<div class="postThumb">\s*<img[^>]+src="([^"]+)"[^>]*>\s*<\/div>\s*<div class="postContent">[\s\S]*?<h2 class="postTitle">([^<]+)<\/h2>/g;

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
