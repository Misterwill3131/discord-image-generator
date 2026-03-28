const express = require('express');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const cloudinary = require('cloudinary').v2;
const https = require('https');

const app = express();
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Download a TTF font buffer from URL
function downloadFont(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

let fontFamily = 'sans-serif';
let fontLoaded = false;

async function ensureFonts() {
  if (fontLoaded) return;
  try {
    // Download NotoSans Bold TTF from GitHub (reliable CDN)
    const regularUrl = 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
    const boldUrl = 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf';
    const [regularBuf, boldBuf] = await Promise.all([
      downloadFont(regularUrl),
      downloadFont(boldUrl)
    ]);
    GlobalFonts.registerFromData(regularBuf, 'NotoSans');
    GlobalFonts.registerFromData(boldBuf, 'NotoSans');
    fontFamily = 'NotoSans';
    fontLoaded = true;
    console.log('Fonts loaded successfully');
  } catch (e) {
    console.error('Font load failed, using fallback:', e.message);
    fontFamily = 'sans-serif';
    fontLoaded = true;
  }
}

// Start loading fonts immediately
ensureFonts();

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
  res.json({ status: 'ok', fontLoaded, fontFamily });
});

app.post('/generate-image', async (req, res) => {
  try {
    await ensureFonts();
    const { message = '', username = 'User', channel = 'general', timestamp = null } = req.body;

    const WIDTH = 700;
    const PADDING = 16;
    const AVATAR_SIZE = 40;
    const AVATAR_X = 16;
    const FF = fontFamily;

    const tempCanvas = createCanvas(WIDTH, 200);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `bold 15px ${FF}`;
    const msgMaxWidth = WIDTH - PADDING * 2 - AVATAR_SIZE - 28;
    const msgLines = wrapText(tempCtx, message, msgMaxWidth);

    const HEADER_HEIGHT = 22;
    const LINE_HEIGHT = 22;
    const MSG_HEIGHT = msgLines.length * LINE_HEIGHT;
    const VERTICAL_PAD = 12;
    const HEIGHT = VERTICAL_PAD + HEADER_HEIGHT + MSG_HEIGHT + VERTICAL_PAD + 4;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#313338';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Avatar circle
    const avatarCenterX = AVATAR_X + AVATAR_SIZE / 2;
    const avatarCenterY = VERTICAL_PAD + AVATAR_SIZE / 2;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = getAvatarColor(username);
    ctx.fill();

    // Avatar letter
    ctx.font = `bold 18px ${FF}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(username.charAt(0).toUpperCase(), avatarCenterX, avatarCenterY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const contentX = AVATAR_X + AVATAR_SIZE + 12;
    let curY = VERTICAL_PAD;

    // Username
    ctx.font = `bold 15px ${FF}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(username, contentX, curY + 15);
    const usernameWidth = ctx.measureText(username).width;

    // APP badge
    const badgeX = contentX + usernameWidth + 8;
    const badgeY = curY + 3;
    const badgeW = 34;
    const badgeH = 14;
    const badgeRadius = 3;
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.moveTo(badgeX + badgeRadius, badgeY);
    ctx.lineTo(badgeX + badgeW - badgeRadius, badgeY);
    ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + badgeRadius);
    ctx.lineTo(badgeX + badgeW, badgeY + badgeH - badgeRadius);
    ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - badgeRadius, badgeY + badgeH);
    ctx.lineTo(badgeX + badgeRadius, badgeY + badgeH);
    ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - badgeRadius);
    ctx.lineTo(badgeX, badgeY + badgeRadius);
    ctx.quadraticCurveTo(badgeX, badgeY, badgeX + badgeRadius, badgeY);
    ctx.closePath();
    ctx.fill();

    ctx.font = `bold 9px ${FF}`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText('APP', badgeX + 5, badgeY + badgeH / 2);
    ctx.textBaseline = 'alphabetic';

    // Timestamp
    const tsText = formatTimestamp(timestamp);
    const timestampX = badgeX + badgeW + 8;
    ctx.font = `12px ${FF}`;
    ctx.fillStyle = '#949ba4';
    ctx.fillText(tsText, timestampX, curY + 15);

    // Message lines
    curY += HEADER_HEIGHT + 4;
    ctx.font = `bold 15px ${FF}`;
    ctx.fillStyle = '#dbdee1';
    for (const line of msgLines) {
      ctx.fillText(line, contentX, curY + 15);
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

    res.json({ image_url: uploadResult.secure_url, success: true });
  } catch (err) {
    console.error('Error generating image:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Discord image generator running on port ' + PORT);
});
