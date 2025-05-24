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

app.use('/auth', Routes.authRoutes);
app.use('/files', Routes.fileRoutes);
app.use('/friends', Routes.friendRoutes);
export default app;