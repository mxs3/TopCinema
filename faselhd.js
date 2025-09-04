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
    // ==== Utilities ====
    const hasFetchV2 = typeof fetchv2 === "function";

    async function httpGet(u, opts = {}) {
        try {
            if (hasFetchV2) {
                return await fetchv2(
                    u, 
                    opts.headers || {}, 
                    opts.method || "GET", 
                    opts.body || null
                );
            }
            return await fetch(u, { 
                method: opts.method || "GET", 
                headers: opts.headers || {}, 
                body: opts.body || null 
            });
        } catch (err) {
            return { text: async () => "", ok: false };
        }
    }

    function soraMatch(pattern, input, group = 1) {
        const regex = new RegExp(pattern, "i");
        const match = regex.exec(input);
        return match ? match[group] : null;
    }

    function soraExtractMediaFromHtml(html) {
        const results = [];
        // <source src="">
        const sourceRegex = /<source[^>]+src="([^"]+)"/g;
        let match;
        while ((match = sourceRegex.exec(html)) !== null) {
            results.push(match[1]);
        }
        // <video src="">
        const videoRegex = /<video[^>]+src="([^"]+)"/g;
        while ((match = videoRegex.exec(html)) !== null) {
            results.push(match[1]);
        }
        return results;
    }

    // ==== Main Extraction Flow ====
    try {
        // 1. Fetch main page
        const response = await httpGet(url);
        const html = await response.text();

        // 2. Extract iframe with video_player
        const iframeRegex = /<iframe[^>]+src="([^"]+video_player\?player_token=[^"]+)"/i;
        const iframeUrl = soraMatch(iframeRegex, html, 1);

        if (!iframeUrl) {
            return JSON.stringify([{ server: "FaselHD", url: "fallbackUrl" }]);
        }

        // 3. Fetch iframe page
        const iframeRes = await httpGet(iframeUrl, { headers: { Referer: url } });
        const iframeHtml = await iframeRes.text();

        // 4. Directly extract video/src
        let mediaLinks = soraExtractMediaFromHtml(iframeHtml);

        // 5. Check for sources hidden inside <script>
        if (mediaLinks.length === 0) {
            const scriptRegex = /file\s*:\s*"(https?:\/\/[^"]+)"/g;
            let match;
            while ((match = scriptRegex.exec(iframeHtml)) !== null) {
                mediaLinks.push(match[1]);
            }
        }

        // 6. Check for m3u8 playlist links
        if (mediaLinks.length === 0) {
            const m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/g;
            let match;
            while ((match = m3u8Regex.exec(iframeHtml)) !== null) {
                mediaLinks.push(match[1]);
            }
        }

        // 7. Return results
        if (mediaLinks.length > 0) {
            return JSON.stringify(mediaLinks.map(link => ({
                server: "FaselHD",
                quality: link.includes("m3u8") ? "HLS" : "MP4",
                url: link
            })));
        }

        // 8. Fallback
        return JSON.stringify([{ server: "FaselHD", url: "fallbackUrl" }]);

    } catch (err) {
        return JSON.stringify([{ server: "FaselHD", url: "fallbackUrl" }]);
    }
}
