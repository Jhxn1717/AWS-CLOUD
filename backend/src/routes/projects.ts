import { Router } from 'express';
import { ProjectController }    from '../controllers/ProjectController';
import { DeploymentController } from '../controllers/DeploymentController';
import { ProcessController }    from '../controllers/ProcessController';
import { authenticate, requireAdmin, requireProjectAccess } from '../middleware/auth';
import { uploadMiddleware }     from '../middleware/upload';
import { asyncHandler }         from '../utils/asyncHandler';

const router = Router();

// All project routes require authentication
router.use(authenticate);

// ── Projects ──────────────────────────────────────────────────────────────────
router.get('/',           asyncHandler(ProjectController.list));
router.post('/',          asyncHandler(ProjectController.create));
router.get('/stats',      requireAdmin, asyncHandler(ProjectController.stats));
router.use('/:id',        asyncHandler(requireProjectAccess));
router.get('/:id',        asyncHandler(ProjectController.get));
router.patch('/:id',      requireAdmin, asyncHandler(ProjectController.update));

// ── Deployments ───────────────────────────────────────────────────────────────
router.post('/:id/deploy/upload',         uploadMiddleware, asyncHandler(DeploymentController.upload));
router.post('/:id/deploy/github',         asyncHandler(DeploymentController.deployFromGithub));
router.get('/:id/deployments',            asyncHandler(DeploymentController.list));
router.get('/:id/deployments/:depId',     asyncHandler(DeploymentController.get));
router.get('/:id/deployments/:depId/logs', asyncHandler(DeploymentController.logs));
router.get('/:id/deployments/:depId/stream', asyncHandler(DeploymentController.streamLogs));
router.get('/:id/logs/stream',            asyncHandler(DeploymentController.streamProjectLogs));

// ── Process lifecycle ─────────────────────────────────────────────────────────
router.post('/:id/start',    requireAdmin, asyncHandler(ProcessController.start));
router.post('/:id/stop',     requireAdmin, asyncHandler(ProcessController.stop));
router.post('/:id/restart',  requireAdmin, asyncHandler(ProcessController.restart));
router.delete('/:id',        requireAdmin, asyncHandler(ProcessController.deleteProject));
router.get('/:id/status',    asyncHandler(ProcessController.status));
router.get('/:id/process/logs', requireAdmin, asyncHandler(ProcessController.processLogs));

export default router;
