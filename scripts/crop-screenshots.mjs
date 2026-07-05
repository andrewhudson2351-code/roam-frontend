import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";

// Pixels to crop off the top (the real device status bar).
// Adjust after testing on one image.
const CROP_TOP = 90;

// App Store 6.5" display size
const OUTPUT_WIDTH = 1284;
const OUTPUT_HEIGHT = 2778;

const INPUT_DIR = "screenshots-raw";
const OUTPUT_DIR = "screenshots-cropped";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

const files = (await readdir(INPUT_DIR)).filter((f) =>
  IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase())
);

if (files.length === 0) {
  console.log(`No images found in ${INPUT_DIR}/`);
  process.exit(0);
}

await mkdir(OUTPUT_DIR, { recursive: true });

for (const file of files) {
  const src = path.join(INPUT_DIR, file);
  const dest = path.join(OUTPUT_DIR, file);

  const { width, height } = await sharp(src).metadata();

  if (height <= CROP_TOP) {
    console.log(`SKIP ${file}: height ${height}px is not taller than crop (${CROP_TOP}px)`);
    continue;
  }

  await sharp(src)
    .extract({ left: 0, top: CROP_TOP, width, height: height - CROP_TOP })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "fill" })
    .toFile(dest);

  console.log(`${file}: ${width}x${height} -> cropped ${width}x${height - CROP_TOP} -> resized ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`);
}

console.log(`\nDone. ${files.length} file(s) processed into ${OUTPUT_DIR}/`);
