import { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { Disk, type DriveFile, type DriveDirectory } from 'flydrive'
import {
  AzureDriver,
  AzureService,
  CannotCopyFileException,
  CannotDeleteFileException,
  CannotMoveFileException,
  CannotWriteFileException,
  FileNotFoundException
} from '../src/index.js'
import { text } from 'node:stream/consumers'
import { describe, it, expect, afterAll } from 'vitest'

import { config } from 'dotenv';
config();

const PREFIX = '_test_azure_drive_'

const AZURE_BLOB_STORAGE_CONTAINER = process.env.AZURE_BLOB_STORAGE_CONTAINER
const AZURE_BLOB_STORAGE_CONN_STRING = process.env.AZURE_BLOB_STORAGE_CONN_STRING

const driver = new AzureDriver({
  connectionString: AZURE_BLOB_STORAGE_CONN_STRING,
  container: AZURE_BLOB_STORAGE_CONTAINER
})

afterAll(async () => {
  // cleanup all test files
  try { await driver.deleteAll(PREFIX) } catch {}
})

describe('Azure file storage driver', () => {
  it('exists', async () => {
    const res = await driver.exists(`${PREFIX}/not-existing.txt`)
    expect(res).toBe(false)
  })

  it('put|exists|delete', async () => {
    await driver.put(`${PREFIX}/test.txt`, 'Hello, world!')
    const res = await driver.exists(`${PREFIX}/test.txt`)
    expect(res).toBe(true)

    await driver.delete(`${PREFIX}/test.txt`)
    const res2 = await driver.exists(`${PREFIX}/test.txt`)
    expect(res2).toBe(false)
  })

  it('putStream|exists|delete', async () => {
    await driver.putStream(`${PREFIX}/test2.txt`, Readable.from('hello world'))
    const res = await driver.exists(`${PREFIX}/test2.txt`)
    expect(res).toBe(true)

    await driver.delete(`${PREFIX}/test2.txt`)
    const res2 = await driver.exists(`${PREFIX}/test2.txt`)
    expect(res2).toBe(false)
  })

  it('get', async () => {
    await driver.putStream(`${PREFIX}/test2.txt`, Readable.from('hello world'))
    const res = await driver.get(`${PREFIX}/test2.txt`)
    expect(res).toBe('hello world')

    await driver.delete(`${PREFIX}/test2.txt`)
    const res2 = await driver.exists(`${PREFIX}/test2.txt`)
    expect(res2).toBe(false)
  })

  it('getStream', async () => {
    await driver.putStream(`${PREFIX}/test2.txt`, Readable.from('hello world'))
    const res = await driver.getStream(`${PREFIX}/test2.txt`)
    expect(await text(res)).toBe('hello world')

    await driver.delete(`${PREFIX}/test2.txt`)
    const res2 = await driver.exists(`${PREFIX}/test2.txt`)
    expect(res2).toBe(false)
  })

  it('getBytes', async () => {
    await driver.putStream(`${PREFIX}/test.txt`, Readable.from('hello world'))
    const res = await driver.getBytes(`${PREFIX}/test.txt`)
    expect(new TextDecoder().decode(res)).toBe('hello world')

    await driver.delete(`${PREFIX}/test.txt`)
    const res2 = await driver.exists(`${PREFIX}/test.txt`)
    expect(res2).toBe(false)
  })

  it('getStream (range)', async () => {
    await driver.put(`${PREFIX}/range.txt`, 'hello world')
    const res = await driver.getStream(`${PREFIX}/range.txt`, { range: { start: 6, end: 10 } })
    expect(await text(res)).toBe('world')

    const res2 = await driver.getStream(`${PREFIX}/range.txt`, { range: { start: 6 } })
    expect(await text(res2)).toBe('world')

    await driver.delete(`${PREFIX}/range.txt`)
  })

  it('getBytes (range)', async () => {
    await driver.put(`${PREFIX}/range.txt`, 'hello world')
    const res = await driver.getBytes(`${PREFIX}/range.txt`, { range: { end: 4 } })
    expect(new TextDecoder().decode(res)).toBe('hello')

    await expect(driver.getBytes(`${PREFIX}/range.txt`, { range: { start: 5, end: 2 } }))
      .rejects.toThrow()

    await driver.delete(`${PREFIX}/range.txt`)
  })

  it('copy|move (destinationBucket)', async () => {
    await driver.put(`${PREFIX}/copy.txt`, 'copy me')
    await driver.copy(`${PREFIX}/copy.txt`, `${PREFIX}/copied.txt`)
    expect(await driver.get(`${PREFIX}/copied.txt`)).toBe('copy me')

    await driver.move(`${PREFIX}/copied.txt`, `${PREFIX}/moved.txt`, {
      destinationBucket: AZURE_BLOB_STORAGE_CONTAINER
    })
    expect(await driver.exists(`${PREFIX}/copied.txt`)).toBe(false)
    expect(await driver.get(`${PREFIX}/moved.txt`)).toBe('copy me')
  })

  it('getSignedUrl', async () => {
    await driver.putStream(`${PREFIX}/test.txt`, Readable.from('hello world'))
    const url = await driver.getSignedUrl(`${PREFIX}/test.txt`)
    expect(typeof url).toBe('string')

    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')

    await driver.delete(`${PREFIX}/test.txt`)
    const res2 = await driver.exists(`${PREFIX}/test.txt`)
    expect(res2).toBe(false)
  })

  it('getMetaData', async () => {
    await driver.putStream(`${PREFIX}/test.txt`, Readable.from('hello world'), {
      blobHTTPHeaders: {
        blobContentType: 'text/plain'
      }
    })
    const res = await driver.getMetaData(`${PREFIX}/test.txt`)
    expect(res.contentType).toBe('text/plain')
    expect(res.contentLength).toBe(11)

    await driver.delete(`${PREFIX}/test.txt`)
    const res2 = await driver.exists(`${PREFIX}/test.txt`)
    expect(res2).toBe(false)
  })

  it('getSignedUploadUrl', async () => {
    const url = await driver.getSignedUploadUrl(`${PREFIX}/upload-test.txt`)
    expect(typeof url).toBe('string')

    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob' },
      body: 'uploaded via signed url'
    })
    expect(res.status).toBe(201)

    const content = await driver.get(`${PREFIX}/upload-test.txt`)
    expect(content).toBe('uploaded via signed url')

    await driver.delete(`${PREFIX}/upload-test.txt`)
  })

  it('listAll (non-recursive)', async () => {
    await driver.put(`${PREFIX}/list/file1.txt`, 'content1')
    await driver.put(`${PREFIX}/list/file2.txt`, 'content2')
    await driver.put(`${PREFIX}/list/sub/file3.txt`, 'content3')

    const result = await driver.listAll(`${PREFIX}/list`)
    const objects = [...result.objects]

    const fileKeys = objects.filter(o => o.isFile).map(o => (o as any).key)
    const dirPrefixes = objects.filter(o => o.isDirectory).map(o => (o as any).prefix)

    expect(fileKeys).toContain(`${PREFIX}/list/file1.txt`)
    expect(fileKeys).toContain(`${PREFIX}/list/file2.txt`)
    expect(fileKeys).not.toContain(`${PREFIX}/list/sub/file3.txt`)
    expect(dirPrefixes).toContain(`${PREFIX}/list/sub`)
  })

  it('listAll (recursive)', async () => {
    await driver.put(`${PREFIX}/list2/file1.txt`, 'content1')
    await driver.put(`${PREFIX}/list2/sub/file2.txt`, 'content2')

    const result = await driver.listAll(`${PREFIX}/list2`, { recursive: true })
    const objects = [...result.objects]

    const fileKeys = objects.filter(o => o.isFile).map(o => (o as any).key)

    expect(fileKeys).toContain(`${PREFIX}/list2/file1.txt`)
    expect(fileKeys).toContain(`${PREFIX}/list2/sub/file2.txt`)
  })

  it('deleteAll', async () => {
    await driver.put(`${PREFIX}/del/a.txt`, 'a')
    await driver.put(`${PREFIX}/del/b.txt`, 'b')
    await driver.put(`${PREFIX}/del/sub/c.txt`, 'c')

    await driver.deleteAll(`${PREFIX}/del`)

    expect(await driver.exists(`${PREFIX}/del/a.txt`)).toBe(false)
    expect(await driver.exists(`${PREFIX}/del/b.txt`)).toBe(false)
    expect(await driver.exists(`${PREFIX}/del/sub/c.txt`)).toBe(false)
  })
})

describe('Azure file storage driver (more cases)', { timeout: 15000 }, () => {
  it('put (Uint8Array) | getBytes', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    await driver.put(`${PREFIX}/bytes.bin`, bytes)
    expect(await driver.getBytes(`${PREFIX}/bytes.bin`)).toEqual(bytes)
    await driver.delete(`${PREFIX}/bytes.bin`)
  })

  it('put (multi-byte string)', async () => {
    await driver.put(`${PREFIX}/utf8.txt`, 'héllo 世界')
    expect(await driver.get(`${PREFIX}/utf8.txt`)).toBe('héllo 世界')
    await driver.delete(`${PREFIX}/utf8.txt`)
  })

  it('put overwrites an existing file', async () => {
    await driver.put(`${PREFIX}/over.txt`, 'first')
    await driver.put(`${PREFIX}/over.txt`, 'second')
    expect(await driver.get(`${PREFIX}/over.txt`)).toBe('second')
    await driver.delete(`${PREFIX}/over.txt`)
  })

  it('putBlock|commitBlockList', async () => {
    const id1 = Buffer.from('00001').toString('base64')
    const id2 = Buffer.from('00002').toString('base64')
    await driver.putBlock(`${PREFIX}/blocks.txt`, id1, 'hello ', 6)
    await driver.putBlock(`${PREFIX}/blocks.txt`, id2, 'world', 5)

    // staged blocks are not visible until they are committed
    expect(await driver.exists(`${PREFIX}/blocks.txt`)).toBe(false)

    await driver.commitBlockList(`${PREFIX}/blocks.txt`, [id1, id2], {
      blobHTTPHeaders: { blobContentType: 'text/plain' }
    })
    expect(await driver.get(`${PREFIX}/blocks.txt`)).toBe('hello world')
    expect((await driver.getMetaData(`${PREFIX}/blocks.txt`)).contentType).toBe('text/plain')
    await driver.delete(`${PREFIX}/blocks.txt`)
  })

  it('commitBlockList fails for an unknown block id', async () => {
    const id = Buffer.from('99999').toString('base64')
    await expect(driver.commitBlockList(`${PREFIX}/no-blocks.txt`, [id]))
      .rejects.toBeInstanceOf(CannotWriteFileException)
  })

  it('getMetaData returns etag and lastModified', async () => {
    await driver.put(`${PREFIX}/meta.txt`, 'abc')
    const meta = await driver.getMetaData(`${PREFIX}/meta.txt`)
    expect(meta.contentLength).toBe(3)
    expect(meta.etag).not.toBe('')
    expect(meta.lastModified).toBeInstanceOf(Date)
    await driver.delete(`${PREFIX}/meta.txt`)
  })

  it('missing file throws FileNotFoundException', async () => {
    const key = `${PREFIX}/missing.txt`
    await expect(driver.get(key)).rejects.toBeInstanceOf(FileNotFoundException)
    await expect(driver.getStream(key)).rejects.toBeInstanceOf(FileNotFoundException)
    await expect(driver.getBytes(key)).rejects.toBeInstanceOf(FileNotFoundException)
    await expect(driver.getMetaData(key)).rejects.toBeInstanceOf(FileNotFoundException)
  })

  it('copy|move a missing file throws', async () => {
    await expect(driver.copy(`${PREFIX}/missing.txt`, `${PREFIX}/x.txt`))
      .rejects.toBeInstanceOf(CannotCopyFileException)
    await expect(driver.move(`${PREFIX}/missing.txt`, `${PREFIX}/x.txt`))
      .rejects.toBeInstanceOf(CannotMoveFileException)
  })

  it('delete a missing file throws CannotDeleteFileException', async () => {
    await expect(driver.delete(`${PREFIX}/missing.txt`))
      .rejects.toBeInstanceOf(CannotDeleteFileException)
  })

  it('deleteAll on a missing folder does not throw', async () => {
    await expect(driver.deleteAll(`${PREFIX}/no-such-folder`)).resolves.toBeUndefined()
  })

  it('listAll on a missing folder returns nothing', async () => {
    const result = await driver.listAll(`${PREFIX}/no-such-folder/`)
    expect([...result.objects]).toEqual([])
    expect(result.paginationToken).toBeFalsy()
  })

  it('listAll returns file metadata', async () => {
    await driver.put(`${PREFIX}/list3/a.txt`, 'abcd', {
      blobHTTPHeaders: { blobContentType: 'text/plain' }
    })
    const result = await driver.listAll(`${PREFIX}/list3/`)
    const file = [...result.objects].find(o => o.isFile) as DriveFile
    expect(file.key).toBe(`${PREFIX}/list3/a.txt`)
    const meta = await file.getMetaData()
    expect(meta.contentLength).toBe(4)
    expect(meta.contentType).toBe('text/plain')
  })

  it('listAll (root) contains the test folder', async () => {
    await driver.put(`${PREFIX}/root.txt`, 'x')
    const result = await driver.listAll('/')
    const dirs = [...result.objects].filter(o => o.isDirectory).map(o => (o as DriveDirectory).prefix)
    expect(dirs).toContain(PREFIX)
  })

  it('getStream (range) rejects bad ranges', async () => {
    const key = `${PREFIX}/range.txt`
    await expect(driver.getStream(key, { range: { start: -1 } })).rejects.toThrow()
    await expect(driver.getStream(key, { range: { end: 1.5 } })).rejects.toThrow()
    await expect(driver.getStream(key, { range: { start: 3, end: 1 } })).rejects.toThrow()
  })

  it('getSignedUrl with custom expiry', async () => {
    await driver.put(`${PREFIX}/signed.txt`, 'signed')
    const expiresOn = new Date(Date.now() + 60 * 1000)
    const url = await driver.getSignedUrl(`${PREFIX}/signed.txt`, { expiresOn } as any)
    expect(new URL(url).searchParams.get('se')).toBe(expiresOn.toISOString().replace(/\.\d+Z$/, 'Z'))
    expect(new URL(url).searchParams.get('sp')).toBe('r')

    const res = await fetch(url)
    expect(await res.text()).toBe('signed')
    await driver.delete(`${PREFIX}/signed.txt`)
  })

  it('getSignedUrl cannot be used to write', async () => {
    const url = await driver.getSignedUrl(`${PREFIX}/readonly.txt`)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob' },
      body: 'nope'
    })
    expect(res.status).toBe(403)
  })

  it('getSignedUploadUrl uses create + write permission', async () => {
    const url = await driver.getSignedUploadUrl(`${PREFIX}/up.txt`)
    expect(new URL(url).searchParams.get('sp')).toBe('cw')
  })

  it('bucket switches the container', async () => {
    const other = driver.bucket(AZURE_BLOB_STORAGE_CONTAINER as string)
    expect(other).toBeInstanceOf(AzureDriver)
    expect(other).not.toBe(driver)
    await other.put(`${PREFIX}/bucket.txt`, 'from bucket')
    expect(await driver.get(`${PREFIX}/bucket.txt`)).toBe('from bucket')
  })

  it('works through a flydrive Disk', async () => {
    const disk = new Disk(driver)
    await disk.put(`${PREFIX}/disk.txt`, 'disk')
    expect(await disk.get(`${PREFIX}/disk.txt`)).toBe('disk')
    expect(await disk.exists(`${PREFIX}/disk.txt`)).toBe(true)
    await disk.delete(`${PREFIX}/disk.txt`)
    expect(await disk.exists(`${PREFIX}/disk.txt`)).toBe(false)
  })
})

describe('Azure driver (no network)', () => {
  const offline = new AzureDriver({ name: 'myaccount', key: Buffer.from('secret').toString('base64'), container: 'box' })

  it('getUrl builds the blob url from the account name', async () => {
    expect(await offline.getUrl('a/b.txt')).toBe('https://myaccount.blob.core.windows.net/box/a/b.txt')
  })

  it('getUrl uses localAddress when set', async () => {
    const local = new AzureDriver({ name: 'dev', key: Buffer.from('k').toString('base64'), localAddress: 'http://127.0.0.1:10000/dev', container: 'box' })
    expect(await local.getUrl('f.txt')).toBe('http://127.0.0.1:10000/dev/box/f.txt')
  })

  it('getSignedUrl works offline with a shared key', async () => {
    const url = new URL(await offline.getSignedUrl('f.txt'))
    expect(url.origin + url.pathname).toBe('https://myaccount.blob.core.windows.net/box/f.txt')
    expect(url.searchParams.get('sig')).toBeTruthy()
  })

  it('bucket keeps the rest of the config', async () => {
    expect(await offline.bucket('other').getUrl('f.txt')).toBe('https://myaccount.blob.core.windows.net/other/f.txt')
  })

  it('getVisibility comes from the config', async () => {
    expect(await offline.getVisibility('f.txt')).toBe('private')
    const pub = new AzureDriver({ name: 'myaccount', key: Buffer.from('secret').toString('base64'), container: 'box', visibility: 'public' })
    expect(await pub.getVisibility('f.txt')).toBe('public')
    expect(await pub.bucket('other').getVisibility('f.txt')).toBe('public')
  })

  it('setVisibility is a no-op', async () => {
    await expect(offline.setVisibility('f.txt', 'public')).resolves.toBeUndefined()
    expect(await offline.getVisibility('f.txt')).toBe('private')
  })

  it('throws when the container is not set', async () => {
    const noContainer = new AzureDriver({ name: 'myaccount', key: Buffer.from('secret').toString('base64') })
    await expect(noContainer.getUrl('f.txt')).rejects.toThrow('Container is not set')
    await expect(noContainer.put('f.txt', 'x')).rejects.toThrow('Container is not set')
    await expect(noContainer.copy('a', 'b')).rejects.toThrow('Container is not set')
    await expect(noContainer.deleteAll('a')).rejects.toThrow('Container is not set')
    await expect(noContainer.listAll('a')).rejects.toThrow('Container is not set')
    expect(await noContainer.exists('f.txt')).toBe(false)
  })

  it('AzureService resolves to a driver factory', async () => {
    const service = AzureService({ name: 'myaccount', key: Buffer.from('secret').toString('base64'), container: 'box' })
    expect(service.type).toBe('provider')
    const factory = await service.resolver()
    expect(factory()).toBeInstanceOf(AzureDriver)
  })
})
