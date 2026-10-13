/**
 * Utilitaire central des répertoires d'upload.
 *
 * Le répertoire racine des fichiers uploadés (images utilisateurs, services,
 * plans, gateways, fundraising, pièces jointes d'annonces…) est configurable
 * via le fichier d'environnement :
 *
 *   - `UPLOAD_DIR`       : chemin utilisé en production. Un chemin ABSOLU est
 *                          recommandé pour persister hors du dossier de
 *                          déploiement (survit aux redéploiements).
 *   - `UPLOAD_DIR_LOCAL` : chemin utilisé hors production (prioritaire sur
 *                          `UPLOAD_DIR` lorsque NODE_ENV n'est ni `production`
 *                          ni `prod`).
 *
 * Le chemin peut être absolu ou relatif au répertoire de travail
 * (`process.cwd()`). En l'absence de configuration, le comportement
 * historique est conservé à l'identique.
 *
 * NB : le chargement anticipé du `.env` (import 'dotenv/config' en tête de
 * main.ts) est requis pour que ces lectures de `process.env` soient
 * effectives dès l'évaluation des modules (destinations multer incluses).
 */
import * as fs from 'fs';
import * as path from 'path';

function isProductionEnv(): boolean {
  return ['production', 'prod'].includes(
    String(process.env.NODE_ENV || '').toLowerCase(),
  );
}

/** Valeur configurée dans l'environnement, ou undefined si absente. */
function configuredUploadDir(): string | undefined {
  if (isProductionEnv()) return process.env.UPLOAD_DIR;
  return process.env.UPLOAD_DIR_LOCAL || process.env.UPLOAD_DIR;
}

function ensureDir(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Racine du répertoire d'upload (images).
 *
 * Priorité (identique au projet seed) :
 *  1. `UPLOAD_DIR` (production) / `UPLOAD_DIR_LOCAL` (hors production) si défini.
 *     → on tente de créer le répertoire ; en cas d'échec (permissions, parent manquant…)
 *       on bascule silencieusement vers la cascade historique.
 *  2. Comportement historique (cascade de chemins prod/dev).
 *
 * Le répertoire est créé automatiquement s'il n'existe pas.
 */
export function getUploadRootDir(): string {
  const configured = configuredUploadDir();
  if (configured) {
    const root = path.resolve(process.cwd(), configured);
    if (ensureDir(root)) {
      return root;
    }
    // Échec silencieux → on bascule vers la cascade historique (comportement seed)
  }

  const isProd = isProductionEnv();
  const cwd = process.cwd();
  const candidates = isProd
    ? [
        '/app/assets/images',
        path.join(cwd, 'public', 'assets', 'images'),
        path.join(cwd, 'assets', 'images'),
      ]
    : [
        path.join(cwd, 'public', 'assets', 'images'),
        path.join(cwd, 'assets', 'images'),
        '/app/assets/images',
      ];

  for (const candidate of candidates) {
    if (ensureDir(candidate)) return candidate;
  }
  const fallback = path.join(cwd, 'public', 'assets', 'images');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

/**
 * Racine des pièces jointes d'annonces.
 *
 *  - Si `UPLOAD_DIR` / `UPLOAD_DIR_LOCAL` est configuré → `<racine>/announcements`
 *  - Sinon → `<cwd>/public/uploads/announcements` (comportement historique).
 *
 * Le répertoire est créé automatiquement s'il n'existe pas.
 */
export function getAnnouncementsUploadDir(): string {
  const configured = configuredUploadDir();
  const dir = configured
    ? path.join(getUploadRootDir(), 'announcements')
    : path.join(process.cwd(), 'public', 'uploads', 'announcements');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Mappings à exposer en statique via `app.useStaticAssets`.
 *
 * Préserve les prefixes publics historiques (`/uploads`, `/assets/images`)
 * afin de ne pas casser les URLs déjà stockées en base de données, quel que
 * soit le répertoire physique configuré.
 */
export function getStaticAssetsMappings(): Array<{
  prefix: string;
  root: string;
}> {
  const uploadRoot = getUploadRootDir();
  const mappings: Array<{ prefix: string; root: string }> = [
    // Pièces jointes d'annonces /uploads/announcements/<file>
    { prefix: '/uploads/announcements', root: getAnnouncementsUploadDir() },
    // Images uploadées : /uploads/<file>
    { prefix: '/uploads', root: uploadRoot },
    // Rétro-compat devant /assets : /assets/images/<file>
    { prefix: '/assets/images', root: uploadRoot },
  ];

  // Rétro-compat : anciennes pièces jointes d'annonces déjà stockées, si le
  // répertoire historique existe et que la racine d'upload est configurée sur
  // un autre emplacement.
  if (configuredUploadDir()) {
    const legacyAnnouncements = path.join(
      process.cwd(),
      'public',
      'uploads',
      'announcements',
    );
    if (fs.existsSync(legacyAnnouncements)) {
      mappings.push({
        prefix: '/uploads/announcements',
        root: legacyAnnouncements,
      });
    }
  }

  // Rétro-compat : dossiers assets historiques (cas de fichiers stockés hors
  // du sous-dossier images/).
  const legacyAssetsPaths = [
    path.join(process.cwd(), 'public', 'assets'),
    path.join(process.cwd(), 'assets'),
    '/app/assets',
  ];
  for (const legacy of legacyAssetsPaths) {
    if (
      fs.existsSync(legacy) &&
      !mappings.some((m) => m.prefix === '/assets' && m.root === legacy)
    ) {
      mappings.push({ prefix: '/assets', root: legacy });
    }
  }

  return mappings;
}
