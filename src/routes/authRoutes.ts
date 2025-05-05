import { Router } from 'express';
import {register, } from '../controllers/Register';

const router = Router();

//router.post('/login', login);
router.post('/register', register);

export default router;