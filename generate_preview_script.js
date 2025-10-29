/**
 * generate_preview_script.js
 * * This script uses Puppeteer and simple-git to iterate through a list of
 * * repositories, clone each one, take a screenshot of its index.html, and
 * * save the result.
 * * * IMPORTANT: This script requires the GITHUB_TOKEN environment variable
 * * to be set with 'repo' scope permissions for cloning.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { simpleGit } = require('simple-git');
const util = require('util');
// We use a utility to safely delete directories cross-platform
const rimraf = util.promisify(require('rimraf')); 

// --- CONFIGURATION ---
const TARGET_ORG = 'DapaLMS1'; 
const REPOSITORIES = [
    'repo-a-dashboard',
    'repo-b-analytics',
    'repo-c-reports'
    // !!! CRITICAL: REPLACE THESE WITH THE ACTUAL NAMES OF YOUR REPOSITORIES IN DAPALMS !!!
];
const INPUT_HTML_FILE = 'index.html'; // The file to screenshot within each repository
const OUTPUT_DIR = path.resolve(__dirname, 'previews'); // Directory to save all generated thumbnails
const WIDTH = 1200; 
const HEIGHT = 630; 
// ----------------------

async function generateThumbnail(repoName, browser) {
    const TEMP_DIR = path.resolve(__dirname, 'temp-clone', repoName);
    const OUTPUT_FILE = path.join(OUTPUT_DIR, `${repoName}.png`);
    
    // Check for GITHUB_TOKEN (required for cloning)
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        console.error('❌ ERROR: GITHUB_TOKEN environment variable is not set. Cannot clone repositories.');
        return;
    }

    try {
        console.log(`\n--- Processing Repository: ${repoName} ---`);

        // 1. Clone the repository
        // We use the token in the URL for authentication
        const repoUrl = `https://${githubToken}@github.com/${TARGET_ORG}/${repoName}.git`;
        
        console.log(`Cloning ${repoName} into ${TEMP_DIR}...`);
        const git = simpleGit();
        
        // Ensure parent temp directory exists
        if (!fs.existsSync(path.resolve(__dirname, 'temp-clone'))) {
            fs.mkdirSync(path.resolve(__dirname, 'temp-clone'));
        }

        await git.clone(repoUrl, TEMP_DIR, ['--depth', '1']);
        console.log(`✅ Clone complete.`);

        // 2. Setup Puppeteer page
        const page = await browser.newPage();
        await page.setViewport({ width: WIDTH, height: HEIGHT });

        // Add page debugging listeners (optional, but helpful)
        page.on('console', msg => console.log(`[PAGE CONSOLE - ${repoName}]: ${msg.text()}`));
        page.on('pageerror', error => console.error(`[PAGE ERROR - ${repoName}]: ${error.message}`));

        // 3. Navigate to the local HTML file inside the cloned repo
        const htmlFilePath = path.join(TEMP_DIR, INPUT_HTML_FILE);
        if (!fs.existsSync(htmlFilePath)) {
            console.warn(`⚠️ WARNING: File ${INPUT_HTML_FILE} not found in ${repoName}. Skipping.`);
            await page.close();
            return;
        }

        const fileUrl = `file://${htmlFilePath}`;
        console.log(`Navigating to: ${fileUrl}`);
        
        await page.goto(fileUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });

        // 4. Debugging: Check the page title
        const pageTitle = await page.title();
        console.log(`✅ Page navigated. Title: "${pageTitle}"`);
        
        // 5. Take the screenshot
        console.log(`Taking screenshot and saving to ${OUTPUT_FILE}...`);
        await page.screenshot({
            path: OUTPUT_FILE,
            clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
            type: 'png'
        });

        console.log(`✅ Successfully generated thumbnail: ${OUTPUT_FILE}`);
        
        await page.close();

    } catch (error) {
        console.error(`❌ Failed to process ${repoName}. Error details: ${error.message}`);
    } finally {
        // 6. Cleanup the cloned repository
        console.log(`Cleaning up temporary directory ${TEMP_DIR}...`);
        // Use try/catch for cleanup to ensure the script doesn't fail here unnecessarily
        try {
            await rimraf(TEMP_DIR);
            console.log(`Cleanup complete.`);
        } catch(e) {
            console.error(`Failed to clean up ${TEMP_DIR}: ${e.message}`);
        }
    }
}

async function runGenerator() {
    let browser;
    try {
        // Ensure the output directory exists
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            console.log(`Created output directory: ${OUTPUT_DIR}`);
        }
        
        console.log('Launching headless Chromium browser (once for all repos)...');
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 20000 
        });

        // Process all repositories sequentially
        for (const repo of REPOSITORIES) {
            await generateThumbnail(repo, browser);
        }
        
        console.log('\n--- All repository previews generated successfully! ---');

    } catch (error) {
        console.error(`\n❌ CRITICAL FAILURE in runGenerator: ${error.message}`);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
        // Final cleanup of the main temp folder
        try {
            await rimraf(path.resolve(__dirname, 'temp-clone'));
        } catch (e) {
            console.warn(`Could not fully clean up temp-clone directory.`);
        }
    }
}

runGenerator();
