import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { PortAllocationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { config } from "../config/index.js";

const MAX_RETRIES = 50;

/**
 * PortAllocator manages host port allocation for deployed containers.
 *
 * Uses the database for atomic port allocation to prevent race conditions.
 * Ports are allocated from a configurable range (default 10000-65000) and
 * tracked in the ports table.
 *
 * Strategy: Find the lowest unused port, attempt to insert. If unique
 * constraint violation (race condition), try the next port. Repeat up
 * to MAX_RETRIES times.
 */
export class PortAllocator {
  private rangeStart: number;
  private rangeEnd: number;

  constructor() {
    this.rangeStart = config.portRangeStart;
    this.rangeEnd = config.portRangeEnd;
  }

  /**
   * Allocates a free port for a deployment.
   *
   * Iteratively tries ports from the lowest available. If a port is
   * already taken (unique constraint), moves to the next one.
   *
   * @param deploymentId - The deployment to allocate the port for
   * @returns The allocated port number
   */
  async allocate(deploymentId: string): Promise<number> {
    logger.debug(
      { deploymentId, range: `${this.rangeStart}-${this.rangeEnd}` },
      "Allocating port"
    );

    // Find all currently allocated ports
    const allocatedPorts = await prisma.port.findMany({
      where: { status: "ALLOCATED" },
      select: { portNumber: true },
    });

    const usedPorts = new Set(allocatedPorts.map((p) => p.portNumber));

    // Find the lowest available port
    let startPort: number | null = null;
    for (let p = this.rangeStart; p <= this.rangeEnd; p++) {
      if (!usedPorts.has(p)) {
        startPort = p;
        break;
      }
    }

    if (startPort === null) {
      throw new PortAllocationError(
        `No ports available in range ${this.rangeStart}-${this.rangeEnd}`
      );
    }

    // Try to allocate starting from the lowest available port
    for (let i = 0; i < MAX_RETRIES; i++) {
      const port = startPort + i;

      if (port > this.rangeEnd) {
        throw new PortAllocationError(
          `No ports available in range ${this.rangeStart}-${this.rangeEnd} after ${i} attempts`
        );
      }

      try {
        await prisma.port.create({
          data: {
            portNumber: port,
            deploymentId,
            status: "ALLOCATED",
          },
        });

        logger.info({ port, deploymentId }, "Allocated port");
        return port;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Unique constraint violation — another deployment grabbed this port
          logger.info(
            { port, deploymentId },
            "Port already taken, retrying..."
          );
          continue;
        }
        throw new PortAllocationError(
          `Failed to allocate port: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    throw new PortAllocationError(
      `No ports available after ${MAX_RETRIES} attempts starting from port ${startPort}`
    );
  }

  /**
   * Releases a port allocated to a deployment.
   */
  async release(deploymentId: string): Promise<void> {
    const ports = await prisma.port.findMany({
      where: {
        deploymentId,
        status: "ALLOCATED",
      },
    });

    for (const port of ports) {
      await prisma.port.update({
        where: { id: port.id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          deploymentId: null,
        },
      });
      logger.info(
        { port: port.portNumber, deploymentId },
        "Released port"
      );
    }
  }
}

export const portAllocator = new PortAllocator();
