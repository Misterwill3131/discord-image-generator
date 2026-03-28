const express = require('express');
const { createCanvas } = require('@napi-rs/canvas');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

app.post('/generate-image', async (req, res) => {
  try {
    const {
      message = 'SPY 1.23-2.13',
      username = 'trader',
      channel = 'trading-signals',
      timestamp = 'Today at 12:00',
    } = req.body;

    const width = 620;
    const lineHeight = 24;
    const paddingTop = 20;
    const paddingLeft = 80;
    const maxTextWidth = width - paddingLeft - 20;

    const tempCanvas = createCanvas(width, 200);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = '16px sans-serif';
    const messageLines = wrapText(tempCtx, message, maxTextWidth);

    const headerHeight = 50;
    const footerHeight = 30;
    const messageHeight = messageLines.length * lineHeight + 10;
    const height = paddingTop + headerHeight + messageHeight + footerHeight + 10;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#313338';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#5865F2';
    ctx.fillRect(0, 0, 4, height);

    const avatarX = 28;
    const avatarY = paddingTop + 12;
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(username[0].toUpperCase(), avatarX, avatarY + 6);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#00AFF4';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(username, paddingLeft, paddingTop + 16);

    const usernameWidth = ctx.measureText(username).width;
    ctx.fillStyle = '#72767d';
    ctx.font = '11px sans-serif';
    ctx.fillText(timestamp, paddingLeft + usernameWidth + 8, paddingTop + 15);

    ctx.fillStyle = '#72767d';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('# ' + channel, width - 12, paddingTop + 15);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#DBDEE1';
    ctx.font = 'bold 18px sans-serif';
    let textY = paddingTop + headerHeight;
    for (const line of messageLines) {
      ctx.fillText(line, paddingLeft, textY);
      textY += lineHeight;
    }

    ctx.strokeStyle = '#3F4147';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, height - footerHeight);
    ctx.lineTo(width - 12, height - footerHeight);
    ctx.stroke();

    ctx.fillStyle = '#5865F2';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Discord', width - 12, height - 10);

    const buffer = await canvas.encode('png');

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'discord-trades', resource_type: 'image', format: 'png' },
        (error, result) => { if (error) reject(error); else resolve(result); }
      ).end(buffer);
    });

    res.json({ success: true, image_url: result.secure_url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
