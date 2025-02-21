import { type Readable } from 'node:stream'
import { type DriveFile, type DriveDirectory } from 'flydrive'
import type {
  WriteOptions,
  DriverContract,
  ObjectMetaData,
  ObjectVisibility,
  SignedURLOptions
} from 'flydrive/types'
import { type BlobDownloadToBufferOptions, type BlobExistsOptions, BlobSASPermissions, type BlobSASSignatureValues, BlobServiceClient, type BlockBlobClient, type BlockBlobUploadOptions, generateBlobSASQueryParameters, newPipeline, StorageSharedKeyCredential } from '@azure/storage-blob'
import { type AzureStorageDriverConfig, CannotCopyFileException, CannotDeleteFileException, CannotGetMetaDataException, CannotMoveFileException, CannotSetMetaDataException, CannotWriteFileException, FileNotFoundException, MethodNotImplementedException } from './types.js'
import { DefaultAzureCredential } from '@azure/identity'
import { buffer } from 'node:stream/consumers'


export class AzureDriver implements DriverContract {
  /**
   * Reference to the Azure storage instance
   */
  public adapter: BlobServiceClient

  /**
   * Constructor
   * @param {AzureStorageDriverConfig} config - The configuration for the Azure storage driver
   */
  constructor (private readonly config: AzureStorageDriverConfig) {
    if (typeof config.connectionString !== 'undefined') {
      // eslint-disable-next-line
      this.adapter = BlobServiceClient.fromConnectionString(
        config.connectionString
      )
    } else {
      // eslint-disable-next-line no-undef-init
      let credential: StorageSharedKeyCredential | DefaultAzureCredential | undefined = undefined
      if (config.azureTenantId && config.azureClientId && config.azureClientSecret) {
        credential = new DefaultAzureCredential()
      } else if (config.name && config.key) {
        credential = new StorageSharedKeyCredential(config.name, config.key)
      }

      let url = `https://${this.config.name}.blob.core.windows.net`

      if (typeof this.config.localAddress !== 'undefined') {
        url = this.config.localAddress
      }

      const azurePipeline = newPipeline(credential)

      this.adapter = new BlobServiceClient(url, azurePipeline)
    }
  }

  private getBlockBlobClient (location: string): BlockBlobClient {
    const container = this.config.container
    if (!container) throw new Error('Container is not set')
    const containerClient = this.adapter.getContainerClient(container)
    return containerClient.getBlockBlobClient(location)
  }

  /**
   * Return a boolean value indicating if the file exists
   * or not.
   */
  async exists (key: string, optoins?: BlobExistsOptions): Promise<boolean> {
    try {
      return await this.getBlockBlobClient(key).exists(optoins)
    } catch (error) {
      return false
    }
  }

  /**
   * Return the file contents as a UTF-8 string. Throw an exception
   * if the file is missing.
   */
  async get (key: string, options?: BlobDownloadToBufferOptions): Promise<string> {
    try {
      const blockBlobClient = this.getBlockBlobClient(key)
      const res = await blockBlobClient.downloadToBuffer(0, 0, options)
      return res.toString('utf-8')
    } catch (error) {
      throw new FileNotFoundException(key, error)
    }
  }

  /**
   * Return the file contents as a Readable stream. Throw an exception
   * if the file is missing.
   */
  async getStream (key: string, options?: BlobDownloadToBufferOptions): Promise<Readable> {
    try {
      const res = await this.getBlockBlobClient(key).download(0, 0, options)
      return res.readableStreamBody as Readable
    } catch (error) {
      throw new FileNotFoundException(key, error)
    }
  }

  /**
   * Return the file contents as a Uint8Array. Throw an exception
   * if the file is missing.
   */
  async getBytes (key: string, options?: BlobDownloadToBufferOptions): Promise<Uint8Array> {
    try {
      const res = await this.getBlockBlobClient(key).download(0, 0, options)
      if (!res.readableStreamBody) throw new FileNotFoundException(key)
      const buf = await buffer(res.readableStreamBody)
      return new Uint8Array(buf)
    } catch (error) {
      throw new FileNotFoundException(key, error)
    }
  }

  /**
   * Return metadata of the file. Throw an exception
   * if the file is missing.
   */
  async getMetaData (key: string): Promise<ObjectMetaData> {
    try {
      const blockBlobClient = this.getBlockBlobClient(key)
      const metaData = await blockBlobClient.getProperties()
      return {
        contentType: metaData.contentType,
        contentLength: metaData.contentLength ?? 0,
        etag: metaData.etag ?? '',
        lastModified: metaData.lastModified ?? new Date()
      }
    } catch (error) {
      throw new FileNotFoundException(key, error)
    }
  }

  /**
   * Return visibility of the file. Infer visibility from the initial
   * config, when the driver does not support the concept of visibility.
   */
  async getVisibility (key: string): Promise<ObjectVisibility> {
    throw new CannotGetMetaDataException('Visibility not supported')
  }

  /**
   * Return the public URL of the file. Throw an exception when the driver
   * does not support generating URLs.
   */
  async getUrl (key: string): Promise<string> {
    return this.getBlockBlobClient(key).url
  }

  /**
   * Return the signed URL to serve a private file. Throw exception
   * when the driver does not support generating URLs.
   */
  async getSignedUrl (key: string, options?: SignedURLOptions): Promise<string> {
    const blockBlobClient = this.getBlockBlobClient(key)
    if (!this.config.container) throw new Error('Container is not set')
    const SASUrl = await this.generateBlobSASURL(blockBlobClient, {
      containerName: this.config.container,
      ...options
    })
    return SASUrl
  }

  /**
   * Generate a signed URL for a blob.
   * @param blockBlobClient - The block blob client to generate the URL for.
   * @param options - The options for the signed URL.
   * @returns The signed URL.
   */
  private async generateBlobSASURL (
    blockBlobClient: BlockBlobClient,
    options: BlobSASSignatureValues
  ): Promise<string> {
    options.permissions =
      options.permissions === undefined || typeof options.permissions === 'string'
        ? BlobSASPermissions.parse(options.permissions ?? 'r')
        : options.permissions

    options.startsOn = options.startsOn ?? new Date()
    options.expiresOn = options.expiresOn ?? new Date(options.startsOn.valueOf() + 3600 * 1000)

    const blobSAS = generateBlobSASQueryParameters(
      {
        containerName: blockBlobClient.containerName, // Required
        blobName: blockBlobClient.name, // Required
        permissions: options.permissions, // Required
        startsOn: options.startsOn,
        expiresOn: options.expiresOn
      },
      blockBlobClient.credential as StorageSharedKeyCredential
    )

    return `${blockBlobClient.url}?${blobSAS.toString()}`
  }

  /**
   * Update the visibility of the file. Result in a NOOP
   * when the driver does not support the concept of
   * visibility.
   */
  async setVisibility (key: string, visibility: ObjectVisibility): Promise<void> {
    throw new CannotSetMetaDataException('Visibility not supported')
  }

  /**
   * Create a new file or update an existing file. The contents
   * will be a UTF-8 string or "Uint8Array".
   */
  async put (key: string, contents: string | Uint8Array, options?: BlockBlobUploadOptions): Promise<void> {
    const blockBlobClient = this.getBlockBlobClient(key)
    try {
      await blockBlobClient.upload(contents, contents.length, options)
    } catch (error) {
      throw new CannotWriteFileException(key, error)
    }
  }

  /**
   * Create a new file or update an existing file. The contents
   * will be a Readable stream.
   */
  async putStream (key: string, contents: Readable, options?: BlockBlobUploadOptions): Promise<void> {
    const blockBlobClient = this.getBlockBlobClient(key)
    try {
      await blockBlobClient.uploadStream(contents, undefined, undefined, options)
    } catch (error) {
      throw new CannotWriteFileException(key, error)
    }
  }

  /**
   * Copy the existing file to the destination. Make sure the new file
   * has the same visibility as the existing file. It might require
   * manually fetching the visibility of the "source" file.
   */
  async copy (source: string, destination: string, options?: WriteOptions): Promise<void> {
    if (!this.config.container) throw new Error('Container is not set')
    const sourceBlockBlobClient = this.getBlockBlobClient(source)
    const destinationBlockBlobClient = this.getBlockBlobClient(destination)
    const url = await this.generateBlobSASURL(sourceBlockBlobClient, {
      containerName: this.config.container,
      ...options
    })
    try {
      await destinationBlockBlobClient.syncCopyFromURL(url)
    } catch (error) {
      throw new CannotCopyFileException(source, error)
    }
  }

  /**
   * Move the existing file to the destination. Make sure the new file
   * has the same visibility as the existing file. It might require
   * manually fetching the visibility of the "source" file.
   */
  async move (source: string, destination: string, options?: WriteOptions): Promise<void> {
    try {
      await this.copy(source, destination, options)
      await this.delete(source)
    } catch (error) {
      throw new CannotMoveFileException(source, error)
    }
  }

  /**
   * Delete an existing file. Do not throw an error if the
   * file is already missing
   */
  async delete (key: string): Promise<void> {
    try {
      await this.getBlockBlobClient(key).delete()
    } catch (error) {
      throw new CannotDeleteFileException(key, error)
    }
  }

  /**
   * Delete all files inside a folder. Do not throw an error
   * if the folder does not exist or is empty.
   */
  async deleteAll (prefix: string): Promise<void> {
    throw new MethodNotImplementedException('deleteAll')
  }

  /**
   * List all files from a given folder or the root of the storage.
   * Do not throw an error if the request folder does not exist.
   */
  async listAll (
    prefix: string,
    options?: {
      recursive?: boolean
      paginationToken?: string
    }
  ): Promise<{
      paginationToken?: string
      objects: Iterable<DriveFile | DriveDirectory>
    }> {
    throw new MethodNotImplementedException('listAll')
  }
}

// for adonisjs v6
export function AzureService (config: AzureStorageDriverConfig): {
  type: 'provider'
  resolver: () => Promise<() => AzureDriver>
} {
  return {
    type: 'provider',
    resolver: async () => {
      return () => new AzureDriver(config)
    }
  }
}

export {
  type AzureStorageDriverConfig, CannotCopyFileException, CannotDeleteFileException, CannotGetMetaDataException, CannotMoveFileException, CannotSetMetaDataException, CannotWriteFileException, FileNotFoundException, MethodNotImplementedException
}
