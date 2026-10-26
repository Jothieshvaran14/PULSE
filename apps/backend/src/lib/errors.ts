/**
 * Custom error classes for RYME.
 *
 * Each error type maps to an HTTP status code and error code string.
 * The global error handler middleware uses these to format responses.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(
      `${resource} with identifier '${identifier}' was not found`,
      404,
      `${resource.toUpperCase().replace(/\s+/g, "_")}_NOT_FOUND`
    );
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class GitError extends AppError {
  constructor(message: string) {
    super(message, 502, "GIT_ERROR");
  }
}

export class DockerError extends AppError {
  constructor(message: string) {
    super(message, 502, "DOCKER_ERROR");
  }
}

export class PortAllocationError extends AppError {
  constructor(message: string) {
    super(message, 503, "PORT_ALLOCATION_ERROR");
  }
}

export class FrameworkDetectionError extends AppError {
  constructor(message: string) {
    super(message, 422, "FRAMEWORK_DETECTION_ERROR");
  }
}

export class BuildTimeoutError extends AppError {
  constructor(deploymentId: string) {
    super(
      `Build timed out for deployment '${deploymentId}'`,
      504,
      "BUILD_TIMEOUT"
    );
  }
}

export class DeploymentInProgressError extends AppError {
  constructor(projectId: string) {
    super(
      `A deployment is already in progress for project '${projectId}'`,
      409,
      "DEPLOYMENT_IN_PROGRESS"
    );
  }
}
