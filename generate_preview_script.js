const puppeteer = require('puppeteer');
const simpleGit = require('simple-git'); // Still required, but primarily for future use (e.g., getting commit counts)
const { promises: fs } = require('fs');
const path = require('path');

// --- Configuration ---
const TARGET_ORG = 'DapaLMS1';
const OUTPUT_DIR = path.join(__dirname, 'previews');
const CLONE_DIR = path.join(__dirname, 'temp_clone'); // Still defined for robust cleanup, though not strictly used for cloning
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 630;

// The current repository name (used for logging)
const REPO_NAME = 'Catalog_of_Repos';
// Note: GITHUB_TOKEN is passed securely via the GitHub Actions workflow environment.

// --- UTILITY FUNCTIONS ---

/**
 * Utility function to handle directory removal safely using native fs/promises.
 * @param {string} dirPath - The path to the directory to remove.
 */
async function removeDirectory(dirPath) {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`Successfully removed directory: ${dirPath}`);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`Error removing directory ${dirPath}:`, e.message);
        }
    }
}

// --- DATA FETCHING ---

/**
 * Fetches detailed repository data from the target organization using the GitHub API.
 * @returns {Promise<Array<Object>>} An array of repository data objects.
 */
async function fetchRepositories(token) {
    console.log(`Fetching detailed repository list from organization: ${TARGET_ORG}`);
    
    // Fetch both public and private repos (using token)
    const url = `https://api.github.com/orgs/${TARGET_ORG}/repos?per_page=100&type=all`;
    
    const headers = {
        'User-Agent': 'GitHub-Actions-Repo-Preview-Generator',
        'Authorization': `token ${token}`, // Token MUST be present for this to work
        'Accept': 'application/vnd.github.v3+json'
    };

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`GitHub API HTTP error! Status: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        
        // Filter out the current repo (this catalog repo) if needed
        const repositories = data.filter(repo => repo.name !== REPO_NAME);
        
        console.log(`Found ${repositories.length} target repositories.`);
        return repositories.map(repo => ({
            name: repo.name,
            description: repo.description || 'No description provided.',
            language: repo.language || 'N/A',
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            updated_at: new Date(repo.updated_at).toLocaleDateString(),
            html_url: repo.html_url
        }));

    } catch (error) {
        console.error('Error fetching repositories from GitHub API:', error.message);
        return [];
    }
}

// --- HTML GENERATION ---

/**
 * Generates the HTML string for the social preview card.
 * This is where you define the look and feel (HTML structure and Tailwind CSS classes).
 * @param {object} repoData - Data about the repository.
 * @returns {string} The complete HTML string.
 */
function generateHtmlContent(repoData) {
    // Basic color mapping based on language, you can expand this heavily!
    const languageColor = {
        'JavaScript': 'text-yellow-400',
        'TypeScript': 'text-blue-500',
        'Python': 'text-green-500',
        'HTML': 'text-red-500',
        'CSS': 'text-indigo-500',
        'N/A': 'text-gray-400'
    }[repoData.language] || 'text-gray-400';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${repoData.name} Preview</title>
    <!-- Load Tailwind CSS via CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        /* This is the 1200x630 container */
        body {
            width: ${THUMBNAIL_WIDTH}px;
            height: ${THUMBNAIL_HEIGHT}px;
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: 'Inter', sans-serif;
            background: #0d1117; /* GitHub Dark Mode background */
        }
    </style>
</head>
<body class="flex items-center justify-center p-12">
    <div class="w-full h-full p-8 border-4 border-blue-600 rounded-xl flex flex-col justify-between shadow-2xl bg-gray-900">
        
        <!-- Header -->
        <div class="flex items-center justify-between">
            <h1 class="text-6xl font-extrabold text-white">${repoData.name}</h1>
            <div class="text-xl text-gray-500 font-mono">
                ${TARGET_ORG}
            </div>
        </div>

        <!-- Description -->
        <p class="text-3xl text-gray-300 my-4 line-clamp-2">
            ${repoData.description}
        </p>

        <!-- Footer / Metadata -->
        <div class="flex justify-between items-end border-t border-gray-700 pt-4">
            <!-- Language -->
            <div class="flex flex-col">
                <span class="text-sm font-semibold text-gray-400">LANGUAGE</span>
                <span class="text-2xl font-bold ${languageColor}">${repoData.language}</span>
            </div>
            
            <!-- Stats -->
            <div class="flex space-x-8 text-right">
                <div class="flex flex-col items-center">
                    <span class="text-sm font-semibold text-gray-400">STARS</span>
                    <span class="text-3xl font-bold text-yellow-300">${repoData.stars}</span>
                </div>
                <div class="flex flex-col items-center">
                    <span class="text-sm font-semibold text-gray-400">FORKS</span>
                    <span class="text-3xl font-bold text-gray-300">${repoData.forks}</span>
                </div>
            </div>
        </div>
        
    </div>
</body>
</html>
    `;
}

// --- SCREENSHOT PROCESSING ---

/**
 * Takes a screenshot of the generated HTML content and saves it.
 * @param {object} repoData - Data about the repository.
 * @param {puppeteer.Browser} browser - The active Puppeteer browser instance.
 */
async function generatePreviewCard(repoData, browser) {
    const { name } = repoData;
    
    console.log(`\n--- Generating Card for ${name} ---`);
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT });
        
        // 1. Generate the custom HTML content
        const htmlContent = generateHtmlContent(repoData);
        
        // 2. Set the page content (render the custom card)
        await page.setContent(htmlContent, {
             waitUntil: 'networkidle0', 
             timeout: 30000 
        });

        // 3. Take Screenshot
        const outputPath = path.join(OUTPUT_DIR, `${name}.png`);

        console.log(`Taking screenshot and saving to ${outputPath}...`);
        await page.screenshot({ 
            path: outputPath, 
            fullPage: false 
        });
        
        await page.close();
        console.log(`SUCCESS: Thumbnail saved for ${name}.`);

    } catch (error) {
        console.error(`FATAL ERROR generating card for ${name}:`, error.message);
        // Do NOT rethrow the error here; let the loop continue processing other repos.
    }
}

/**
 * Main execution function.
 */
async function main() {
    let browser;
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        // NOTE: This will prevent fetchRepositories from working correctly for all repos.
        console.error("CRITICAL ERROR: GITHUB_TOKEN environment variable not set. Aborting script.");
        process.exit(1);
    }
    
    try {
        // --- Setup ---
        console.log('Cleaning up temporary directories...');
        await removeDirectory(CLONE_DIR); // Clean up temp_clone path just in case
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
        for (const repoData of REPOSITORIES) {
            await generatePreviewCard(repoData, browser); 
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
        
        // Final cleanup
        await removeDirectory(CLONE_DIR); 
        
        console.log('\n--- Script finished ---');
    }
}

main();
