// Forcing a new commit to sync project structure
const puppeteer = require('puppeteer');
// ... rest of the file
const { createClient } = require('pexels');
const { IgApiClient } = require('instagram-private-api');
const fs = require('fs').promises;
const path = require('path');
const Parser = require('rss-parser');

// --- CONFIGURATION ---
// These are loaded from GitHub Secrets, no changes needed here.
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;
const YOUR_HANDLE = '@thesigmacodex1'; // <-- IMPORTANT: Change this to your actual handle

// ===================================================================
// GENERIC IMAGE GENERATION ENGINE
// This function is now a generic tool that can create an image from any template and content.
// ===================================================================
async function generateImage(templatePath, pexelsKeywords, content) {
    console.log(`Generating image using template: ${templatePath}`);
    const pexelsClient = createClient(PEXELS_API_KEY);
    const query = pexelsKeywords[Math.floor(Math.random() * pexelsKeywords.length)];
    const pexelsResponse = await pexelsClient.photos.search({ query, per_page: 80 });
    const photo = pexelsResponse.photos[Math.floor(Math.random() * pexelsResponse.photos.length)];
    const imageUrl = photo.src.large2x;

    let htmlContent = await fs.readFile(templatePath, 'utf-8');

    // Replace all placeholders in the template
    htmlContent = htmlContent
        .replace('IMAGE_URL_PLACEHOLDER', imageUrl)
        .replace('TITLE_PLACEHOLDER', content.title || '')
        .replace('SUBTITLE_PLACEHOLDER', content.subtitle || '')
        .replace(YOUR_HANDLE, YOUR_HANDLE); // In case the handle itself is a placeholder

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
    await browser.close();

    console.log('Image generated successfully.');
    return imageBuffer;
}

// ===================================================================
// INSTAGRAM POSTING ENGINE
// This function is robust and handles session data. No changes needed.
// ===================================================================
async function postToInstagram({ imageBuffer, caption }) {
  console.log('Attempting to post to Instagram...');
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);

  const sessionPath = path.join(__dirname, 'ig-session.json');
  try {
    const sessionData = await fs.readFile(sessionPath, 'utf-8');
    await ig.state.deserialize(JSON.parse(sessionData));
    console.log('Loaded existing session.');
  } catch (e) {
    console.log('No valid session found. Logging in with username and password.');
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
  }

  const serializedSession = await ig.state.serialize();
  delete serializedSession.constants;
  await fs.writeFile(sessionPath, JSON.stringify(serializedSession));
  console.log('Session state saved.');

  await ig.publish.photo({
    file: imageBuffer,
    caption: caption,
  });
  console.log('Posted to Instagram successfully!');
}

// ===================================================================
// CONTENT FETCHING MODULES
// Each function is specialized for a type of content.
// ===================================================================

async function getStaticContent(niche) {
    console.log(`Fetching static content for niche: ${niche}`);
    const dataPath = path.join(__dirname, 'content', niche, 'data.json');
    const usedDataPath = path.join(__dirname, 'content', niche, 'used_data.json');

    const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));
    let usedData = [];
    try {
        usedData = JSON.parse(await fs.readFile(usedDataPath, 'utf-8'));
    } catch (e) {
        console.log('Used data file not found, creating a new one.');
    }

    let availableData = data.filter(item => !usedData.some(usedItem => JSON.stringify(usedItem) === JSON.stringify(item)));

    if (availableData.length === 0) {
        console.log(`All content in ${niche} has been used. Resetting.`);
        availableData = data; // Use all data again
        usedData = []; // Clear the used list
    }
    
    const selectedItem = availableData[Math.floor(Math.random() * availableData.length)];
    usedData.push(selectedItem);
    await fs.writeFile(usedDataPath, JSON.stringify(usedData, null, 2));
    
    return selectedItem;
}

async function getDynamicAiContent(config) {
    console.log(`Fetching dynamic content from RSS feed: ${config.rss_feed_url}`);
    const parser = new Parser();
    const feed = await parser.parseURL(config.rss_feed_url);
    const latestItem = feed.items[0]; // Always get the most recent article
    return {
        title: latestItem.title,
        source: new URL(latestItem.link).hostname.replace('www.',''), // e.g., 'techcrunch.com'
    };
}


// ===================================================================
// MAIN ORCHESTRATOR
// ===================================================================
(async () => {
  try {
    // 1. CHOOSE A NICHE FOR THE DAY
    const niches = ['quotes', 'health_tips', 'ai_tools'];
    const dayOfWeek = new Date().getDay(); // Sunday=0, Monday=1, ...
    const selectedNiche = niches[dayOfWeek % niches.length];
    console.log(`Day ${dayOfWeek}: Running the '${selectedNiche}' module.`);

    const configPath = path.join(__dirname, 'content', selectedNiche, 'config.json');
    const templatePath = path.join(__dirname, 'content', selectedNiche, 'template.html');
    const nicheConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    let content;
    let caption;

    // 2. FETCH AND PREPARE CONTENT BASED ON NICHE
    if (selectedNiche === 'ai_tools') {
        const dynamicContent = await getDynamicAiContent(nicheConfig);
        content = { title: dynamicContent.title, subtitle: `Source: ${dynamicContent.source}` };
        caption = `${dynamicContent.title}\n.\n.\n.\nStay ahead of the curve with daily AI news. Follow ${YOUR_HANDLE} for more!\n.\n.\n.\n#ai #artificialintelligence #ainews #tech #machinelearning #futuretech`;
    } else {
        const staticContent = await getStaticContent(selectedNiche);
        // This handles different keys like 'quote' or 'tip' automatically
        content = { title: staticContent.quote || staticContent.tip, subtitle: staticContent.author || '' };
        const hashtags = nicheConfig.hashtags || '#motivation #inspiration';
        caption = `${content.title}\n.\n.\n.\nFollow ${YOUR_HANDLE} for your daily dose of wisdom.\n.\n.\n${hashtags}`;
    }

    // 3. GENERATE IMAGE
    const imageBuffer = await generateImage(templatePath, nicheConfig.pexels_keywords, content);

    // 4. POST TO INSTAGRAM
    await postToInstagram({ imageBuffer, caption });

  } catch (error) {
    console.error('An error occurred in the main execution:', error);
    process.exit(1);
  }
})();