import axios from 'axios';
import * as cheerio from 'cheerio';
const USER_KEYWORDS = ['react', 'next.js', 'typescript', 'tailwind', 'node.js', 'cloudflare'];
const LOCAL_AI_ENDPOINT = process.env.LOCAL_AI_ENDPOINT;
const LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL;
async function extractDetailsWithAI(title, content) {
    if (!LOCAL_AI_ENDPOINT || !LOCAL_AI_MODEL) {
        return { title, company: 'Unknown', description: content.substring(0, 150) };
    }
    try {
        const response = await axios.post(`${LOCAL_AI_ENDPOINT}/chat/completions`, {
            model: LOCAL_AI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional recruitment researcher. From the job snippet provided, extract the exact Company Name. If the company name is not explicitly in the text, try to infer it from the context (e.g., if the title is "Engineer at Google", the company is "Google"). If it is truly impossible to find, use "Unknown". Return ONLY a JSON object with keys: "title", "company", "description".'
                },
                { role: 'user', content: `Title: ${title}\nContent: ${content}` }
            ],
            response_format: { type: 'json_object' }
        }, { headers: { 'Content-Type': 'application/json' } });
        return JSON.parse(response.data.choices[0].message.content);
    }
    catch (error) {
        console.error('AI Extraction Error:', error);
        return { title, company: 'Unknown', description: content.substring(0, 150) };
    }
}
export async function fetchAndRankJobs() {
    const query = 'junior full stack developer London React Node TypeScript';
    const jobs = [];
    try {
        console.log(`Searching for jobs via DuckDuckGo (Axios + Cheerio)...`);
        const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const results = [];
        $('.result').each((_, el) => {
            const titleEl = $(el).find('.result__a');
            if (titleEl.length) {
                results.push({
                    title: titleEl.text().trim(),
                    link: titleEl.attr('href') || '',
                    snippet: $(el).text().trim()
                });
            }
        });
        console.log(`Found ${results.length} potential results. Processing...`);
        for (const res of results.slice(0, 5)) {
            console.log(`Processing: ${res.title}`);
            let score = 0;
            const lowerTitle = res.title.toLowerCase();
            const lowerSnippet = res.snippet.toLowerCase();
            USER_KEYWORDS.forEach(kw => {
                const lowerKw = kw.toLowerCase();
                if (lowerTitle.includes(lowerKw))
                    score += 5;
                if (lowerSnippet.includes(lowerKw))
                    score += 2;
            });
            if (score > 0) {
                const extracted = await extractDetailsWithAI(res.title, res.snippet);
                jobs.push({
                    title: extracted.title || res.title,
                    company: extracted.company || 'Unknown',
                    description: extracted.description || res.snippet,
                    link: res.link,
                    score
                });
            }
        }
        return jobs.sort((a, b) => b.score - a.score).slice(0, 5);
    }
    catch (error) {
        console.error('Error in jobService:', error);
        return [];
    }
}
