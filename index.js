const express = require('express');
const { createCanvas, GlobalFonts , loadImage} = require('@napi-rs/canvas');
const cloudinary = require('cloudinary').v2;
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
app.use(express.json());

cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
});

function downloadUrl(urlStr, maxRedirects) {
        if (maxRedirects === undefined) maxRedirects = 5;
        return new Promise((resolve, reject) => {
                  https.get(urlStr, { headers: { 'User-Agent': 'Mozilla/5.0 Node.js' } }, (res) => {
                              if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location && maxRedirects > 0) {
                                            const loc = res.headers.location;
                                            const absLoc = loc.startsWith('http') ? loc : new URL(loc, urlStr).href;
                                            res.destroy();
                                            return downloadUrl(absLoc, maxRedirects - 1).then(resolve).catch(reject);
                              }
                              if (res.statusCode !== 200) {
                                            reject(new Error('HTTP ' + res.statusCode + ' for ' + urlStr));
                                            return;
                              }
                              const chunks = [];
                              res.on('data', (chunk) => chunks.push(chunk));
                              res.on('end', () => resolve(Buffer.concat(chunks)));
                              res.on('error', reject);
                  }).on('error', reject);
        });
}

let fontFamily = 'sans-serif';
let fontLoaded = false;
let fontError = null;
let fontPromise = null;
let avatarImage = null;
let avatarError = null;

async function loadFonts() {
        try {
                  const regularUrl = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2';
                  const boldUrl = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2';
                  const [regularBuf, boldBuf] = await Promise.all([
                              downloadUrl(regularUrl),
                              downloadUrl(boldUrl)
                            ]);
                  const tmpDir = os.tmpdir();
                  const regularPath = path.join(tmpDir, 'NotoSans-Regular.woff2');
                  const boldPath = path.join(tmpDir, 'NotoSans-Bold.woff2');
                  fs.writeFileSync(regularPath, regularBuf);
                  fs.writeFileSync(boldPath, boldBuf);
                  const r1 = GlobalFonts.registerFromPath(regularPath, 'NotoSans');
                  const r2 = GlobalFonts.registerFromPath(boldPath, 'NotoSans');
                  if (r1 || r2) fontFamily = 'NotoSans';
                  fontLoaded = true;
                  console.log('Fonts loaded:', fontFamily);
        } catch (e) {
                  fontError = e.message;
                  fontLoaded = true;
                  console.error('Font error:', e.message);
        }
}

async function loadAvatar() {
        try {
                  const localAvatarPath = path.join(__dirname, 'avatar.png');
                  if (fs.existsSync(localAvatarPath)) {
                              avatarImage = await loadImage(localAvatarPath);
                              console.log('Avatar loaded from local file');
                  } else {
                              console.log('Local avatar.png not found, using fallback');
                  }
        } catch (e) {
                  avatarError = e.message;
                  console.error('Avatar load error:', e.message);
        }
}

fontPromise = Promise.all([loadFonts(), loadAvatar()]);

function getField(body, ...keys) {
        for (const key of keys) {
                  if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
                              return String(body[key]);
                  }
        }
        return null;
}

// Split text into segments: regular text and emoji characters
function splitTextAndEmoji(text) {
        const segments = [];
        // Regex to match emoji sequences (including ZWJ sequences, variation selectors, etc.)
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\uFE0F|\u20E3)?(\u200D(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\uFE0F|\u20E3)?)*/gu;
        let lastIndex = 0;
        let match;
        while ((match = emojiRegex.exec(text)) !== null) {
                  if (match.index > lastIndex) {
                              segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
                  }
                  segments.push({ type: 'emoji', content: match[0] });
                  lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
                  segments.push({ type: 'text', content: text.slice(lastIndex) });
        }
        return segments;
}

// Measure width of a text+emoji mixed string
function measureMixedText(ctx, text, emojiSize) {
        const segments = splitTextAndEmoji(text);
        let totalWidth = 0;
        for (const seg of segments) {
                  if (seg.type === 'emoji') {
                              totalWidth += emojiSize;
                  } else {
                              totalWidth += ctx.measureText(seg.content).width;
                  }
        }
        return totalWidth;
}

// Wrap mixed text (text + emojis) into lines
function wrapMixedText(ctx, text, maxWidth, emojiSize) {
        // Split by spaces to get words (keeping emojis as part of words)
  const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        for (const word of words) {
                  const testLine = currentLine ? currentLine + ' ' + word : word;
                  if (measureMixedText(ctx, testLine, emojiSize) <= maxWidth) {
                              currentLine = testLine;
                  } else {
                              if (currentLine) lines.push(currentLine);
                              currentLine = word;
                  }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
}

// Draw a line that contains mixed text and emojis
function drawMixedLine(ctx, text, x, y, emojiSize, FF) {
        const segments = splitTextAndEmoji(text);
        let curX = x;
        for (const seg of segments) {
                  if (seg.type === 'emoji') {
                              // Draw emoji using system emoji font
                    const savedFont = ctx.font;
                              const savedFill = ctx.fillStyle;
                              ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
                              ctx.fillStyle = '#dbdee1';
                              ctx.fillText(seg.content, curX, y);
                              curX += emojiSize;
                              ctx.font = savedFont;
                              ctx.fillStyle = savedFill;
                  } else {
                              ctx.fillText(seg.content, curX, y);
                              curX += ctx.measureText(seg.content).width;
                  }
        }
}

function wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        for (const word of words) {
                  const testLine = currentLine ? currentLine + ' ' + word : word;
                  if (ctx.measureText(testLine).width <= maxWidth) {
                              currentLine = testLine;
                  } else {
                              if (currentLine) lines.push(currentLine);
                              currentLine = word;
                  }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
}

function formatTimestamp(ts) {
        if (!ts) return 'Today';
        try {
                  const d = new Date(ts);
                  if (isNaN(d.getTime())) return 'Today';
                  const now = new Date();
                  const diffMs = now - d;
                  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  if (diffDays === 0) {
                              return 'Today at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  } else if (diffDays === 1) {
                              return 'Yesterday at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  } else {
                              return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
                  }
        } catch (e) {
                  return 'Today';
        }
}

function getAvatarColor(username) {
        const colors = ['#5865F2','#57F287','#FEE75C','#EB459E','#ED4245','#9B59B6','#E67E22','#1ABC9C'];
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
                  hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
}

app.get('/health', (req, res) => {
        res.json({ status: 'ok', fontLoaded, fontFamily, fontError, avatarLoaded: !!avatarImage, avatarError });
});

app.post('/debug', (req, res) => {
        res.json({ body: req.body, keys: Object.keys(req.body) });
});

app.post('/generate-image', async (req, res) => {
        try {
                  if (fontPromise) await fontPromise;

          console.log('Request body keys:', Object.keys(req.body));
                  console.log('Request body:', JSON.stringify(req.body));

          const message = getField(req.body,
                                         'message', 'm', 'me', 'msg', 'content', 'text', 'body',
                                         'Message', 'MESSAGE', 'CONTENT'
                                       ) || '';

          const username = getField(req.body,
                                          'username', 'us', 'user', 'author', 'name', 'u',
                                          'Username', 'USERNAME', 'Author', 'AUTHOR'
                                        ) || 'User';

          const channel = getField(req.body,
                                         'channel', 'ch', 'chan', 'c',
                                         'Channel', 'CHANNEL'
                                       ) || 'general';

          const timestamp = getField(req.body,
                                           'timestamp', 'ti', 'time', 'ts', 't', 'date',
                                           'Timestamp', 'TIMESTAMP'
                                         ) || null;

          console.log('Parsed - message:', message, 'username:', username, 'channel:', channel);

          const WIDTH = 700;
                  const PADDING = 16;
                  const AVATAR_SIZE = 40;
                  const AVATAR_X = 16;
                  const FF = fontFamily;
                  const EMOJI_SIZE = 15;

          const tempCanvas = createCanvas(WIDTH, 200);
                  const tempCtx = tempCanvas.getContext('2d');
                  tempCtx.font = `bold 15px "${FF}"`;
                  const msgMaxWidth = WIDTH - PADDING * 2 - AVATAR_SIZE - 28;
                  const msgLines = message ? wrapMixedText(tempCtx, message, msgMaxWidth, EMOJI_SIZE) : ['(no message)'];

          const HEADER_HEIGHT = 22;
                  const LINE_HEIGHT = 22;
                  const MSG_HEIGHT = msgLines.length * LINE_HEIGHT;
                  const VERTICAL_PAD = 12;
                  const HEIGHT = VERTICAL_PAD + HEADER_HEIGHT + MSG_HEIGHT + VERTICAL_PAD + 4;

          const canvas = createCanvas(WIDTH, HEIGHT);
                  const ctx = canvas.getContext('2d');

          ctx.fillStyle = '#313338';
                  ctx.fillRect(0, 0, WIDTH, HEIGHT);

          const avatarCenterX = AVATAR_X + AVATAR_SIZE / 2;
                  const avatarCenterY = VERTICAL_PAD + AVATAR_SIZE / 2;

          ctx.save();
                  ctx.beginPath();
                  ctx.arc(avatarCenterX, avatarCenterY, AVATAR_SIZE / 2, 0, Math.PI * 2);
                  ctx.closePath();
                  ctx.clip();

          if (avatarImage) {
                      ctx.drawImage(avatarImage, AVATAR_X, VERTICAL_PAD, AVATAR_SIZE, AVATAR_SIZE);
          } else {
                      ctx.fillStyle = getAvatarColor(username);
                      ctx.fillRect(AVATAR_X, VERTICAL_PAD, AVATAR_SIZE, AVATAR_SIZE);
          }

          ctx.restore();

          if (!avatarImage) {
                      ctx.font = `bold 18px "${FF}"`;
                      ctx.fillStyle = '#ffffff';
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillText(username.charAt(0).toUpperCase(), avatarCenterX, avatarCenterY);
          }

          ctx.textAlign = 'left';
                  ctx.textBaseline = 'alphabetic';

          const contentX = AVATAR_X + AVATAR_SIZE + 12;
                  let curY = VERTICAL_PAD;

          // Username (no APP badge)
          ctx.font = `bold 15px "${FF}"`;
                  ctx.fillStyle = '#ffffff';
                  ctx.fillText(username, contentX, curY + 15);

          const usernameWidth = ctx.measureText(username).width;

          // Timestamp (directly after username, no badge)
          const tsText = formatTimestamp(timestamp);
                  const timestampX = contentX + usernameWidth + 8;
                  ctx.font = `12px "${FF}"`;
                  ctx.fillStyle = '#949ba4';
                  ctx.fillText(tsText, timestampX, curY + 15);

          curY += HEADER_HEIGHT + 4;

          // Draw message lines with emoji support
          ctx.font = `bold 15px "${FF}"`;
                  ctx.fillStyle = '#dbdee1';
                  for (const line of msgLines) {
                              drawMixedLine(ctx, line, contentX, curY + 15, EMOJI_SIZE, FF);
                              curY += LINE_HEIGHT;
                  }

          const buffer = await canvas.encode('png');

          const uploadResult = await new Promise((resolve, reject) => {
                      const uploadStream = cloudinary.uploader.upload_stream(
                            { folder: 'discord-trades', resource_type: 'image' },
                                    (error, result) => {
                                                    if (error) reject(error);
                                                    else resolve(result);
                                    }
                                  );
                      uploadStream.end(buffer);
          });

          res.json({
                      image_url: uploadResult.secure_url,
                      success: true,
                      fontFamily: FF,
                      avatarLoaded: !!avatarImage,
                      receivedKeys: Object.keys(req.body)
          });

        } catch (err) {
                  console.error('Error:', err);
                  res.status(500).json({ error: err.message });
        }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
        console.log('Discord image generator running on port ' + PORT);
});
