// ==== Utilities ====
function decodeHtmlEntities(text) {
    return text
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8230;/g, '...')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));
}

const hasFetchV2 = typeof fetchv2 === "function";
async function httpGet(url, headers = {}) {
    if (hasFetchV2) return await fetchv2(url, headers, "GET", null);
    return await fetch(url, { headers });
}

// ==== Search ====
async function searchResults(keyword) {
    function cleanTitle(title) {
        return title
            .replace(/^انمي\s*/i, "")                          // يشيل "انمي" من الأول
            .replace(/\(.*?(مترجم|مدبلج).*?\)/gi, "")          // يشيل "(مترجم)" أو "(مدبلج)"
            .trim();
    }

    const results = [];
    try {
        const response = await httpGet("https://www.faselhds.xyz/?s=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /<div class="BlockItem">[\s\S]*?<a href="([^"]+)".*?<img[^>]+src="([^"]+)".*?<h3[^>]*>(.*?)<\/h3>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: cleanTitle(decodeHtmlEntities(match[3].trim())),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }
        return JSON.stringify(results);

    } catch (err) {
        return JSON.stringify([{ title: "Error", image: "Error", href: "Error" }]);
    }
}

// ==== Details ====
async function extractDetails(url) {
    try {
        const response = await httpGet(url);
        const html = await response.text();

        const match = /<div class="StoryMovieContent">\s*<p>([\s\S]*?)<\/p>/.exec(html);
        const description = match ? match[1].trim() : "N/A";

        return JSON.stringify([{
            description: decodeHtmlEntities(description),
            aliases: "N/A",
            airdate: "N/A"
        }]);

    } catch (err) {
        return JSON.stringify([{ description: "Error", aliases: "Error", airdate: "Error" }]);
    }
}

// ==== Episodes (with seasons) ====
async function extractEpisodes(url) {
    const baseUrl = "https://www.faselhds.xyz";
    const allEpisodes = [];

    function extractEpisodesFromHtml(html) {
        const episodes = [];
        const regex = /<li[^>]*class="epiBtn"[^>]*>\s*<a href="([^"]+)">.*?الحلقة\s*(\d+)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            episodes.push({
                href: match[1].trim(),
                number: parseInt(match[2], 10),
            });
        }
        return episodes;
    }

    try {
        const response = await httpGet(url);
        const html = await response.text();

        // detect seasons
        const seasonHrefRegex = /<div[^>]+class=["'][^"']*seasonDiv[^"']*["'][^>]*onclick=["']window\.location\.href\s*=\s*['"]([^'"]+)['"]/g;
        const seasonPaths = [];
        let match;
        while ((match = seasonHrefRegex.exec(html)) !== null) {
            seasonPaths.push(match[1]);
        }

        if (seasonPaths.length > 0) {
            for (const path of seasonPaths) {
                const seasonUrl = path.startsWith("http") ? path : baseUrl + path;
                const seasonResponse = await httpGet(seasonUrl);
                const seasonPageHtml = await seasonResponse.text();
                const episodes = extractEpisodesFromHtml(seasonPageHtml);
                allEpisodes.push(...episodes);
            }
            return JSON.stringify(allEpisodes);
        } else {
            const episodes = extractEpisodesFromHtml(html);
            if (episodes.length === 0) return JSON.stringify([{ href: url, number: 1 }]);
            return JSON.stringify(episodes);
        }

    } catch (err) {
        return JSON.stringify([{ href: "Error", number: "Error" }]);
    }
}

// ==== Stream URL ====
async function extractStreamUrl(url) {
    try {
        const response = await httpGet(url);
        const html = await response.text();

        // iframe or onclick
        let match = /<iframe[^>]+src=['"]([^'"]+)['"]/.exec(html);
        if (!match) match = /onclick="player_iframe\.location\.href\s*=\s*'([^']+)'"/.exec(html);
        if (!match || !match[1]) return "";

        const streamUrl = match[1].trim();
        const streamResponse = await httpGet(streamUrl);
        const streamContent = await streamResponse.text();

        const deobfuscated = deobfuscate(streamContent);
        if (deobfuscated) {
            const fileMatch = /"sources"\s*:\s*\[\s*{\s*"file"\s*:\s*"([^"]+)"/.exec(deobfuscated);
            if (fileMatch && fileMatch[1]) return fileMatch[1].trim();
        }
        return "";

    } catch {
        return "";
    }
}

// ==== Deobfuscator ====
function deobfuscate(streamContent) {
    try {
        const hideVarRegex = /var\s+(hide[*_]my_HTML_[a-zA-Z0-9_*]+)\s*=\s*([^;]+);/;
        const hideMatch = streamContent.match(hideVarRegex);
        if (!hideMatch) return null;

        let encodedString = hideMatch[2].trim();
        if (encodedString.includes('+')) {
            encodedString = [...encodedString.matchAll(/'([^']*)'/g)].map(m => m[1]).join('');
        } else {
            encodedString = encodedString.replace(/^['"]|['"]$/g, '');
        }

        const parts = encodedString.split('.').filter(p => p.trim().length > 0);

        let subtractionValue = 61;
        const dynamicMatch = streamContent.match(/\)\s*-\s*(\d+)\s*\)\s*;\s*\}\s*\)\s*;\s*document/);
        if (dynamicMatch) subtractionValue = parseInt(dynamicMatch[1]);

        let decodedString = '';
        for (const part of parts) {
            try {
                const padded = part.length % 4 === 2 ? part + '==' : part.length % 4 === 3 ? part + '=' : part;
                const decoded = atob(padded);
                const numbers = decoded.replace(/\D/g, '');
                if (numbers) {
                    const charCode = parseInt(numbers) - subtractionValue;
                    if (charCode > 0 && charCode < 1114111) {
                        decodedString += String.fromCharCode(charCode);
                    }
                }
            } catch { }
        }
        return decodedString;

    } catch {
        return null;
    }
}
