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
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.xyz'
      }
    });
    const html = await res.text();

    // الوصف
    let description = "لا يوجد وصف متاح.";
    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/i);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // الأنواع / aliases
    let aliases = "غير مصنف";
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const items = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      if (items.length) aliases = items.map(m => m[1].trim()).join(", ");
    }

    // سنة العرض / airdate
    let airdate = "غير معروف";
    const airdateMatch = html.match(/<span>\s*بداية العرض:\s*<\/span>\s*(\d{4})/i);
    if (airdateMatch) airdate = airdateMatch[1].trim();

    // نرجع JSON Stringified بالشكل المطلوب
    return JSON.stringify({
      description,
      aliases,
      airdate
    });

  } catch (err) {
    return JSON.stringify({
      description: "تعذر تحميل الوصف.",
      aliases: "غير مصنف",
      airdate: "غير معروف"
    });
  }
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };

    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}
