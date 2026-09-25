import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use(
    cors({
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false,
      credentials: true,
    }),
  );

  // Product images are served as static files. A missing file returns 404 so
  // the app can try the next image.
  const productImageDir = path.resolve(__dirname, '..', env.PRODUCT_IMAGE_DIR);
  app.use(
    env.PRODUCT_IMAGE_PUBLIC_PATH,
    express.static(productImageDir, {
      index: false,
      dotfiles: 'ignore',
      fallthrough: true,
      redirect: false,
      maxAge: '1d',
    }),
  );

  app.use('/api', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
