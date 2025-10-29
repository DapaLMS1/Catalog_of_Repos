const puppeteer = require('puppeteer');
const simpleGit = require('simple-git');
const { promises: fs } = require('fs');
const path = require('path');
// const rimraf = require('rimraf'); // Removed external dependency

// --- Configuration ---
const TARGET_ORG = 'DapaLMS1';
const OUTPUT_DIR = path.join(__dirname, 'previews');
const CLONE_DIR = path.join(__dirname, 'temp_clone');
const INPUT_HTML_FILE = 'index.html'; // Assumes the main page in each repo is index.html
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 630;
// Note: GITHUB_TOKEN is passed securely via the GitHub Actions workflow environment.

/**
 * Utility function to handle directory removal safely using native fs/promises.
 * @param {string} dirPath - The path to the directory to remove.
 */
async function removeDirectory(dirPath) {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`Successfully removed directory: ${dirPath}`);
    } catch (e) {
        // Log an error only if it's not simply "directory not found" (which force: true handles)
        // This is mainly here for debugging unexpected permissions errors.
        if (e.code !== 'ENOENT') {
            console.error(`Error removing directory ${dirPath}:`, e.message);
        }
    }
}


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
        // NOTE: This global 'fetch' requires Node.js v18+ in the CI runner.
        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`GitHub API HTTP error! Status: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        
        const repoNames = data.map(repo => repo.name);
        console.log(`Found ${repoNames.length} repositories.`);
        return repoNames;

    } catch (error) {
        // Catching the fetch error here prevents the main function from exiting with code 1 due to API issues
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
    // simpleGit instance is created here, as it's stateful per execution context
    const git = simpleGit(); 
    
    console.log(`\n--- Processing ${repoName} ---`);

    try {
        // 1. Clone the repository
        console.log(`Cloning ${repoName}...`);
        
        // Use the token in the URL for authentication if needed
        const authenticatedRepoUrl = process.env.GITHUB_TOKEN 
            ? `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${TARGET_ORG}/${repoName}.git`
            : repoUrl;

        await git.clone(authenticatedRepoUrl, clonePath, ['--depth', '1']);
        
        // 2. Locate the HTML file
        const htmlFilePath = path.join(clonePath, INPUT_HTML_FILE);
        
        try {
            // Check for file existence synchronously for speed, but catch error if access fails
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
        
        // Use the 'file://' protocol to load the local HTML file
        await page.goto(`file://${htmlFilePath}`, { 
            waitUntil: 'networkidle0', // Changed to networkidle0 for greater stability (waits for network activity to cease)
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
        // Do NOT rethrow the error here; let the loop continue processing other repos.
    } finally {
        // Remove the clone directory immediately after processing each repo
        await removeDirectory(clonePath);
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
        console.log('Cleaning up temporary directories...');
        // Use the new, robust native function to clean up
        await removeDirectory(CLONE_DIR);
        await removeDirectory(OUTPUT_DIR);
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        // 2. Fetch the dynamic list of repositories
        const REPOSITORIES = await fetchRepositories(token);
        if (REPOSITORIES.length === 0) {
            console.log('No repositories found or API fetch failed. Exiting.');
            return;
        }

        // 3. Launch the Headless Browser
        console.log('Launching headless browser...');
        // Ensure necessary flags are present for CI/Docker environments
        browser = await puppeteer.launch({ 
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', // Recommended for memory-constrained environments
                '--disable-gpu' // Recommended for CI
            ] 
        });

        // --- Processing Loop ---
        for (const repoName of REPOSITORIES) {
            // Processing function now handles its own cleanup for stability
            await processRepository(repoName, browser); 
        }
        
    } catch (error) {
        // This catch block will only execute if setup (like Puppeteer launch) failed.
        console.error('A critical error occurred during main execution. This usually means Puppeteer could not launch or setup failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1); // Explicitly exit with 1 for critical failures
    } finally {
        // --- Teardown ---
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
        
        // Final attempt to clean up the main clone directory path
        console.log('Final cleanup of main clone directory...');
        await removeDirectory(CLONE_DIR);
        
        console.log('\n--- Script finished ---');
    }
}

main();
