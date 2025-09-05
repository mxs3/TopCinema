async function searchResults(keyword) {
    const uniqueResults = new Map();

    // 🟢 تنظيف الكلمة من العربي
    let cleanedKeyword = keyword.replace(/[\u0600-\u06FF]/g, "").trim();
    if (!cleanedKeyword) {
        return JSON.stringify([{ title: "No results", image: "", href: "" }]);
    }

    const baseUrl = "https://w.cinamamix.com";
    const url = `${baseUrl}/?s=${encodeURIComponent(cleanedKeyword)}`;
    const response = await soraFetch(url);
    const html = await response.text();

    // 🟢 Regex: يجيب (href + image + title)
    const regex = /<a[^>]+href="([^"]+)"[^>]*class="hover"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const rawTitle = match[3].trim();

        // 🟢 تنظيف العنوان من "الحلقة" والأرقام والكلمات الزائدة
        const cleanedTitle = rawTitle
            .replace(/الحلقة\s*\d+(\.\d+)?(-\d+)?/gi, "")
            .replace(/والاخيرة/gi, "")
            .replace(/\s+/g, " ")
            .trim();

        if (!uniqueResults.has(cleanedTitle)) {
            uniqueResults.set(cleanedTitle, {
                title: cleanedTitle,
                href: match[1].trim(),
                image: match[2].trim()
            });
        }
    }

    const deduplicated = Array.from(uniqueResults.values());
    return JSON.stringify(deduplicated.length > 0 ? deduplicated : [{ title: "No results found", image: "", href: "" }]);
}
