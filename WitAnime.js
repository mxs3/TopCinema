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
        if (match) {
          videoId = match[1];
          break;
        }
      }
      if (!videoId) return [];

      const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
      const metaJson = await metaRes.json();
      const hlsLink = metaJson.qualities?.auto?.[0]?.url;
      if (!hlsLink) return [];

      async function getBestHls(hlsUrl) {
        try {
          const res = await fetch(hlsUrl);
          const text = await res.text();
          const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
          const streams = [];
          let match;
          while ((match = regex.exec(text)) !== null) {
            streams.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
          }
          if (!streams.length) return hlsUrl;
          streams.sort((a, b) => b.height - a.height);
          return streams[0].url;
        } catch {
          return hlsUrl;
        }
      }

      const bestHls = await getBestHls(hlsLink);
      const subtitles = metaJson.subtitles?.data?.["en-auto"]?.urls?.[0] || "";

      return [{
        url: bestHls,
        type: "hls",
        quality: "1080p",
        server: "Dailymotion",
        subtitles,
        headers: { Referer: url }
      }];
    } catch {
      return [];
    }
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
    } else {
      const embedHtml = await getText(src);
      const streams = findStreams(embedHtml, src).map(s => ({ ...s, server: "Other" }));
      if (streams.length) servers.push(...streams);
    }
  }

  if (!servers.length) return fallbackUrl(pageUrl);

  if (servers.length === 1) return servers[0];

  // أولوية تلقائية (Videa -> Dailymotion -> Streamwish -> ...)
  const priority = ["Videa", "Dailymotion", "Streamwish", "Okru"];
  for (const p of priority) {
    const found = servers.find(s => s.server === p);
    if (found) return found;
  }

  // fallback لاختيار يدوي
  const choice = await soraPrompt("اختر السيرفر:", servers.map(s => s.server + " - " + (s.quality || "")));
  return servers[choice] || servers[0];
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
