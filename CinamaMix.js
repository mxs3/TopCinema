async function searchResults(keyword) {
    try {
        const baseUrl = "https://w.cinamamix.com";

        // 🟢 شيل أي حروف عربية
        let cleanedKeyword = keyword.replace(/[\u0600-\u06FF]/g, "").trim();
        if (!cleanedKeyword) {
            return JSON.stringify([{ title: "No results", image: "", href: "" }]);
        }

        const searchUrl = `${baseUrl}/?s=${encodeURIComponent(cleanedKeyword)}`;

        // 🟢 جلب الصفحة
        const hasFetchV2 = typeof fetchv2 === "function";
        async function httpGet(u) {
            if (hasFetchV2) return await fetchv2(u, {}, "GET");
            return await fetch(u).then(r => r.text());
        }

        const html = await httpGet(searchUrl);

        // 🟢 Regex قوي يلقط كل البوسترات واللينكات والعناوين
        // بيدور على <a ... href="..." ...><img src="..." alt="..." />
        const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<img[^>]+(?:src|data-src)="([^"]+)"[^>]+alt="([^"]+)"/g;

        const results = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            const rawTitle = match[3].trim();

            // 🟢 تنظيف العنوان
            const cleanedTitle = rawTitle
                .replace(/الحلقة\s*\d+(\.\d+)?(-\d+)?/gi, "")
                .replace(/والاخيرة/gi, "")
                .replace(/\s+/g, " ")
                .trim();

            results.push({
                title: cleanedTitle || rawTitle,
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        if (results.length === 0) {
            return JSON.stringify([{ title: "No results found", image: "", href: "" }]);
        }

        return JSON.stringify(results);

    } catch (error) {
        console.log("Search error:", error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
