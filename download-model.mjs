import { pipeline, env } from '@xenova/transformers';
import path from 'path';

// Set the cache directory to the public folder
env.cacheDir = path.join(process.cwd(), 'public/models');

async function downloadModel() {
  console.log("Downloading model to public/models...");
  try {
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    console.log("Download complete!");
  } catch (err) {
    console.error("Error downloading:", err);
  }
}

downloadModel();
