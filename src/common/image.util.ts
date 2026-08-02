import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

/**
 * Convertit le fichier téléversé en WebP (écrase le fichier final).
 * En cas d'échec (fichier non-image), supprime le fichier et lève une erreur.
 */
export async function convertToWebp(file: Express.Multer.File): Promise<void> {
  const tempPath = `${file.path}.tmp`;
  try {
    await sharp(file.path, { failOn: 'none' })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(tempPath);
    fs.renameSync(tempPath, file.path);
  } catch {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
    throw new BadRequestException('Invalid image file');
  }
}

/**
 * Supprime les anciennes images partageant le même préfixe déterministe
 * (ex. `serviceFile_<id>.`) afin que chaque modification remplace l'image
 * précédente.
 */
export function removePreviousImages(
  destination: string,
  prefix: string,
  keepFilename: string,
): void {
  try {
    const files = fs.readdirSync(destination);
    for (const filename of files) {
      if (filename.startsWith(prefix) && filename !== keepFilename) {
        try {
          fs.unlinkSync(path.join(destination, filename));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}
