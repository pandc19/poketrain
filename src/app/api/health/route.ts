import { prisma } from '@/lib/db';

/**
 * Readiness for the container health check (see the Dockerfile): 200 once the server is up
 * and the database answers, 503 otherwise. Coolify keeps the previous version serving until
 * this passes on the new one.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'database unavailable' }, { status: 503 });
  }
}
