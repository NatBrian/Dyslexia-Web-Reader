// Generates simple PNG icons for the extension using pure Node.js
// Creates minimal valid PNGs with a book emoji-style icon

const fs = require('fs');
const path = require('path');

// Minimal PNG generator - creates a solid colored square with rounded appearance
function createPNG(size) {
    // PNG header
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);  // width
    ihdr.writeUInt32BE(size, 4);  // height
    ihdr.writeUInt8(8, 8);        // bit depth
    ihdr.writeUInt8(2, 9);        // color type (RGB)
    ihdr.writeUInt8(0, 10);       // compression
    ihdr.writeUInt8(0, 11);       // filter
    ihdr.writeUInt8(0, 12);       // interlace

    const ihdrChunk = makeChunk('IHDR', ihdr);

    // IDAT chunk - create image data
    const rawData = [];
    const center = size / 2;
    const radius = size * 0.42;

    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter byte (none)
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < radius) {
                // Inside circle - golden/amber color (#B8860B)
                // Add a book-like pattern
                const bookLeft = center - size * 0.2;
                const bookRight = center + size * 0.2;
                const bookTop = center - size * 0.25;
                const bookBottom = center + size * 0.25;

                if (x >= bookLeft && x <= bookRight && y >= bookTop && y <= bookBottom) {
                    // Book shape - white
                    if (Math.abs(x - center) < size * 0.02) {
                        // Book spine - darker
                        rawData.push(140, 100, 8); // dark gold
                    } else {
                        rawData.push(255, 252, 240); // cream white
                    }
                } else {
                    // Circle background - gradient golden
                    const t = dist / radius;
                    const r = Math.round(184 - t * 40);
                    const g = Math.round(134 - t * 30);
                    const b = Math.round(11 + t * 10);
                    rawData.push(r, g, b);
                }
            } else if (dist < radius + 1.5) {
                // Anti-alias edge
                const alpha = Math.max(0, 1 - (dist - radius) / 1.5);
                const r = Math.round(184 * alpha + 240 * (1 - alpha));
                const g = Math.round(134 * alpha + 240 * (1 - alpha));
                const b = Math.round(11 * alpha + 240 * (1 - alpha));
                rawData.push(r, g, b);
            } else {
                // Outside - transparent-ish (light gray for PNG RGB)
                rawData.push(240, 240, 240);
            }
        }
    }

    const zlib = require('zlib');
    const compressed = zlib.deflateSync(Buffer.from(rawData));
    const idatChunk = makeChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const typeBuffer = Buffer.from(type);
    const crcData = Buffer.concat([typeBuffer, data]);

    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData));

    return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const sizes = [16, 48, 128];
const outDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

for (const size of sizes) {
    const png = createPNG(size);
    const outPath = path.join(outDir, `icon${size}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`Created ${outPath} (${png.length} bytes)`);
}

console.log('Icons generated successfully!');
