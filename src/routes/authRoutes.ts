import { Router } from 'express';
import { register } from '../controllers/Register';
import { login, loginValidators } from '../controllers/Login';
import { validate } from '../middleware/validation';

const router = Router();

router.post('/login', loginValidators, validate, login);
router.post('/register', register);

export default router;