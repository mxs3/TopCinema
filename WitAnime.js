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

async function searchResults(keyword) {
  try {
    const url = `https://witanime.world/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.world/'
      }
    });
    const html = await res.text();

    const results = [];

    // regex حديثة لالتقاط كل بطاقة أنمي
    const animeRegex = /<div class="anime-block">[\s\S]*?<a href="([^"]+)">[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g;

    let match;
    while ((match = animeRegex.exec(html)) !== null) {
      results.push({
        title: decodeHTMLEntities(match[3].trim()),
        href: match[1],
        image: match[2]
      });
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([{ title: 'Error', href: '', image: '', error: err.message }]);
  }
}
