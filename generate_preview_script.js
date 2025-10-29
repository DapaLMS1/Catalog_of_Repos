const puppeteer = require('puppeteer');
const simpleGit = require('simple-git');
const { promises: fs } = require('fs');
const path = require('path');
const rimraf = require('rimraf');

// --- Configuration ---
const TARGET_ORG = 'DapaLMS1';
const OUTPUT_DIR = path.join(__dirname, 'previews');
const CLONE_DIR = path.join(__dirname, 'temp_clone');
const INPUT_HTML_FILE = 'index.html'; // Assumes the main page in each repo is index.html
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 630;
// Note: GITHUB_TOKEN is passed securely via the GitHub Actions workflow environment.

/**
 * Fetches all public repository names from the target organization using the GitHub API.
 * @returns {Promise<string[]>} An array of repository names.
 */
async function fetchRepositories(token) {
    console.log(`Fetching repository list from organization: ${TARGET_ORG}`);
    
    const url = `https://api.github.com/orgs/${TARGET_ORG}/repos?type=public`;
    
    // GitHub API requires a User-Agent header
    const headers = {
        'User-Agent': 'GitHub-Actions-Repo-Preview-Generator',
    };

    // Use token if available for higher rate limits, even for public repos
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`GitHub API HTTP error! Status: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        
        const repoNames = data.map(repo => repo.name);
        console.log(`Found ${repoNames.length} repositories.`);
        return repoNames;

    } catch (error) {
        console.error('Error fetching repositories from GitHub API:', error.message);
        // If API fails, return empty list to prevent script crash.
        return [];
    }
}


/**
 * Clones a repository, takes a screenshot of its index.html, and saves it.
 * @param {string} repoName - The name of the repository to process.
 * @param {puppeteer.Browser} browser - The active Puppeteer browser instance.
 */
async function processRepository(repoName, browser) {
    const repoUrl = `https://github.com/${TARGET_ORG}/${repoName}.git`;
    const clonePath = path.join(CLONE_DIR, repoName);
    const git = simpleGit();
    
    console.log(`\n--- Processing ${repoName} ---`);

    try {
        // 1. Clone the repository
        console.log(`Cloning ${repoName}...`);
        
        // Use the token in the URL for authentication if needed (for private repos or rate limit bypass)
        const authenticatedRepoUrl = process.env.GITHUB_TOKEN 
            ? `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${TARGET_ORG}/${repoName}.git`
            : repoUrl;

        await git.clone(authenticatedRepoUrl, clonePath, ['--depth', '1']);
        
        // 2. Locate the HTML file
        const htmlFilePath = path.join(clonePath, INPUT_HTML_FILE);
        
        try {
            await fs.access(htmlFilePath);
        } catch (e) {
            console.error(`ERROR: ${INPUT_HTML_FILE} not found in cloned repo ${repoName}. Skipping.`);
            return;
        }

        // 3. Take Screenshot
        const page = await browser.newPage();
        await page.setViewport({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT });
        
        // Navigate to the local file path
        console.log(`Navigating to file://${htmlFilePath}...`);
        await page.goto(`file://${htmlFilePath}`, { 
            waitUntil: 'domcontentloaded', // Wait for the basic DOM structure
            timeout: 30000 // 30 seconds timeout
        });

        // Debugging check: Log page title
        const pageTitle = await page.title();
        console.log(`[PAGE DEBUG] Page Title: ${pageTitle}`);

        // Set the output path
        const outputPath = path.join(OUTPUT_DIR, `${repoName}.png`);

        console.log(`Taking screenshot and saving to ${outputPath}...`);
        await page.screenshot({ 
            path: outputPath, 
            fullPage: false // Only capture the viewport size
        });
        
        await page.close();
        console.log(`SUCCESS: Thumbnail saved for ${repoName}.`);

    } catch (error) {
        console.error(`FATAL ERROR processing ${repoName}:`, error.message);
    } finally {
        // 4. Cleanup (Done by the main function for efficiency)
    }
}

/**
 * Main execution function.
 */
async function main() {
    let browser;
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        console.warn("WARNING: GITHUB_TOKEN environment variable not set. This may lead to API rate limits or failure to clone private repos.");
    }
    
    try {
        // --- Setup ---
        // 1. Clean up old temporary clone directory and output directory
        console.log('Cleaning up temporary directories...');
        await rimraf(CLONE_DIR);
        await rimraf(OUTPUT_DIR);
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        // 2. Fetch the dynamic list of repositories
        const REPOSITORIES = await fetchRepositories(token);
        if (REPOSITORIES.length === 0) {
            console.log('No repositories found or API fetch failed. Exiting.');
            return;
        }

        // 3. Launch the Headless Browser
        console.log('Launching headless browser...');
        // Use 'new' to ensure latest Puppeteer API is used
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });

        // --- Processing Loop ---
        for (const repoName of REPOSITORIES) {
            await processRepository(repoName, browser);
        }
        
    } catch (error) {
        console.error('An unexpected error occurred during main execution:', error);
        process.exit(1);
    } finally {
        // --- Teardown ---
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
        
        // Clean up the temporary directory
        if (fs.existsSync(CLONE_DIR)) {
            console.log('Final cleanup of clone directory...');
            await rimraf(CLONE_DIR);
        }
        
        console.log('\n--- Script finished successfully ---');
    }
}

main();
