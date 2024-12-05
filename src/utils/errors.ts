interface ErrorMetadata {
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class BaseError extends Error {
  public readonly cause?: unknown;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, metadata?: ErrorMetadata) {
    super(message);
    this.name = this.constructor.name;
    this.cause = metadata?.cause;
    this.context = metadata?.context;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super(`Database Error: ${message}`, metadata);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super(`Validation Error: ${message}`, metadata);
  }
}

export class NotFoundError extends BaseError {
  constructor(entity: string, metadata?: ErrorMetadata) {
    super(`${entity} not found`, metadata);
  }
}

export class UniqueConstraintError extends DatabaseError {
  constructor(field: string, metadata?: ErrorMetadata) {
    super(`Unique constraint violation on ${field}`, metadata);
  }
}

export class ForeignKeyError extends DatabaseError {
  constructor(relation: string, metadata?: ErrorMetadata) {
    super(`Foreign key constraint violation on ${relation}`, metadata);
  }
}

export const isQueryError = (error: unknown): boolean => {
  return error instanceof Error && 
    ['DatabaseError', 'UniqueConstraintError', 'ForeignKeyError'].includes(error.name);
};
