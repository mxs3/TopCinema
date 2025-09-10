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

async function extractDetails(url) {
  try {
    const response = await fetchv2(url);
    const html = await response.text();

    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // الوصف
    const descMatch = html.match(/<div[^>]*class=["']anime-story["'][^>]*>\s*<p>(.*?)<\/p>/s);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // التصنيفات
    const genresMatch = html.match(/<div[^>]*class=["']anime-genres["'][^>]*>([\s\S]*?)<\/div>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // سنة العرض
    const yearMatch = html.match(/<span[^>]*class=["']anime-date["'][^>]*>(\d{4})<\/span>/);
    if (yearMatch) {
      const extracted = yearMatch[1].trim();
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
  try {
    const response = await fetchv2(url);
    const html = await response.text();

    let episodes = [];

    // نمط 1: ul class="episodes-links"
    const listMatch = html.match(/<ul[^>]*class=["']episodes-links["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (listMatch) {
      const items = [...listMatch[1].matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/g)];
      episodes = items.map(m => ({
        name: decodeHTMLEntities(m[2].trim()),
        url: m[1].trim()
      }));
    }

    // نمط 2: div class="episodes-card"
    if (episodes.length === 0) {
      const items = [...html.matchAll(/<div[^>]*class=["']episodes-card["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/g)];
      episodes = items.map(m => ({
        name: decodeHTMLEntities(m[2].trim()),
        url: m[1].trim()
      }));
    }

    return JSON.stringify(episodes);
  } catch {
    return JSON.stringify([]);
  }
}
