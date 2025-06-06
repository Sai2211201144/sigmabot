require('dotenv').config(); 
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
const PEXELS_API_KEY = "MR2nCcK51JNFILnli0XqHryY7mVTigYYig9UCn7H4579U1O69ukJ3Yrn";
const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;
const YOUR_HANDLE = '@thesigmacodex1'; // <-- IMPORTANT: Change this to your actual handle
console.log("--- DEBUGGING ---");
console.log("PEXELS_API_KEY loaded by script:", PEXELS_API_KEY);
console.log("-----------------");

// Initialize Pexels Client
const pexelsClient = createClient(PEXELS_API_KEY);

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
// CAROUSEL IMAGE GENERATION ENGINE (for carousels like common_problems)
// ===================================================================
async function generateCarouselImages(slides, nichePath) {
  const imageBuffers = [];
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const templateName = slide.type === 'title' ? 'title-template.html' : 'point-template.html';
    const templatePath = path.join(nichePath, templateName);
    let htmlContent = await fs.readFile(templatePath, 'utf-8');

    if (slide.type === 'title') {
      htmlContent = htmlContent.replace('<p id="slide-text" class="title-text"></p>', `<p id="slide-text" class="title-text">${slide.text}</p>`);
    } else {
      htmlContent = htmlContent
        .replace('<h1 id="heading-text" class="heading-text"></h1>', `<h1 id="heading-text" class="heading-text">${slide.heading}</h1>`)
        .replace('<p id="body-text" class="body-text"></p>', `<p id="body-text" class="body-text">${slide.text}</p>`)
        .replace('{{SLIDE_NUM}}', i + 1)
        .replace('{{TOTAL_SLIDES}}', slides.length);
    }
    htmlContent = htmlContent.replace('@your_insta_handle', YOUR_HANDLE);

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 95 });
    imageBuffers.push({ file: imageBuffer });
    await page.close();
  }

  await browser.close();
  return imageBuffers;
}

// ===================================================================
// INSTAGRAM CAROUSEL POSTING ENGINE
// ===================================================================
async function postCarouselToInstagram({ carouselBuffers, caption }) {
  console.log('Attempting to post carousel to Instagram...');
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

  await ig.publish.album({
    items: carouselBuffers,
    caption: caption,
  });
  console.log('Carousel posted to Instagram successfully!');
}

// ===================================================================
// MAIN ORCHESTRATOR (updated for carousel support)
// ===================================================================
(async () => {
  try {
    // 1. CHOOSE A NICHE FOR THE DAY
    const niches = ['quotes', 'health_tips', 'ai_tools', 'common_problems'];
    const dayOfWeek = new Date().getDay(); // Sunday=0, Monday=1, ...
    const selectedNiche = niches[dayOfWeek % niches.length];
    console.log(`Day ${dayOfWeek}: Running the '${selectedNiche}' module.`);

    const configPath = path.join(__dirname, 'content', selectedNiche, 'config.json');
    const nicheConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    let caption;

    if (selectedNiche === 'common_problems') {
      // Carousel logic
      const nichePath = path.join(__dirname, 'content', selectedNiche);
      const staticContent = await getStaticContent(selectedNiche);
      const slides = staticContent.slides;
      caption = slides[0].text + `\n.\n.\nFollow ${YOUR_HANDLE} for more solutions!`;
      const carouselBuffers = await generateCarouselImages(slides, nichePath);
      await postCarouselToInstagram({ carouselBuffers, caption });
    } else if (selectedNiche === 'ai_tools') {
      // Existing logic for ai_tools
      const dynamicContent = await getDynamicAiContent(nicheConfig);
      const content = { title: dynamicContent.title, subtitle: `Source: ${dynamicContent.source}` };
      caption = `${dynamicContent.title}\n.\n.\n.\nStay ahead of the curve with daily AI news. Follow ${YOUR_HANDLE} for more!\n.\n.\n.\n#ai #artificialintelligence #ainews #tech #machinelearning #futuretech`;
      const templatePath = path.join(__dirname, 'content', selectedNiche, 'template.html');
      const imageBuffer = await generateImage(templatePath, nicheConfig.pexels_keywords, content);
      await postToInstagram({ imageBuffer, caption });
    } else {
      // Existing logic for quotes, health_tips, etc.
      const staticContent = await getStaticContent(selectedNiche);
      const content = { title: staticContent.quote || staticContent.tip, subtitle: staticContent.author || '' };
      const templatePath = path.join(__dirname, 'content', selectedNiche, 'template.html');
      const hashtags = nicheConfig.hashtags || '#motivation #inspiration';
      caption = `${content.title}\n.\n.\n.\nFollow ${YOUR_HANDLE} for your daily dose of wisdom.\n.\n.\n${hashtags}`;
      const imageBuffer = await generateImage(templatePath, nicheConfig.pexels_keywords, content);
      await postToInstagram({ imageBuffer, caption });
    }
  } catch (error) {
    console.error('An error occurred in the main execution:', error);
    process.exit(1);
  }
})();