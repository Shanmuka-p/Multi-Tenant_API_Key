import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/apiRoutes';
import { connectRedis } from './config/redis';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// API Routes
app.use('/api', apiRoutes);

const startServer = async () => {
  try {
    await connectRedis();
    console.log('Connected to Redis');
    
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
