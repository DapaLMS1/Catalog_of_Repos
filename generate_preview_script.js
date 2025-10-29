/**
 * generate_preview_script.js
 * * This script uses Puppeteer to take a screenshot of the fully rendered
 * * local HTML file.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// !!! IMPORTANT: CHANGE THIS TO THE NAME OF YOUR MAIN HTML FILE !!!
const INPUT_HTML_FILE = 'index.html'; 
const OUTPUT_FILE = 'preview.png';
const WIDTH = 1200; // Standard Open Graph image width
const HEIGHT = 630; // Standard Open Graph image height

async function generateThumbnail() {
    let browser;
    try {
        const htmlFilePath = path.resolve(__dirname, INPUT_HTML_FILE);
        
        // 1. Check if the HTML file exists and log an error if not found
        if (!fs.existsSync(htmlFilePath)) {
            console.error(`❌ FATAL ERROR: Input HTML file not found!`);
            console.error(`Expected path: ${htmlFilePath}`);
            console.error(`Please verify that '${INPUT_HTML_FILE}' is the correct filename and is in the repository root.`);
            process.exit(1);
        }

        console.log('Launching headless Chromium browser via Puppeteer...');
        // Launch a headless browser instance with necessary args for the runner environment
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // Optional: Increase timeout for slower runner startup
            timeout: 10000 
        });

        const page = await browser.newPage();
        await page.setViewport({ width: WIDTH, height: HEIGHT });

        // 2. Navigate to the local HTML file using the file:// protocol
        const fileUrl = `file://${htmlFilePath}`;
        console.log(`Navigating to local file URL: ${fileUrl}`);
        
        // Wait until the network activity settles and the DOM is fully loaded
        await page.goto(fileUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000 // 30 second timeout for page load
        });

        // 3. Optional: Wait a small extra amount for any late-loading JS/Animations to complete
        await page.waitForTimeout(500); 

        // 4. Take the screenshot
        console.log(`Taking screenshot and saving to ${OUTPUT_FILE}...`);
        await page.screenshot({
            path: OUTPUT_FILE,
            clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
            type: 'png'
        });

        console.log(`✅ Successfully generated thumbnail: ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("❌ Failed to generate preview image using Puppeteer. Check if your HTML has any external resources that failed to load:", error.message);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
}

generateThumbnail();
