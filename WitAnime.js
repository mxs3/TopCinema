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
                'Referer': 'https://witanime.xyz/'
            }
        });
        const html = await res.text();

        // الوصف
        const descriptionMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : 'No description available';

        // مدة الحلقة وعدد الحلقات كمعلومات إضافية في aliases
        const durationMatch = html.match(/<div class="anime-info"><span>مدة الحلقة:<\/span>\s*([^<]+)<\/div>/);
        const episodesMatch = html.match(/<div class="anime-info"><span>عدد الحلقات:<\/span>\s*([^<]+)<\/div>/);
        const aliases = `Duration: ${durationMatch ? durationMatch[1].trim() : 'Unknown'} | Episodes: ${episodesMatch ? episodesMatch[1].trim() : 'Unknown'}`;

        // تاريخ العرض
        const airdateMatch = html.match(/<div class="anime-info"><span>بداية العرض:<\/span>\s*([^<]+)<\/div>/);
        const airdate = `Aired: ${airdateMatch ? airdateMatch[1].trim() : 'Unknown'}`;

        return JSON.stringify({
            description,
            aliases,
            airdate
        });
    } catch (err) {
        console.log('Details error:', err);
        return JSON.stringify({
            description: 'Error loading description',
            aliases: 'Duration: Unknown | Episodes: Unknown',
            airdate: 'Aired: Unknown'
        });
    }
}
