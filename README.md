Catalog of Repository Social Preview Cards

This repository uses a custom GitHub Action workflow to automatically generate a catalog of social media preview cards for multiple repositories within the organization.

When someone shares a link to another repository in your organization (e.g., on platforms like Twitter, Slack, or Discord), the corresponding image from this repository will be used as the social card instead of the default, generic GitHub card.

🚀 How It Works

The entire process runs automatically inside the GitHub Actions CI/CD environment. The workflow is triggered on every push to the main branch, or manually via workflow_dispatch.

The core mechanism is defined in the .github/workflows/generate_preview.yml file and powered by a Node.js script that uses a headless browser.

Workflow Steps (Defined in generate_preview.yml):

Environment Setup: Installs Node.js v20 and the necessary Chromium system dependencies required to run the headless browser (Puppeteer).

Dependency Install: Runs npm ci to install project dependencies (puppeteer, simple-git) based on the locked versions in package-lock.json.

Image Generation: Executes the generate_preview_script.js Node.js file.

This script uses simple-git and the GitHub API to fetch and analyze data from all target repositories.

It uses Puppeteer to launch a headless browser, render a custom HTML/CSS template containing each repository's data, and take a high-resolution screenshot for each.

Commit: The stefanzweifel/git-auto-commit-action checks for the newly created image files (typically in a previews/ directory). If changes are detected, it automatically commits and pushes the images back to the repository under the name github-actions[bot].

📂 Required Files

This automation requires three core configuration and code files in the repository root:

File

Purpose

.github/workflows/generate_preview.yml

The GitHub Action definition. This file sets the triggers, permissions, and the sequence of steps for the automation.

package.json

Lists the Node.js dependencies (puppeteer, simple-git) needed for the script.

package-lock.json

Locks the exact version of every dependency to ensure the CI environment is always reproducible and stable.

generate_preview_script.js

The main logic file. This script iterates through your organization's repositories, analyzes their data, and generates a preview image for each one using Puppeteer.

🛠️ Usage and Maintenance

Triggering: The workflow runs automatically on every push to main or can be run manually via the Actions tab on GitHub (using the "Run workflow" button).

Preventing Loops: The workflow includes a critical check (if: github.actor != 'github-actions[bot]') to ensure it does not re-trigger itself when it commits the newly generated image.

Customization: To change the appearance or content of the social card, modify the HTML/CSS template within the generate_preview_script.js file.
