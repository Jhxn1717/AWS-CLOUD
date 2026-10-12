import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', asyncHandler(UserController.list));
router.post('/', asyncHandler(UserController.create));

export default router;