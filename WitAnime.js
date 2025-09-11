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
              Referer: url,
              Origin: new URL(url).origin,
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
      return [{ name: "Fallback", url: "", error: msg }];
    }

    function soraPrompt(message, streams) {
      return {
        message,
        streams,
      };
    }

    // ==== Embedded decoder ====
    function decodeStreamingServers(html) {
      try {
        const zGMatch = html.match(/var _zG="([^"]+)";/);
        const zHMatch = html.match(/var _zH="([^"]+)";/);
        if (!zGMatch || !zHMatch) {
          console.warn("zG or zH not found, checking for iframes...");
          const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/);
          if (iframeMatch) {
            return [{ name: "Iframe", url: iframeMatch[1] }];
          }
          return [];
        }

        const resourceRegistry = JSON.parse(atob(zGMatch[1]));
        const configRegistry = JSON.parse(atob(zHMatch[1]));

        const serverNames = {};
        const serverLinks = html.matchAll(
          /<a[^>]+class="server-link"[^>]+data-server-id="(\d+)"[^>]*>\s*<span class="ser">([^<]+)<\/span>/g
        );
        for (const match of serverLinks) {
          serverNames[match[1]] = match[2].trim();
        }

        const servers = [];
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

          servers.push({
            id: i,
            name: serverNames[i] || `Unknown Server ${i}`,
            url: rawUrl.trim(),
          });
        }

        return servers;
      } catch (e) {
        console.error("Error decoding servers:", e.message);
        return [];
      }
    }

    // ==== Handle Specific Servers ====
    async function handleServer(server) {
      if (/vidstream/.test(server.url)) {
        const html = await httpGet(server.url);
        const videoMatch = html.match(/<source src="([^"]+)"/);
        return videoMatch ? { name: "Vidstream", url: videoMatch[1] } : null;
      }
      // أضف دعم لسيرفرات أخرى هنا
      return server;
    }

    // ==== Main Extraction ====
    const html = await httpGet(url);
    let servers = decodeStreamingServers(html);

    if (!servers.length) {
      return fallbackUrl("⚠️ لم يتم استخراج أي سيرفر من الصفحة");
    }

    let multiStreams = [];
    for (const s of servers) {
      try {
        if (!(await checkUrlValidity(s.url))) {
          console.warn(`Invalid URL for server ${s.name}: ${s.url}`);
          continue;
        }

        const processedServer = await handleServer(s);
        if (!processedServer) continue;

        if (/ok\.ru/.test(processedServer.url)) {
          multiStreams.push({ name: "Ok.ru", url: processedServer.url });
        } else if (/drive\.google/.test(processedServer.url)) {
          multiStreams.push({ name: "Google Drive", url: processedServer.url });
        } else if (/mp4upload/.test(processedServer.url)) {
          multiStreams.push({ name: "Mp4Upload", url: processedServer.url });
        } else if (/mega\.nz/.test(processedServer.url)) {
          multiStreams.push({ name: "Mega.nz", url: processedServer.url });
        } else {
          multiStreams.push({ name: processedServer.name, url: processedServer.url });
        }
      } catch (err) {
        console.error(`Error processing server ${s.name}:`, err.message);
      }
    }

    if (!multiStreams.length) {
      return fallbackUrl("⚠️ كل السيرفرات فشلت في الاستخراج");
    }

    return soraPrompt("اختر السيرفر المناسب:", multiStreams);
  } catch (error) {
    console.error("extractStreamUrl error:", error.message, error.stack);
    return fallbackUrl("⚠️ حدث خطأ غير متوقع أثناء الاستخراج");
  }
}
