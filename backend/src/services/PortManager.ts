/**
 * PortManager.ts
 * Manages the pool of ports (4000-5000) for deployed projects.
 * Uses a SELECT ... FOR UPDATE SKIP LOCKED transaction to prevent
 * concurrent allocation of the same port.
 */

import { getPool } from '../config/database';
import { PortModel } from '../models/PortModel';
import { PortRow } from '../types';
import logger from '../utils/logger';

export class PortManager {
  /**
   * Allocate an available port for a project.
   * Returns the port number on success.
   * Throws if no ports are available.
   */
  static async allocatePort(projectId: string): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const available = await PortModel.findAvailable(client);
      if (!available) {
        await client.query('ROLLBACK');
        throw new Error('No available ports in the pool. All ports are currently allocated.');
      }

      const allocated = await PortModel.allocate(client, available.port_number, projectId);
      await client.query('COMMIT');

      logger.info(`[PortManager] Port ${allocated.port_number} allocated to project ${projectId}`);
      return allocated.port_number;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Release a port, making it available again.
   * Only releases if the port is currently assigned to this project.
   */
  static async releasePort(portNumber: number, projectId?: string): Promise<void> {
    // Verify the port belongs to this project before releasing
    if (projectId) {
      const portRow = await PortModel.findByProject(projectId);
      if (!portRow || portRow.port_number !== portNumber) {
        logger.warn(
          `[PortManager] Port ${portNumber} is not assigned to project ${projectId}, skipping release`
        );
        return;
      }
    }

    await PortModel.release(portNumber);
    logger.info(`[PortManager] Port ${portNumber} released`);
  }

  /**
   * Get port stats for the dashboard.
   */
  static async getStats(): Promise<{ total: number; used: number; available: number }> {
    return PortModel.stats();
  }

  /**
   * Get the port currently assigned to a project.
   */
  static async getProjectPort(projectId: string): Promise<PortRow | null> {
    return PortModel.findByProject(projectId);
  }
}
