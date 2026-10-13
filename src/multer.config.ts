/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as path from 'path';
import { getUploadRootDir } from './common/upload-dir.util';

export const multerConfig = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
      callback(null, filename);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

export const generateFileUrl = (filename: string): string => {
  const baseUrl = process.env.BACK_URL || 'https://app.digikuntz.com';
  return `${baseUrl}/uploads/${filename}`;
};

// Configuration for Multer to handle file uploads
export const multerConfigForUser = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req: any, file, callback) => {
      const userId = req.user._id;
      const fileName = `pictureFile_${userId}.webp`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

// Configuration for Multer to handle file uploads
export const multerConfigForCover = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req: any, file, callback) => {
      const userId = req.user._id;
      const fileName = `coverFile_${userId}.webp`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

// Configuration for Multer to handle file uploads
export const multerConfigForEvent = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req, file, callback) => {
      const fileExt = path.extname(file.originalname);
      const fileName = `eventCoverFile_${req.params.id}${fileExt}`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

// Configuration for Multer to handle service file uploads
export const multerConfigForService = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req, file, callback) => {
      const serviceId = req.params.id;
      const fileName = `serviceFile_${serviceId}.webp`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

// Configuration for Multer to handle plan image uploads
export const multerConfigForPlan = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req, file, callback) => {
      const planId = req.params.id;
      const fileName = `planImage_${planId}.webp`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

// Configuration for Multer to handle gateway image uploads
export const multerConfigForGateway = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const fileName = `gateway_${uniqueSuffix}${ext}`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};

// Configuration for Multer to handle fundraising cover uploads
export const multerConfigForFundraising = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadRootDir()),
    filename: (req, file, callback) => {
      const fundraisingId = req.params.id;
      const fileName = `fundraisingCoverFile_${fundraisingId}.webp`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
  },
};
