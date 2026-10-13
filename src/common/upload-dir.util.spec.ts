import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getAnnouncementsUploadDir, getUploadRootDir } from './upload-dir.util';

describe('upload-dir.util', () => {
  const originalEnv = { ...process.env };
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-upload-'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('getUploadRootDir', () => {
    it('utilise UPLOAD_DIR_LOCAL (chemin relatif) hors production', () => {
      process.env.NODE_ENV = 'development';
      process.env.UPLOAD_DIR = '/ignored/in/dev-with-local';
      process.env.UPLOAD_DIR_LOCAL = './uploads-custom';
      // Pour un chemin relatif, la résolution se fait par rapport au CWD.
      const expected = path.resolve(process.cwd(), './uploads-custom');
      expect(getUploadRootDir()).toBe(expected);
      expect(fs.existsSync(expected)).toBe(true);
      fs.rmSync(expected, { recursive: true, force: true });
    });

    it('utilise UPLOAD_DIR_LOCAL (chemin absolu) hors production', () => {
      process.env.NODE_ENV = 'development';
      process.env.UPLOAD_DIR = tmpRoot;
      process.env.UPLOAD_DIR_LOCAL = tmpRoot;
      expect(getUploadRootDir()).toBe(path.resolve(tmpRoot));
    });

    it('UPLOAD_DIR_LOCAL est prioritaire sur UPLOAD_DIR hors production', () => {
      process.env.NODE_ENV = 'development';
      process.env.UPLOAD_DIR = '/ignored';
      process.env.UPLOAD_DIR_LOCAL = tmpRoot;
      expect(getUploadRootDir()).toBe(path.resolve(tmpRoot));
    });

    it('ignore UPLOAD_DIR_LOCAL en production', () => {
      process.env.NODE_ENV = 'production';
      process.env.UPLOAD_DIR = tmpRoot;
      process.env.UPLOAD_DIR_LOCAL = '/ignored';
      expect(getUploadRootDir()).toBe(path.resolve(tmpRoot));
    });

    it('normalise un chemin avec trailing slash / espaces', () => {
      process.env.NODE_ENV = 'development';
      process.env.UPLOAD_DIR_LOCAL = `${tmpRoot}/${path.sep}`;
      expect(getUploadRootDir()).toBe(path.resolve(tmpRoot));
    });

    it('lève une erreur explicite si le chemin configuré est inaccessible', () => {
      process.env.NODE_ENV = 'development';
      // Pointe vers un fichier, pas un répertoire : mkdir/access échouent.
      const fileTarget = path.join(tmpRoot, 'not-a-dir');
      fs.writeFileSync(fileTarget, 'x');
      process.env.UPLOAD_DIR_LOCAL = fileTarget;
      expect(() => getUploadRootDir()).toThrow(/UPLOAD_DIR/);
    });
  });

  describe('getAnnouncementsUploadDir', () => {
    it('place les pièces jointes sous la racine configurée', () => {
      process.env.NODE_ENV = 'development';
      process.env.UPLOAD_DIR_LOCAL = tmpRoot;
      expect(getAnnouncementsUploadDir()).toBe(
        path.join(path.resolve(tmpRoot), 'announcements'),
      );
      expect(
        fs.existsSync(path.join(path.resolve(tmpRoot), 'announcements')),
      ).toBe(true);
    });
  });
});
