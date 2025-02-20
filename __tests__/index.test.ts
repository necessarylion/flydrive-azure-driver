import { Readable } from 'node:stream'
import { AzureDriver } from '../src'
import { text } from 'node:stream/consumers'

import { config } from 'dotenv';
config();

const AZURE_BLOB_STORAGE_CONTAINER = process.env.AZURE_BLOB_STORAGE_CONTAINER
const AZURE_BLOB_STORAGE_CONN_STRING = process.env.AZURE_BLOB_STORAGE_CONN_STRING

const driver = new AzureDriver({
  connectionString: AZURE_BLOB_STORAGE_CONN_STRING,
  container: AZURE_BLOB_STORAGE_CONTAINER
})

describe('Azure file storage driver', () => {
  it('exists', async () => {
    const res = await driver.exists('not-existing.txt')
    expect(res).toBe(false)
  })

  it('put|exists|delete', async () => {
    await driver.put('test.txt', 'Hello, world!')
    // expect file to be created
    const res = await driver.exists('test.txt')
    expect(res).toBe(true)
    
    // delete file
    await driver.delete('test.txt')
    const res2 = await driver.exists('test.txt')
    expect(res2).toBe(false)
  })

  it('putStream|exists|delete', async () => {
    await driver.putStream('test2.txt', Readable.from('hello world'))
    // expect file to be created
    const res = await driver.exists('test2.txt')
    expect(res).toBe(true)
    
    // delete file
    await driver.delete('test2.txt')
    const res2 = await driver.exists('test2.txt')
    expect(res2).toBe(false)
  })

  it('get', async () => {
    await driver.putStream('test2.txt', Readable.from('hello world'))
    // expect file to be created
    const res = await driver.get('test2.txt')
    expect(res).toBe('hello world')

    await driver.delete('test2.txt')
    const res2 = await driver.exists('test2.txt')
    expect(res2).toBe(false)
  })

  it('getStream', async () => {
    await driver.putStream('test2.txt', Readable.from('hello world'))
    // expect file to be created
    const res = await driver.getStream('test2.txt')
    expect(await text(res)).toBe('hello world')

    await driver.delete('test2.txt')
    const res2 = await driver.exists('test2.txt')
    expect(res2).toBe(false)
  })

  it('getBytes', async () => {
    await driver.putStream('test.txt', Readable.from('hello world'))
    // expect file to be created
    const res = await driver.getBytes('test.txt')
    expect(new TextDecoder().decode(res)).toBe('hello world')

    await driver.delete('test.txt')
    const res2 = await driver.exists('test.txt')
    expect(res2).toBe(false)
  })

  it('getSignedUrl', async () => {
    await driver.putStream('test.txt', Readable.from('hello world'))
    // expect file to be created
    const url = await driver.getSignedUrl('test.txt')
    expect(typeof url).toBe('string')

    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')

    await driver.delete('test.txt')
    const res2 = await driver.exists('test.txt')
    expect(res2).toBe(false)
  })

  it('getMetaData', async () => {
    await driver.putStream('test.txt', Readable.from('hello world'), {
      blobHTTPHeaders: {
        blobContentType: 'text/plain'
      }
    })
    // expect file to be created
    const res = await driver.getMetaData('test.txt')
    expect(res.contentType).toBe('text/plain')
    expect(res.contentLength).toBe(11)

    await driver.delete('test.txt')
    const res2 = await driver.exists('test.txt')
    expect(res2).toBe(false)
  })
})
