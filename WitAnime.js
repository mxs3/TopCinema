function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}

async function searchResults(keyword) {
  try {
    const url = `https://witanime.xyz/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.world/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card-container');

    for (const block of blocks) {
      const hrefMatch = block.match(/<h3>\s*<a href="([^"]+)">/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
      const titleMatch = block.match(/<h3>\s*<a[^>]*>([^<]+)<\/a>/);

      if (hrefMatch && imgMatch && titleMatch) {
        results.push({
          title: decodeHTMLEntities(titleMatch[1].trim()),
          href: hrefMatch[1],
          image: imgMatch[1]
        });
      }
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([{ title: 'Error', href: '', image: '', error: err.message }]);
  }
}

// ===== استخراج البيانات =====
async function extractDetails(url) {
  try {
    const response = await fetchv2(url);
    const html = await response.text();
    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // استخراج الوصف
    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // استخراج التصنيفات (Genres)
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // استخراج سنة العرض
    const airdateMatch = html.match(/<div class="anime-info"><span>\s*بداية العرض:\s*<\/span>\s*(\d{4})/i);
    if (airdateMatch) {
      const extracted = airdateMatch[1].trim();
      if (/^\d{4}$/.test(extracted)) {
        airdate = extracted;
      }
    }

    return JSON.stringify([
      {
        description,
        aliases,
        airdate: `سنة العرض: ${airdate}`
      }
    ]);
  } catch {
    return JSON.stringify([
      {
        description: "تعذر تحميل الوصف.",
        aliases: "غير مصنف",
        airdate: "سنة العرض: غير معروفة"
      }
    ]);
  }
}

// ===== استخراج الحلقات =====
async function extractEpisodes(url) {
    const results = [];

    function decryptEpisodeData(encodedData) {
        const parts = encodedData.split(".");
        const encryptedData = atob(parts[0]);
        const xorKey = atob(parts[1]);

        let decryptedString = "";
        for (let i = 0; i < encryptedData.length; i++) {
            const decryptedChar = String.fromCharCode(
                encryptedData.charCodeAt(i) ^ xorKey.charCodeAt(i % xorKey.length)
            );
            decryptedString += decryptedChar;
        }
        return JSON.parse(decryptedString);
    }

    try {
        const response = await fetchv2(url);
        const html = await response.text();

        // 🛠 خلي الريجيكس يقبل أسطر متعددة
        const dataRegex = /processedEpisodeData\s*=\s*'([^']+)'/m;
        const dataMatch = html.match(dataRegex);

        if (!dataMatch) {
            console.log("⚠️ No processedEpisodeData found");
            return JSON.stringify([]);
        }

        const encodedData = dataMatch[1];
        const decoded = decryptEpisodeData(encodedData);

        decoded.forEach(ep => {
            const num = parseInt(ep.number, 10);
            results.push({
                href: ep.url,
                number: isNaN(num) ? 0 : num
            });
        });

        return JSON.stringify(results.sort((a, b) => a.number - b.number));
    } catch (err) {
        console.log("Episode extraction error:", err);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(pageUrl) {
    // ==== Helpers ====
    const headers = { "User-Agent": "Mozilla/5.0", "Referer": pageUrl };
    const hasFetchV2 = typeof fetchv2 === "function";

    async function httpGet(u) {
        try {
            return hasFetchV2 ? await fetchv2(u, headers) : await fetch(u, { headers });
        } catch { return null; }
    }
    async function getText(u) {
        const r = await httpGet(u);
        if (!r) return "";
        return typeof r.text === "function" ? await r.text() : r.toString();
    }
    function findStreams(html, referer) {
        const urls = [];
        const re = /(https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4)[^\s"'<>]*)/g;
        let m;
        while ((m = re.exec(html))) {
            urls.push({ url: m[1], type: m[1].includes(".m3u8") ? "hls" : "mp4", headers: { Referer: referer } });
        }
        return urls;
    }

    function fallbackUrl(u) {
        return { url: u, type: "url", quality: "unknown", server: "Fallback", headers: { Referer: u } };
    }

    // ==== Dailymotion extractor ====
    async function extractDailymotion(url) {
        try {
            let videoId = null;
            const patterns = [
                /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
                /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,
                /[?&]video=([a-zA-Z0-9]+)/
            ];
            for (const p of patterns) {
                const match = url.match(p);
                if (match) { videoId = match[1]; break; }
            }
            if (!videoId) return [];

            const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
            const metaJson = await metaRes.json();
            const hlsLink = metaJson.qualities?.auto?.[0]?.url;
            if (!hlsLink) return [];

            async function parseHlsVariants(hlsUrl) {
                const res = await fetch(hlsUrl);
                const text = await res.text();
                const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
                const streams = [];
                let match;
                while ((match = regex.exec(text)) !== null) {
                    streams.push({ quality: match[2] + "p", url: match[3] });
                }
                return streams.length > 0 ? streams : [{ quality: "auto", url: hlsUrl }];
            }

            const streams = await parseHlsVariants(hlsLink);
            const subtitles = metaJson.subtitles?.data?.['en-auto']?.urls?.[0] || "";

            return streams.map(s => ({ ...s, server: "Dailymotion", type: "hls", subtitles, headers: { Referer: url } }));
        } catch { return []; }
    }

    // ==== Videa extractor ====
    async function extractVidea(url) {
        try {
            const html = await getText(url);
            const streams = [];

            const vcodeMatch = html.match(/vcode\s*=\s*["']([A-Za-z0-9]+)["']/);
            if (vcodeMatch) {
                const vcode = vcodeMatch[1];
                const apiUrl = `https://videa.hu/videaplayer_get_xml.php?v=${vcode}`;
                const apiRes = await fetchv2(apiUrl);
                const apiText = await apiRes.text();

                const mp4Regex = /<videoLink\s+quality="(\d+)p".*?>(https?:\/\/[^<]+)<\/videoLink>/g;
                let match;
                while ((match = mp4Regex.exec(apiText)) !== null) {
                    streams.push({ quality: match[1] + "p", url: match[2], server: "Videa", type: "mp4", headers: { Referer: url }, subtitles: "" });
                }
            }

            const directRegex = /<video[^>]+src=["'](https?:\/\/[^"']+)["']/g;
            let match2;
            while ((match2 = directRegex.exec(html)) !== null) {
                streams.push({ quality: "auto", url: match2[1], server: "Videa", type: "mp4", headers: { Referer: url }, subtitles: "" });
            }

            const scriptRegex = /https?:\/\/[^\s"']+\.mp4/g;
            let match3;
            while ((match3 = scriptRegex.exec(html)) !== null) {
                streams.push({ quality: "backup", url: match3[0], server: "Videa", type: "mp4", headers: { Referer: url }, subtitles: "" });
            }

            return streams;
        } catch { return []; }
    }

    // ==== Main Logic ====
    const html = await getText(pageUrl);
    if (!html) return fallbackUrl(pageUrl);

    const servers = [];
    const iframeRe = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/g;
    let m;
    while ((m = iframeRe.exec(html))) {
        const src = m[1];
        if (/dailymotion/i.test(src)) {
            const dmStreams = await extractDailymotion(src);
            if (dmStreams.length) servers.push(...dmStreams);
        } else if (/videa/i.test(src)) {
            const vdStreams = await extractVidea(src);
            if (vdStreams.length) servers.push(...vdStreams);
        } else {
            const embedHtml = await getText(src);
            const otherStreams = findStreams(embedHtml, src).map(s => ({ ...s, server: "Other", type: s.type, headers: { Referer: src }, subtitles: "" }));
            if (otherStreams.length) servers.push(...otherStreams);
        }
    }

    if (!servers.length) return fallbackUrl(pageUrl);

    // ==== Automatic priority selection ====
    const priority = ["Videa", "Dailymotion", "Streamwish", "Okru"];
    for (const p of priority) {
        const found = servers.filter(s => s.server === p);
        if (found.length) return found; // ارجع كل الجودات
    }

    // ==== fallback manual prompt ====
    const choiceIndex = await soraPrompt("اختر السيرفر:", servers.map(s => s.server + " - " + (s.quality || "")));
    return servers[choiceIndex] || servers[0];
}

// !!!! ===== سورا فيتش =====!!!!
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
