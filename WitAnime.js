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

// ===================================
// ==== Sora stream ====
async function extractStreamUrl(url) {
  // ==== Utilities ====
  const hasFetchV2 = typeof fetchv2 === "function";
  async function httpGet(u, opts = {}) {
    try {
      if (hasFetchV2) return await fetchv2(u, opts.headers || {}, opts.method || "GET", opts.body || null);
      return await fetch(u, { method: opts.method || "GET", headers: opts.headers || {}, body: opts.body || null });
    } catch {
      return null;
    }
  }
  function safeTrim(s) { return s ? String(s).trim() : ""; }
  function normalizeUrl(raw, base = "") {
    if (!raw) return raw;
    raw = safeTrim(raw);
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    try { return base ? new URL(raw, base).href : "https://" + raw.replace(/^\/+/, ""); } catch { return raw; }
  }

  // ==== Dailymotion Extractor ====
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
        if (!videoId) return null;

        const metaRes = await httpGet(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();
        const hlsLink = metaJson.qualities?.auto?.[0]?.url;
        if (!hlsLink) return null;

        async function getBestHls(hlsUrl) {
            try {
                const res = await httpGet(hlsUrl);
                const text = await res.text();
                const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
                const streams = [];
                let match;
                while ((match = regex.exec(text)) !== null) {
                    streams.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
                }
                if (streams.length === 0) return hlsUrl;
                streams.sort((a, b) => b.height - a.height);
                return streams[0].url;
            } catch {
                return hlsUrl;
            }
        }

        const bestHls = await getBestHls(hlsLink);
        return { url: bestHls, type: "hls", quality: "auto", server: "Dailymotion" };
    } catch {
        return null;
    }
  }

  // ==== Videa Extractor ====
  async function extractVidea(embedUrl) {
    try {
      const res = await httpGet(embedUrl, { headers: { Referer: embedUrl, "User-Agent": "Mozilla/5.0" } });
      if (!res) return null;
      const html = await res.text();
      const vcodeMatch = html.match(/vcode\s*=\s*['"]([^'"]+)['"]/i);
      if (!vcodeMatch) return null;
      const vcode = vcodeMatch[1];
      const finalUrl = `https://videa.net/embed-${vcode}.html`; 
      return { url: finalUrl, type: "hls", quality: "auto", server: "Videa" };
    } catch { return null; }
  }

  // ==== Streamwish Extractor ====
  async function extractStreamwish(embedUrl) {
    try {
      const res = await httpGet(embedUrl, { headers: { Referer: embedUrl, "User-Agent": "Mozilla/5.0" } });
      if (!res) return null;
      const html = await res.text();
      const match = html.match(/sources\s*:\s*\[\s*["']([^"']+)["']/i) || html.match(/https?:\/\/[^"']+\.(?:mp4|m3u8)/i);
      if (!match) return null;
      const url = match[1] || match[0];
      return { url: normalizeUrl(url, embedUrl), type: url.includes(".m3u8") ? "hls" : "mp4", quality: "auto", server: "Streamwish" };
    } catch { return null; }
  }

  // ==== Main ====
  try {
    const pageRes = await httpGet(url, { headers: { Referer: url, "User-Agent": "Mozilla/5.0" } });
    if (!pageRes) return JSON.stringify({ streams: [] });
    const pageHtml = await pageRes.text();

    const providers = [];
    const seen = new Set();
    const anchorRe = /<a\b[^>]*\bdata-ep-url\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(pageHtml)) !== null) {
      const rawUrl = normalizeUrl(m[2] || m[3] || "", url);
      if (!rawUrl || seen.has(rawUrl)) continue;
      seen.add(rawUrl);
      providers.push({ rawUrl, title: (m[4] || rawUrl).trim() });
    }

    if (providers.length === 0) {
      const iframeMatches = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)];
      for (const im of iframeMatches) {
        const rawUrl = normalizeUrl(im[1], url);
        if (!rawUrl || seen.has(rawUrl)) continue;
        seen.add(rawUrl);
        providers.push({ rawUrl, title: rawUrl });
      }
    }

    const results = await Promise.all(providers.map(async prov => {
      const u = prov.rawUrl.toLowerCase();
      let direct = null;

      if (/dailymotion/.test(u)) direct = await extractDailymotion(prov.rawUrl);
      else if (/videa/.test(u)) direct = await extractVidea(prov.rawUrl);
      else if (/streamwish/.test(u)) direct = await extractStreamwish(prov.rawUrl);

      if (!direct) return null;

      return { title: prov.title + ` [${direct.quality}]`, streamUrl: direct.url, type: direct.type, headers: { Referer: prov.rawUrl, "User-Agent": "Mozilla/5.0" } };
    }));

    return JSON.stringify({ streams: results.filter(Boolean) });
  } catch (e) {
    console.log("extractWitAnimeStream error:", e);
    return JSON.stringify({ streams: [] });
  }
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
