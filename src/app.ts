import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { DietCoach } from './agents/diet-coach.ts';

const app = new Hono();

app.route('/agents/diet-coach', createAgentRouter(DietCoach));
app.get('/api/ping', (c) => c.text('pong'));

export default app;
