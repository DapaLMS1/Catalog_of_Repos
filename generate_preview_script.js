const puppeteer = require('puppeteer');
const simpleGit = require('simple-git');
const { promises: fs } = require('fs');
const path = require('path');
// This script requires Node.js v18+ for native fetch support

// --- Configuration ---
const TARGET_ORG = 'DapaLMS1';
const OUTPUT_DIR = path.join(__dirname, 'previews');
const CLONE_DIR = path.join(__dirname, 'temp_clone');
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 630;
// Note: ORG_PAT_TOKEN is passed securely via the GitHub Actions workflow environment.

/**
 * Utility function to handle directory removal safely using native fs/promises.
 * @param {string} dirPath - The path to the directory to remove.
 */
async function removeDirectory(dirPath) {
    try {
        // Use recursive: true and force: true for robust cleanup in CI environment
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`Successfully removed directory: ${dirPath}`);
    } catch (e) {
        // Log an error only if it's not simply "directory not found"
        if (e.code !== 'ENOENT') {
            console.error(`Error removing directory ${dirPath}:`, e.message);
        }
    }
}

/**
 * Fetches all public repository names accessible by the token user, then filters for the target organization.
 * Uses the ORG_PAT_TOKEN.
 * @returns {Promise<string[]>} An array of repository names belonging to TARGET_ORG.
 */
async function fetchRepositoryNames() {
    console.log(`Fetching all accessible repositories for the token user...`);
    
    // Get token from the environment variable (now ORG_PAT_TOKEN)
    const token = process.env.ORG_PAT_TOKEN;
    if (!token) {
        console.error("FATAL: ORG_PAT_TOKEN environment variable not set. Cannot fetch dynamic repository list.");
        return [];
    }

    const allRepoNames = [];
    let page = 1;
    let hasNextPage = true;
    
    while (hasNextPage) {
        // UPDATED: Removed affiliation=organization_member filter for broader results
        const url = `https://api.github.com/user/repos?per_page=100&page=${page}`;
        
        const headers = {
            'User-Agent': 'GitHub-Actions-Repo-Preview-Generator',
            // Use the powerful ORG_PAT_TOKEN
            'Authorization': `token ${token}`,
        };

        try {
            const response = await fetch(url, { headers });

            if (!response.ok) {
                // If API fails, log the specific error
                throw new Error(`GitHub API HTTP error! Status: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            
            // Check for pagination link in the headers
            const linkHeader = response.headers.get('link');
            hasNextPage = linkHeader && linkHeader.includes('rel="next"');

            // Collect repository names, ensuring they belong to the TARGET_ORG and excluding the current catalog repo
            const names = data
                // CRITICAL FILTER: Ensure the repo belongs to the correct organization
                .filter(repo => repo.owner.login === TARGET_ORG)
                // Filter out the current catalog repository
                .filter(repo => repo.name !== 'Catalog_of_Repos')
                .map(repo => repo.name);

            allRepoNames.push(...names);
            page++;

        } catch (error) {
            console.error(`ERROR fetching repository list: ${error.message}.`);
            // Stop processing on error
            hasNextPage = false; 
        }
    }
    
    console.log(`Found ${allRepoNames.length} repositories in ${TARGET_ORG} accessible by the token.`);
    return allRepoNames;
}

/**
 * Fetches detailed metadata for a single repository.
 * @param {string} repoName - The name of the repository.
 * @returns {Promise<object>} Repository metadata object.
 */
async function fetchRepoDetails(repoName) {
    const url = `https://api.github.com/repos/${TARGET_ORG}/${repoName}`;
    const token = process.env.ORG_PAT_TOKEN; 

    const headers = {
        'User-Agent': 'GitHub-Actions-Repo-Preview-Generator',
        'Authorization': `token ${token}`,
    };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch details for ${repoName}. Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching details for ${repoName}:`, error.message);
        return null;
    }
}

/**
 * Generates the HTML content for a single repository card.
 * @param {object} details - Repository metadata from the GitHub API.
 * @returns {string} The complete, styled HTML string.
 */
function generateHtmlContent(details) {
    // Basic fallback data if API details failed
    const repoName = details.name || "Unknown Repository";
    const description = details.description || "A project hosted on GitHub.";
    const language = details.language || "Mixed";
    const stars = details.stargazers_count || 0;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${repoName} Social Card</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            width: 1200px;
            height: 630px;
            overflow: hidden;
        }
    </style>
</head>
<body class="bg-gray-900 flex items-center justify-center p-12">
    <div class="w-full h-full bg-gray-800 rounded-2xl shadow-2xl flex flex-col justify-between p-16 border-4 border-indigo-500">
        <!-- Header/Title -->
        <div>
            <h1 class="text-6xl font-extrabold text-indigo-400 leading-tight">
                ${repoName.replace(/-/g, ' ')}
            </h1>
            <p class="text-2xl text-gray-300 mt-4 h-20 overflow-hidden">
                ${description}
            </p>
        </div>

        <!-- Footer/Metadata -->
        <div class="flex justify-between items-end text-xl text-gray-400 pt-8 border-t border-gray-700">
            <!-- Left: Language & Organization -->
            <div class="flex items-center space-x-6">
                <span class="font-semibold text-lg text-white bg-indigo-600 px-4 py-1 rounded-full shadow-lg">
                    ${language}
                </span>
                <span class="text-gray-500">
                    \u25CF ${TARGET_ORG}
                </span>
            </div>
            
            <!-- Right: Stars -->
            <div class="flex items-center text-yellow-400 font-bold text-3xl">
                <!-- Star Icon (Inline SVG) -->
                <svg class="w-8 h-8 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.638-.921 1.94 0l1.247 3.823a1 1 0 00.95.69h4.037c.969 0 1.371 1.24.588 1.81l-3.266 2.373a1 1 0 00-.364 1.118l1.247 3.823c.3.921-.755 1.688-1.54 1.118l-3.266-2.373a1 1 0 00-1.176 0l-3.266 2.373c-.785.57-1.84-.197-1.54-1.118l1.247-3.823a1 1 0 00-.364-1.118L2.27 9.25c-.783-.57-.381-1.81.588-1.81h4.037a1 1 0 00.95-.69l1.247-3.823z"></path>
                </svg>
                ${stars.toLocaleString()}
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Takes a screenshot of the dynamically generated HTML and saves it.
 * @param {string} repoName - The name of the repository.
 * @param {object} details - Repository metadata.
 * @param {puppeteer.Browser} browser - The active Puppeteer browser instance.
 */
async function processRepository(repoName, details, browser) {
    console.log(`\n--- Processing ${repoName} ---`);

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT });
        
        // 1. Generate HTML content based on fetched details
        const htmlContent = generateHtmlContent(details);
        
        // 2. Load the HTML directly into the page (no file cloning needed)
        console.log(`Loading dynamic HTML content for ${repoName}...`);
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0', // Wait for external resources (Tailwind/Font) to load
            timeout: 30000 
        });

        // 3. Take Screenshot
        const outputPath = path.join(OUTPUT_DIR, `${repoName}.png`);

        console.log(`Taking screenshot and saving to ${outputPath}...`);
        await page.screenshot({ 
            path: outputPath, 
            fullPage: false // Only capture the fixed 1200x630 viewport size
        });
        
        await page.close();
        console.log(`SUCCESS: Thumbnail saved for ${repoName}.`);

    } catch (error) {
        console.error(`FATAL ERROR processing ${repoName}:`, error.message);
        // Do NOT rethrow the error here; let the loop continue processing other repos.
    }
}

/**
 * Main execution function.
 */
async function main() {
    let browser;
    // CRITICAL: Now using the ORG_PAT_TOKEN
    const token = process.env.ORG_PAT_TOKEN;

    if (!token) {
        console.warn("WARNING: ORG_PAT_TOKEN environment variable not set. Cannot fetch dynamic list or metadata.");
        // We must exit if the token needed for the API is missing
        process.exit(1); 
    }
    
    try {
        // --- Setup ---
        console.log('Cleaning up temporary directories...');
        // Clean up output directory (previews)
        await removeDirectory(OUTPUT_DIR);
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        // 2. Fetch the dynamic list of repositories (Now using PAT)
        const REPO_NAMES = await fetchRepositoryNames();
        if (REPO_NAMES.length === 0) {
            console.log('No repositories found or API fetch failed. Exiting.');
            return;
        }

        // 3. Launch the Headless Browser
        console.log('Launching headless browser...');
        browser = await puppeteer.launch({ 
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu'
            ] 
        });

        // --- Processing Loop ---
        for (const repoName of REPO_NAMES) {
            // Fetch detailed metadata for the card content
            const details = await fetchRepoDetails(repoName);
            
            if (details) {
                await processRepository(repoName, details, browser); 
            } else {
                console.log(`Skipping ${repoName} due to failed details fetch.`);
            }
        }
        
    } catch (error) {
        console.error('A critical error occurred during main execution. This usually means Puppeteer could not launch or setup failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        // --- Teardown ---
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
        // No need to remove CLONE_DIR since we removed cloning.
        console.log('\n--- Script finished ---');
    }
}

main();
