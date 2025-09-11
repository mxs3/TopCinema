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
      const res = await fetchv2(u, {
        headers: Object.assign(
          {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
            Referer: url,
          },
          headers
        ),
      });
      return await res.text();
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
        if (!zGMatch || !zHMatch) return [];

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
        return [];
      }
    }

    // ==== Main Extraction ====
    const html = await httpGet(url);
    const servers = decodeStreamingServers(html);

    if (!servers.length) {
      return fallbackUrl("⚠️ لم يتم استخراج أي سيرفر من الصفحة");
    }

    let multiStreams = [];

    for (const s of servers) {
      try {
        if (/ok\.ru/.test(s.url)) {
          multiStreams.push({ name: "Ok.ru", url: s.url });
        } else if (/drive\.google/.test(s.url)) {
          multiStreams.push({ name: "Google Drive", url: s.url });
        } else if (/mp4upload/.test(s.url)) {
          multiStreams.push({ name: "Mp4Upload", url: s.url });
        } else if (/mega\.nz/.test(s.url)) {
          multiStreams.push({ name: "Mega.nz", url: s.url });
        } else {
          multiStreams.push({ name: s.name, url: s.url });
        }
      } catch (err) {
        console.log("❌ Error extracting from server:", s.name, err);
      }
    }

    if (!multiStreams.length) {
      return fallbackUrl("⚠️ كل السيرفرات فشلت في الاستخراج");
    }

    return soraPrompt("اختر السيرفر المناسب:", multiStreams);
  } catch (error) {
    console.log("extractStreamUrl error:", error);
    return fallbackUrl("⚠️ حدث خطأ غير متوقع أثناء الاستخراج");
  }
}
