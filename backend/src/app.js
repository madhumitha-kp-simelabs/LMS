import express from 'express';
import cors from 'cors';
import './lib/json.js'; // BigInt -> JSON support
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './modules/auth/auth.routes.js';
import courseRoutes from './modules/courses/courses.routes.js';
import categoryRoutes from './modules/categories/categories.routes.js';
import feedbackRoutes from './modules/feedback/feedback.routes.js';
import progressRoutes from './modules/progress/progress.routes.js';
import teamRoutes from './modules/teams/teams.routes.js';
import sessionRoutes from './modules/sessions/sessions.routes.js';
import extensionRoutes from './modules/extensions/extensions.routes.js';
import materialRoutes from './modules/materials/materials.routes.js';
import assignmentRoutes from './modules/assignments/assignments.routes.js';
import quizRoutes from './modules/quizzes/quizzes.routes.js';
import learnRoutes from './modules/learn/learn.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import projectRoutes from './modules/projects/projects.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/feedback', feedbackRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/extensions', extensionRoutes);
  app.use('/api/content', materialRoutes);
  app.use('/api/allot', assignmentRoutes);
  app.use('/api/quizzes', quizRoutes);
  app.use('/api/learn', learnRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
