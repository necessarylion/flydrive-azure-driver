import { Readable } from 'node:stream'
import { AzureDriver } from '../src/index.js'
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
