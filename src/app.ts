import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
// import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'url';
import { generateSwagger } from './autogen';
import * as Routes from './routes';

// import authRoutes from './routers/authRoutes';

//swager opcje
generateSwagger();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//swager opcje

const swaggerFilePath = path.join(__dirname, 'swagger.json');

// Read the Swagger JSON file
const swaggerDocument = JSON.parse(fs.readFileSync(swaggerFilePath, 'utf-8'));

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

//logowanie i rejestracja
//app.use('/auth', authRoutes);

// Zabezpieczone trasy
//app.get('/auth', authenticateToken, async (req, res) => {
  //res.json(req.user);
//});

// app.get('/api/users', async (req, res) => {
//   const users = await prisma.user.findMany();
//   const sanitizedUsers = users.map((user) => ({
//     ...user,
//     id: Number(user.id),
//   }));
//   res.json(sanitizedUsers);
// });

// app.get('/hello', (req, res) => {
//   res.json({ message: 'Hello World' });
// });

// app.post('/api/users', async (req, res) => {
//   const { email } = req.body;
//   const user = await prisma.user.create({
//     data: {
//       email,
//     },
//   });
//   res.json(user);
// });

app.use('/auth', Routes.authRoutes);

export default app;