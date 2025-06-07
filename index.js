// ===================================================================
//                  FINAL & WORKING index.js
//       This version uses Jimp (no Puppeteer) and Google Sheets CSV
// ===================================================================

// --- DEPENDENCIES ---
const { createClient } = require('pexels');
const { IgApiClient } = require('instagram-private-api');
const fs = require('fs').promises;
const path = require('path');
const Jimp = require('jimp');
const https = require('https');
const { parse } = require('csv-parse/sync');

// --- CONFIGURATION ---
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;
const SHEET_CSV_URL = process.env.SHEET_CSV_URL;
const YOUR_HANDLE = process.env.YOUR_HANDLE || '@thesigmacodex1';

// --- IMAGE GENERATION ENGINE (using Jimp) ---
async function generateImage(backgroundImageUrl, text, author, fontPath) {
  console.log(`Generating image with Jimp using font: ${fontPath}`);
  const [image, font] = await Promise.all([Jimp.read(backgroundImageUrl), Jimp.loadFont(fontPath)]);
  image.cover(1080, 1080).brightness(-0.7);
  image.print(font, 50, 50, { text: text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 980, 980);
  if (author) { image.print(font, 0, -50, { text: `- ${author}`, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM }, 1080, 1080); }
  console.log('Image generated successfully.');
  return image.getBufferAsync(Jimp.MIME_JPEG);
}

// --- INSTAGRAM POSTING ENGINE ---
async function postToInstagram({ imageBuffer, caption }) {
  console.log(`Attempting to post to Instagram...`);
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  await ig.account.login(IG_USERNAME, IG_PASSWORD);
  console.log('Logged in successfully.');
  await ig.publish.photo({ file: imageBuffer, caption: caption });
  console.log('Single photo posted successfully!');
}

// --- CONTENT FETCHING ENGINE (from Google Sheets CSV) ---
async function getNextPostFromSheet() {
  if (!SHEET_CSV_URL) throw new Error("SHEET_CSV_URL not found in environment variables!");
  const csvData = await new Promise((resolve, reject) => {
    https.get(SHEET_CSV_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
  const records = parse(csvData, { columns: true, skip_empty_lines: true });
  for (const record of records) {
    if (record.Status !== 'Posted') {
      console.log(`Found new post: "${record.QuoteText}"`);
      return record;
    }
  }
  return null;
}

// --- CAPTION GENERATION HELPER ---
function generateCaption(postData, handle, niche) {
    const hashtags = {
        quotes: '#motivation #quoteoftheday #mindset #inspiration',
        health: '#healthtips #wellness #healthyhabits #selfcare',
        sigma: '#sigmarules #stoic #mindset #alpha',
        default: '#motivation #dailyinspiration'
    };
    const nicheHashtags = hashtags[niche.toLowerCase().trim()] || hashtags.default;
    return `${postData.QuoteText}\n- ${postData.Author}\n.\n.\n.\nFollow ${handle} for more!\n.\n.\n${nicheHashtags}`;
}

// --- MAIN ORCHESTRATOR ---
(async () => {
    try {
        console.log("--- SigmaBot v3.0 (Jimp/CSV) Starting ---");
        const postData = await getNextPostFromSheet();
        if (!postData) {
            console.log("No new posts to publish. Exiting.");
            return;
        }
        const { QuoteText, Author, Niche } = postData;
        const nicheConfigPath = path.join(__dirname, 'content', Niche.trim().toLowerCase(), 'config.json');
        const nicheConfig = JSON.parse(await fs.readFile(nicheConfigPath, 'utf-8'));
        const pexelsClient = createClient(PEXELS_API_KEY);
        const query = nicheConfig.pexels_keywords[Math.floor(Math.random() * nicheConfig.pexels_keywords.length)];
        const pexelsResponse = await pexelsClient.photos.search({ query, per_page: 80 });
        const backgroundImageUrl = pexelsResponse.photos[Math.floor(Math.random() * pexelsResponse.photos.length)].src.large;
        const fontFilePath = path.join(__dirname, 'fonts', nicheConfig.font_file);
        const imageBuffer = await generateImage(backgroundImageUrl, QuoteText, Author, fontFilePath);
        const caption = generateCaption(postData, YOUR_HANDLE, Niche);
        await postToInstagram({ imageBuffer, caption });
        console.log("--- Bot finished successfully! ---");
        console.log("ACTION REQUIRED: Please manually update the 'Status' column in your Google Sheet for the post that was just published.");
    } catch (error) {
        console.error('FATAL ERROR in main execution:', error);
        process.exit(1);
    }
})();
