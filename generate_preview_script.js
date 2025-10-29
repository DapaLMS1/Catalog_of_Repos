const puppeteer = require('puppeteer');
const { promises: fs } = require('fs');
const path = require('path');

// --- Configuration ---
const TARGET_ORG = 'DapaLMS1';
const OUTPUT_DIR = path.join(__dirname, 'previews');
const CLONE_DIR = path.join(__dirname, 'temp_clone');
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 630;
const REPO_NAME = 'Catalog_of_Repos';

// CRITICAL FIX: Explicitly define a list of repositories to target. 
// This bypasses the failing API call that attempts to fetch ALL organization repos,
// and instead allows the script to fetch details for these specific repos, which is usually permitted.
const TARGET_REPOS = [
    // Add your actual repository names here (e.g., 'Calculator-App', 'Landing-Page-Project')
    'Repo-Example-1', 
    'Repo-Example-2' 
];


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
 * Fetches detailed repository data for a list of known repositories.
 * @param {string} repoName - The name of the repository.
 * @param {string} token - The GitHub token.
 * @returns {Promise<Object | null>} Detailed repository data or null on failure.
 */
async function fetchRepositoryDetails(repoName, token) {
    // Note: Using the specific repo endpoint usually works even with restricted GITHUB_TOKEN.
    const url = `https://api.github.com/repos/${TARGET_ORG}/${repoName}`;
    
    const headers = {
        'User-Agent': 'GitHub-Actions-Repo-Preview-Generator',
        'Authorization': `token ${token}`, 
        'Accept': 'application/vnd.github.v3+json'
    };

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.warn(`WARNING: Failed to fetch details for ${repoName}. Status: ${response.status}. Using placeholders.`);
            return {
                name: repoName,
                description: 'Could not fetch description from GitHub API.',
                language: 'Unknown',
                stars: 0,
                forks: 0,
                updated_at: new Date().toLocaleDateString(),
                html_url: `https://github.com/${TARGET_ORG}/${repoName}`
            };
        }

        const repo = await response.json();
        
        return {
            name: repo.name,
            description: repo.description || 'No description provided.',
            language: repo.language || 'N/A',
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            updated_at: new Date(repo.updated_at).toLocaleDateString(),
            html_url: repo.html_url
        };

    } catch (error) {
        console.error(`Error fetching details for ${repoName}:`, error.message);
        return null;
    }
}


// --- HTML GENERATION (Unchanged from previous version) ---

/**
 * Generates the HTML string for the social preview card.
 * @param {object} repoData - Data about the repository.
 * @returns {string} The complete HTML string.
 */
function generateHtmlContent(repoData) {
    const languageColor = {
        'JavaScript': 'text-yellow-400',
        'TypeScript': 'text-blue-500',
        'Python': 'text-green-500',
        'HTML': 'text-red-500',
        'CSS': 'text-indigo-500',
        'N/A': 'text-gray-400',
        'Unknown': 'text-gray-400'
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

// --- SCREENSHOT PROCESSING (Unchanged) ---

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
    }
}

/**
 * Main execution function.
 */
async function main() {
    let browser;
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        console.error("CRITICAL ERROR: GITHUB_TOKEN environment variable not set. Aborting script.");
        process.exit(1);
    }
    
    try {
        // --- Setup ---
        console.log('Cleaning up temporary directories...');
        await removeDirectory(CLONE_DIR); // Clean up temp_clone path just in case
        await removeDirectory(OUTPUT_DIR);
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        // 2. Fetch details for the predefined list of repositories
        const REPOSITORIES_DATA = [];
        console.log(`\nStarting fetch for ${TARGET_REPOS.length} target repositories...`);

        for (const repoName of TARGET_REPOS) {
            const data = await fetchRepositoryDetails(repoName, token);
            if (data) {
                REPOSITORIES_DATA.push(data);
            }
        }

        if (REPOSITORIES_DATA.length === 0) {
            console.log('No repository details could be fetched. Exiting.');
            return;
        }

        // 3. Launch the Headless Browser
        console.log('\nLaunching headless browser...');
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
        for (const repoData of REPOSITORIES_DATA) {
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
