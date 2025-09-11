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

// =========================================================================
// =========================================================================
// ==== Sora stream ========================================================
async function extractStreamUrl(url) {
  // ==== Helpers ====
  const hasFetchV2 = typeof fetchv2 === "function";

  async function httpGet(u, opts = {}) {
    try {
      if (hasFetchV2) return await fetchv2(u, opts.headers || {}, opts.method || "GET", opts.body || null);
      return await fetch(u, { method: opts.method || "GET", headers: opts.headers || {}, body: opts.body || null });
    } catch { return null; }
  }

  function normalizeUrl(raw, base = "") {
    if (!raw) return raw;
    raw = String(raw).trim();
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    try { return base ? new URL(raw, base).href : "https://" + raw.replace(/^\/+/, ""); } catch { return raw; }
  }

  async function extractDailymotion(embedUrl) {
    try {
      let videoId = null;
      const patterns = [
        /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
        /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,
        /[?&]video=([a-zA-Z0-9]+)/
      ];
      for (const p of patterns) {
        const match = embedUrl.match(p);
        if (match) { videoId = match[1]; break; }
      }
      if (!videoId) return null;

      const metaRes = await httpGet(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
      if (!metaRes) return null;
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
          while ((match = regex.exec(text)) !== null) streams.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
          if (!streams.length) return hlsUrl;
          streams.sort((a, b) => b.height - a.height);
          return streams[0].url;
        } catch { return hlsUrl; }
      }

      const bestHls = await getBestHls(hlsLink);
      return { title: "Dailymotion", streamUrl: bestHls, type: "hls", headers: { Referer: embedUrl } };
    } catch { return null; }
  }

  async function extractVidea(embedUrl) {
    try {
      const res = await httpGet(embedUrl, { headers: { Referer: embedUrl, "User-Agent": "Mozilla/5.0" } });
      if (!res) return null;
      const html = await res.text();

      // البحث عن vcode حتى لو JS مشفر
      const match = html.match(/vcode\s*=\s*["']([^"']+)["']/i);
      if (!match) return null;
      const vcode = match[1];
      const apiUrl = `https://player.videa.tv/api/source/${vcode}`;
      const apiRes = await httpGet(apiUrl, { headers: { Referer: embedUrl } });
      if (!apiRes) return null;
      const json = await apiRes.json();
      const best = json[0]?.file || null;
      if (!best) return null;
      return { title: "Videa", streamUrl: best, type: best.includes(".m3u8") ? "hls" : "mp4", headers: { Referer: embedUrl } };
    } catch { return null; }
  }

  async function extractStreamwish(embedUrl) {
    try {
      const res = await httpGet(embedUrl, { headers: { Referer: embedUrl, "User-Agent": "Mozilla/5.0" } });
      if (!res) return null;
      const html = await res.text();

      // Regex قوي لكل مصادر mp4/m3u8
      const match = html.match(/sources\s*:\s*\[\s*["']([^"']+)["']/i) || html.match(/https?:\/\/[^\s"']+\.(mp4|m3u8)/gi);
      if (!match) return null;
      const url = normalizeUrl(match[1] || match[0], embedUrl);
      return { title: "Streamwish", streamUrl: url, type: url.includes(".m3u8") ? "hls" : "mp4", headers: { Referer: embedUrl } };
    } catch { return null; }
  }

  // ==== Main ====
  try {
    const pageRes = await httpGet(url, { headers: { Referer: url, "User-Agent": "Mozilla/5.0" } });
    if (!pageRes) return JSON.stringify({ streams: [] });
    const pageHtml = await pageRes.text();

    // Regex قوي: جميع السيرفرات مع أي JS مشفر
    const providerRegex = /<a[^>]+data-server-id=["'](\d+)["'][^>]*onclick=["']loadIframe\(this\)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    const providers = [];
    const seen = new Set();

    // جمع السيرفرات من ال<a>
    for (const m of [...pageHtml.matchAll(providerRegex)]) {
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (seen.has(title)) continue;
      seen.add(title);
      const dataId = m[1];
      // محاولة استخراج الرابط من JS
      const rawUrlMatch = pageHtml.match(new RegExp(`loadIframe\$begin:math:text$this\\$end:math:text$.*?data-server-id=["']${dataId}["'].*?src=["']([^"']+)["']`, "i"));
      const rawUrl = normalizeUrl(rawUrlMatch ? rawUrlMatch[1] : "");
      if (!rawUrl) continue;
      providers.push({ rawUrl, title });
    }

    // جمع أي iframes إضافية
    for (const m of [...pageHtml.matchAll(iframeRegex)]) {
      const rawUrl = normalizeUrl(m[1]);
      if (!rawUrl || seen.has(rawUrl)) continue;
      seen.add(rawUrl);
      providers.push({ rawUrl, title: rawUrl });
    }

    // استخرج روابط الفيديو لكل provider
    const results = [];
    for (const prov of providers) {
      let direct = null;
      const u = prov.rawUrl.toLowerCase();
      if (/dailymotion/.test(u)) direct = await extractDailymotion(prov.rawUrl);
      else if (/videa/.test(u)) direct = await extractVidea(prov.rawUrl);
      else if (/streamwish/.test(u)) direct = await extractStreamwish(prov.rawUrl);

      if (direct) results.push({ title: prov.title + " [" + direct.title + "]", streamUrl: direct.streamUrl, type: direct.type, headers: direct.headers });
    }

    return JSON.stringify({ streams: results });
  } catch (e) {
    console.log("extractStreamUrl error:", e);
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
