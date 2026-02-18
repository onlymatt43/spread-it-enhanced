/**
 * Service de conversion vidéo pour adapter les médias aux formats requis
 * Supporte tous les ratios et formats des plateformes sociales
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Convertit un ratio string (ex: "9:16") en objet {width, height}
 */
function parseRatio(ratioString) {
  const [w, h] = ratioString.split(':').map(Number);
  return { width: w, height: h };
}

/**
 * Calcule les dimensions cibles pour un ratio donné
 */
function calculateDimensions(sourceWidth, sourceHeight, targetRatio, maxWidth = 1920) {
  const ratio = parseRatio(targetRatio);
  const aspectRatio = ratio.width / ratio.height;

  let targetWidth, targetHeight;

  // Calculer en fonction de l'aspect ratio
  if (sourceWidth / sourceHeight > aspectRatio) {
    // Vidéo plus large que le ratio cible : crop vertical
    targetHeight = sourceHeight;
    targetWidth = Math.round(targetHeight * aspectRatio);
  } else {
    // Vidéo plus haute : crop horizontal
    targetWidth = sourceWidth;
    targetHeight = Math.round(targetWidth / aspectRatio);
  }

  // Limiter à la résolution max
  if (targetWidth > maxWidth) {
    const scale = maxWidth / targetWidth;
    targetWidth = maxWidth;
    targetHeight = Math.round(targetHeight * scale);
  }

  // S'assurer que les dimensions sont paires (requis par h264)
  targetWidth = Math.floor(targetWidth / 2) * 2;
  targetHeight = Math.floor(targetHeight / 2) * 2;

  return { width: targetWidth, height: targetHeight };
}

/**
 * Obtient les métadonnées d'une vidéo via FFprobe
 */
async function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ];

    const ffprobe = spawn('ffprobe', args);
    let output = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error('FFprobe failed'));
      }

      try {
        const metadata = JSON.parse(output);
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');

        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration: parseFloat(metadata.format.duration),
          size: parseInt(metadata.format.size),
          codec: videoStream.codec_name,
          fps: eval(videoStream.r_frame_rate) // Ex: "30/1" -> 30
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Convertit une vidéo au ratio et format spécifiés
 * 
 * @param {string} inputPath - Chemin de la vidéo source
 * @param {string} outputPath - Chemin de sortie
 * @param {object} options - Options de conversion
 * @param {string} options.ratio - Ratio cible (ex: "9:16", "16:9", "1:1")
 * @param {string} options.codec - Codec vidéo (défaut: h264)
 * @param {number} options.maxWidth - Largeur max (défaut: 1920)
 * @param {boolean} options.crop - Crop ou pad (défaut: crop)
 * @param {string} options.audioCodec - Codec audio (défaut: aac)
 * @param {number} options.maxDuration - Durée max en secondes
 */
async function convertVideo(inputPath, outputPath, options = {}) {
  const {
    ratio = '16:9',
    codec = 'h264',
    maxWidth = 1920,
    crop = true,
    audioCodec = 'aac',
    maxDuration = null
  } = options;

  // Obtenir métadonnées source
  const metadata = await getVideoMetadata(inputPath);
  
  // Calculer dimensions cibles
  const dimensions = calculateDimensions(
    metadata.width,
    metadata.height,
    ratio,
    maxWidth
  );

  // Construire la commande FFmpeg
  const args = [
    '-i', inputPath,
    '-c:v', `lib${codec}`,
    '-preset', 'medium',
    '-crf', '23', // Qualité (18-28, plus bas = meilleure qualité)
    '-c:a', audioCodec,
    '-b:a', '192k'
  ];

  // Appliquer le crop ou scale+pad
  if (crop) {
    // Crop au centre
    const cropX = Math.floor((metadata.width - dimensions.width) / 2);
    const cropY = Math.floor((metadata.height - dimensions.height) / 2);
    
    args.push(
      '-vf', 
      `crop=${dimensions.width}:${dimensions.height}:${cropX}:${cropY},scale=${dimensions.width}:${dimensions.height}`
    );
  } else {
    // Scale et pad (barres noires)
    args.push(
      '-vf',
      `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2`
    );
  }

  // Limiter la durée si spécifié
  if (maxDuration && metadata.duration > maxDuration) {
    args.push('-t', maxDuration.toString());
  }

  // Pixel format pour compatibilité
  args.push('-pix_fmt', 'yuv420p');

  // Overwrite et output
  args.push('-y', outputPath);

  // Exécuter FFmpeg
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    let errorOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg failed: ${errorOutput}`));
      }

      // Vérifier que le fichier existe
      try {
        await fs.access(outputPath);
        const outputMetadata = await getVideoMetadata(outputPath);
        resolve({
          success: true,
          outputPath,
          metadata: outputMetadata
        });
      } catch (e) {
        reject(new Error('Output file not created'));
      }
    });
  });
}

/**
 * Génère un thumbnail à partir d'une vidéo
 */
async function generateThumbnail(videoPath, outputPath, timeOffset = 1) {
  const args = [
    '-i', videoPath,
    '-ss', timeOffset.toString(),
    '-vframes', '1',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease',
    '-y',
    outputPath
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error('Thumbnail generation failed'));
      }

      try {
        await fs.access(outputPath);
        resolve({ success: true, thumbnailPath: outputPath });
      } catch (e) {
        reject(new Error('Thumbnail not created'));
      }
    });
  });
}

/**
 * Convertit une image au ratio spécifié
 */
async function convertImage(inputPath, outputPath, options = {}) {
  const {
    ratio = '1:1',
    maxWidth = 1920,
    format = 'jpg',
    quality = 85
  } = options;

  const sharp = require('sharp');
  const dimensions = parseRatio(ratio);
  const aspectRatio = dimensions.width / dimensions.height;

  // Lire l'image source
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  // Calculer dimensions cibles
  let targetWidth, targetHeight;
  
  if (metadata.width / metadata.height > aspectRatio) {
    targetHeight = Math.min(metadata.height, maxWidth / aspectRatio);
    targetWidth = Math.round(targetHeight * aspectRatio);
  } else {
    targetWidth = Math.min(metadata.width, maxWidth);
    targetHeight = Math.round(targetWidth / aspectRatio);
  }

  // Crop et resize
  await image
    .resize(targetWidth, targetHeight, {
      fit: 'cover',
      position: 'center'
    })
    .toFormat(format, { quality })
    .toFile(outputPath);

  return {
    success: true,
    outputPath,
    width: targetWidth,
    height: targetHeight
  };
}

module.exports = {
  convertVideo,
  convertImage,
  generateThumbnail,
  getVideoMetadata,
  parseRatio,
  calculateDimensions
};
