import { Router } from 'express';
import {register } from '../controllers/Register';
import {login } from '../controllers/Login';

const router = Router();

router.post('/login', login);
router.post('/register', register);

export default router;