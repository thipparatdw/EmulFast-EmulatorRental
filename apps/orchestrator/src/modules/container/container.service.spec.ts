import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { ContainerService } from './container.service';

import type { TestingModule } from '@nestjs/testing';

// ---------------------------------------------------------------------------
// Mock Dockerode
// ---------------------------------------------------------------------------

const mockContainerStop = jest.fn();
const mockContainerRemove = jest.fn();
const mockContainerStart = jest.fn();
const mockContainerInspect = jest.fn();

const mockDockerContainer = {
  id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123',
  stop: mockContainerStop,
  remove: mockContainerRemove,
  start: mockContainerStart,
  inspect: mockContainerInspect,
};

const mockListContainers = jest.fn();
const mockCreateContainer = jest.fn();
const mockGetContainer = jest.fn();

jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    listContainers: mockListContainers,
    createContainer: mockCreateContainer,
    getContainer: mockGetContainer,
  }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildService(portRange = '5555-5655'): Promise<ContainerService> {
  const configGet = jest.fn((key: string) => {
    if (key === 'ADB_PORT_RANGE') return portRange;
    return undefined;
  });

  return Test.createTestingModule({
    providers: [
      ContainerService,
      { provide: ConfigService, useValue: { get: configGet } },
    ],
  })
    .compile()
    .then((module: TestingModule) => {
      const svc = module.get<ContainerService>(ContainerService);
      svc.onModuleInit();
      return svc;
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContainerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing containers
    mockListContainers.mockResolvedValue([]);
    // Default create container returns mock object
    mockCreateContainer.mockResolvedValue(mockDockerContainer);
    mockContainerStart.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // createContainer — happy path
  // -------------------------------------------------------------------------
  describe('createContainer', () => {
    it('returns correct shape for SFAST package', async () => {
      const svc = await buildService();

      const result = await svc.createContainer({
        userId: 'user-abc123456',
        packageCode: 'SFAST',
        expiresAt: '2025-12-31T00:00:00.000Z',
      });

      expect(mockCreateContainer).toHaveBeenCalledTimes(1);
      expect(mockContainerStart).toHaveBeenCalledTimes(1);

      // Verify shape
      expect(result).toMatchObject({
        containerId: mockDockerContainer.id,
        adbPort: 5555,
        websocketPath: `/ws/scrcpy/${mockDockerContainer.id.slice(0, 12)}`,
      });
      expect(result.containerName).toMatch(/^emulfast-emu-/);
    });

    it('allocates next available port when 5555 is in use', async () => {
      mockListContainers.mockResolvedValue([
        { Ports: [{ PublicPort: 5555 }] },
      ]);

      const svc = await buildService();
      const result = await svc.createContainer({
        userId: 'user-xyz789',
        packageCode: 'MFAST',
        expiresAt: '2025-12-31T00:00:00.000Z',
      });

      expect(result.adbPort).toBe(5556);
    });

    it('passes correct memory/cpu for SFAST', async () => {
      const svc = await buildService();
      await svc.createContainer({
        userId: 'user-abc123',
        packageCode: 'SFAST',
        expiresAt: '2025-12-31T00:00:00.000Z',
      });

      const createCall = mockCreateContainer.mock.calls[0][0] as {
        HostConfig: { Memory: number; NanoCpus: number };
      };
      expect(createCall.HostConfig.Memory).toBe(3 * 1024 * 1024 * 1024);
      expect(createCall.HostConfig.NanoCpus).toBe(3e9);
    });

    it('throws BAD_REQUEST for unknown packageCode', async () => {
      const svc = await buildService();
      await expect(
        svc.createContainer({
          userId: 'user-abc123',
          packageCode: 'UNKNOWN' as 'SFAST',
          expiresAt: '2025-12-31T00:00:00.000Z',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST }),
      );
    });

    it('throws SERVICE_UNAVAILABLE when all ports exhausted', async () => {
      // Fill up a tiny range
      const svc = await buildService('5555-5555');
      mockListContainers.mockResolvedValue([
        { Ports: [{ PublicPort: 5555 }] },
      ]);

      await expect(
        svc.createContainer({
          userId: 'user-abc123',
          packageCode: 'SFAST',
          expiresAt: '2025-12-31T00:00:00.000Z',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.SERVICE_UNAVAILABLE }),
      );
    });

    it('wraps dockerode error as INTERNAL_SERVER_ERROR', async () => {
      mockCreateContainer.mockRejectedValue(new Error('docker daemon error'));

      const svc = await buildService();
      await expect(
        svc.createContainer({
          userId: 'user-abc123',
          packageCode: 'SFAST',
          expiresAt: '2025-12-31T00:00:00.000Z',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.INTERNAL_SERVER_ERROR }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // deleteContainer
  // -------------------------------------------------------------------------
  describe('deleteContainer', () => {
    it('calls stop then remove', async () => {
      mockGetContainer.mockReturnValue(mockDockerContainer);
      mockContainerStop.mockResolvedValue(undefined);
      mockContainerRemove.mockResolvedValue(undefined);

      const svc = await buildService();
      await svc.deleteContainer('abc123');

      expect(mockContainerStop).toHaveBeenCalledTimes(1);
      expect(mockContainerRemove).toHaveBeenCalledWith({ v: true, force: true });
    });

    it('ignores 304 (already stopped) during stop', async () => {
      mockGetContainer.mockReturnValue(mockDockerContainer);
      mockContainerStop.mockRejectedValue({ statusCode: 304 });
      mockContainerRemove.mockResolvedValue(undefined);

      const svc = await buildService();
      await expect(svc.deleteContainer('abc123')).resolves.toBeUndefined();
      expect(mockContainerRemove).toHaveBeenCalledTimes(1);
    });

    it('treats 404 during remove as success (already gone)', async () => {
      mockGetContainer.mockReturnValue(mockDockerContainer);
      mockContainerStop.mockResolvedValue(undefined);
      mockContainerRemove.mockRejectedValue({ statusCode: 404 });

      const svc = await buildService();
      // remove throws 404 — should not propagate
      // Note: current impl uses force:true so dockerode won't 404 on remove,
      // but we verify the outer 404 catch also works
      await expect(svc.deleteContainer('abc123')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getContainer
  // -------------------------------------------------------------------------
  describe('getContainer', () => {
    it('maps inspect output to ContainerInfo correctly', async () => {
      const fakeInspect = {
        Id: 'fullid123',
        Name: '/emulfast-emu-abc-def',
        State: { Status: 'running', Running: true },
        Config: { Image: 'redroid/redroid:10.0.0_latest' },
        Created: '2024-01-01T00:00:00.000Z',
      };
      mockGetContainer.mockReturnValue({ inspect: async () => fakeInspect });

      const svc = await buildService();
      const result = await svc.getContainer('fullid123');

      expect(result).toEqual({
        id: 'fullid123',
        name: 'emulfast-emu-abc-def',
        status: 'running',
        state: 'running',
        image: 'redroid/redroid:10.0.0_latest',
        created: new Date('2024-01-01T00:00:00.000Z').getTime(),
      });
    });

    it('throws NOT_FOUND for 404 from dockerode', async () => {
      mockGetContainer.mockReturnValue({
        inspect: async () => {
          throw { statusCode: 404, message: 'No such container' };
        },
      });

      const svc = await buildService();
      await expect(svc.getContainer('nonexistent')).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.NOT_FOUND }),
      );
    });

    it('throws INTERNAL_SERVER_ERROR for other dockerode errors', async () => {
      mockGetContainer.mockReturnValue({
        inspect: async () => {
          throw new Error('connection refused');
        },
      });

      const svc = await buildService();
      await expect(svc.getContainer('someid')).rejects.toThrow(HttpException);
    });
  });
});
