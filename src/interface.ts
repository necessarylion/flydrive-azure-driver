import { type CommonOptions } from '@azure/storage-blob'

export type AzureStorageDriverConfig = CommonOptions & {
  connectionString?: string
  azureTenantId?: string
  azureClientId?: string
  azureClientSecret?: string
  name?: string
  key?: string
  localAddress?: string
  container?: string
}

export class FileNotFoundException extends Error {
  constructor (message: string, error?: unknown) {
    super(message)
    this.name = 'FileNotFoundException'
    this.cause = error
  }
}

export class CannotGetMetaDataException extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'CannotGetMetaDataException'
  }
}

export class CannotSetMetaDataException extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'CannotGetMetaDataException'
  }
}

export class MethodNotImplementedException extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'MethodNotImplementedException'
  }
}

export class CannotWriteFileException extends Error {
  constructor (message: string, error: unknown) {
    super(message)
    this.name = 'CannotWriteFileException'
    this.cause = error
  }
}

export class CannotCopyFileException extends Error {
  constructor (message: string, error: unknown) {
    super(message)
    this.name = 'CannotCopyFileException'
    this.cause = error
  }
}

export class CannotDeleteFileException extends Error {
  constructor (message: string, error: unknown) {
    super(message)
    this.name = 'CannotDeleteFileException'
    this.cause = error
  }
}

export class CannotMoveFileException extends Error {
  constructor (message: string, error: unknown) {
    super(message)
    this.name = 'CannotMoveFileException'
    this.cause = error
  }
}
