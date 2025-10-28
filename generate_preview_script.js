const fs = require('fs');
const path = require('path');

// This is the base64 data for a small (64x64) solid blue PNG image.
// It is used here to ensure the GitHub Action has no external dependencies 
// and can run successfully to create a valid 'preview.png' file.
const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAA7DAAAOwwHH9cEAAAALUlEQVR42u3BAQEAAADL/71+D7b4AAAAAABQf9AAAAAAAFB/0AAAAAAAUP8AAAB4sQEwT76w36g9DAAAAABJRU5ErkJggg==';

// The output file name must match what the Canvas document is looking for.
const targetPath = path.join(process.cwd(), 'preview.png');
const binaryData = Buffer.from(base64Image, 'base64');

try {
    fs.writeFileSync(targetPath, binaryData, 'binary');
    console.log(`Successfully generated PNG at: ${targetPath}`);
} catch (error) {
    console.error('Failed to write preview.png:', error);
    // Ensure the action fails if the file cannot be written
    process.exit(1); 
}
