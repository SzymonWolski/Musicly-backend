import swaggerAutogen from 'swagger-autogen';

const host = 'localhost:' + (process.env.PORT || 3000);

const docs = {
  info: {
    title: 'My API',
    description: 'Description',
  },
  host: host,
};

const outputFile = './swagger.json';
const routes = ['./index.ts'];

export const generateSwagger = () => swaggerAutogen()(outputFile, routes, docs);