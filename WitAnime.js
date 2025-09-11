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

//==== Made by 50/50 ====
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
  try {
    // ==== Utilities ====
    async function httpGet(u, headers = {}) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(u, {
          headers: Object.assign(
            {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
              Referer: u,
              Origin: new URL(u).origin,
              "Accept-Language": "en-US,en;q=0.9",
            },
            headers
          ),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return await res.text();
      } catch (err) {
        clearTimeout(timeoutId);
        console.error(`HTTP Error for ${u}:`, err.message);
        throw err;
      }
    }

    async function checkUrlValidity(url) {
      try {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok;
      } catch {
        return false;
      }
    }

    function fallbackUrl(msg) {
      return { name: "Fallback", url: "", error: msg };
    }

    // ==== Handle Specific Servers ====
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
        if (!videoId) {
            console.log("Invalid Dailymotion URL");
            return JSON.stringify({ streams: [], subtitles: "" });
        }

        const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();
        const hlsLink = metaJson.qualities?.auto?.[0]?.url;
        if (!hlsLink) return JSON.stringify({ streams: [], subtitles: "" });

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
                if (streams.length === 0) return hlsUrl;
                streams.sort((a, b) => b.height - a.height);
                return streams[0].url;
            } catch {
                return hlsUrl;
            }
        }

        const bestHls = await getBestHls(hlsLink);
        const subtitles = metaJson.subtitles?.data?.['en-auto']?.urls?.[0] || "";

        const result = {
            streams: ["1080p", bestHls],
            subtitles: subtitles
        };

        console.log("Extracted Dailymotion result:" + JSON.stringify(result));
        return JSON.stringify(result);
    } catch {
        const empty = { streams: [], subtitles: "" };
        console.log("Extracted Dailymotion result:" + JSON.stringify(empty));
        return JSON.stringify(empty);
    }
}

    async function handleStreamwish(url) {
      try {
        const html = await httpGet(url);
        const videoMatch = html.match(/<source[^>]+src="([^"]+)"/);
        if (videoMatch && (await checkUrlValidity(videoMatch[1]))) {
          return { name: "Streamwish", url: videoMatch[1] };
        }
        return null;
      } catch (err) {
        console.error("Error extracting Streamwish:", err.message);
        return null;
      }
    }

    // ==== Embedded decoder ====
    async function decodeStreamingServers(html) {
      try {
        // فحص إذا كان فيه iframes تحتوي على السيرفرات
        const iframeMatches = html.matchAll(/<iframe[^>]+src="([^"]+)"/g);
        const servers = [];
        for (const match of iframeMatches) {
          const iframeUrl = match[1];
          if (/dailymotion\.com/.test(iframeUrl)) {
            const stream = await extractDailymotion(iframeUrl);
            if (stream) servers.push(stream);
          } else if (/streamwish\.to/.test(iframeUrl)) {
            const stream = await handleStreamwish(iframeUrl);
            if (stream) servers.push(stream);
          }
        }

        // فحص _zG و _zH لو موجودين
        const zGMatch = html.match(/var _zG="([^"]+)";/);
        const zHMatch = html.match(/var _zH="([^"]+)";/);
        if (zGMatch && zHMatch) {
          try {
            const resourceRegistry = JSON.parse(atob(zGMatch[1]));
            const configRegistry = JSON.parse(atob(zHMatch[1]));

            const serverNames = {};
            const serverLinks = html.matchAll(
              /<a[^>]+class="server-link"[^>]+data-server-id="(\d+)"[^>]*>\s*<span class="ser">([^<]+)<\/span>/g
            );
            for (const match of serverLinks) {
              serverNames[match[1]] = match[2].trim();
            }

            for (let i = 0; i < 20; i++) {
              const resourceData = resourceRegistry[i];
              const config = configRegistry[i];
              if (!resourceData || !config) continue;

              let decrypted = resourceData.split("").reverse().join("");
              decrypted = decrypted.replace(/[^A-Za-z0-9+/=]/g, "");
              let rawUrl = atob(decrypted);

              const indexKey = atob(config.k);
              const paramOffset = config.d[parseInt(indexKey, 10)];
              rawUrl = rawUrl.slice(0, -paramOffset);

              const serverUrl = rawUrl.trim();
              if (/dailymotion\.com/.test(serverUrl)) {
                const stream = await handleDailymotion(serverUrl);
                if (stream) servers.push(stream);
              } else if (/streamwish\.to/.test(serverUrl)) {
                const stream = await handleStreamwish(serverUrl);
                if (stream) servers.push(stream);
              }
            }
          } catch (e) {
            console.error("Error decoding _zG/_zH:", e.message);
          }
        }

        return servers;
      } catch (e) {
        console.error("Error decoding servers:", e.message);
        return [];
      }
    }

    // ==== Main Extraction ====
    const html = await httpGet(url);
    const servers = await decodeStreamingServers(html);

    if (!servers.length) {
      return fallbackUrl("⚠️ لم يتم استخراج أي سيرفر من Dailymotion أو Streamwish");
    }

    const validStreams = [];
    for (const server of servers) {
      if (await checkUrlValidity(server.url)) {
        validStreams.push(server);
      } else {
        console.warn(`Invalid URL for server ${server.name}: ${server.url}`);
      }
    }

    if (!validStreams.length) {
      return fallbackUrl("⚠️ كل السيرفرات فشلت في الاستخراج أو غير صالحة");
    }

    // رجّع أول رابط صالح بدل كائن
    return validStreams[0].url;
  } catch (error) {
    console.error("extractStreamUrl error:", error.message, error.stack);
    return fallbackUrl("⚠️ حدث خطأ غير متوقع أثناء الاستخراج");
  }
}
