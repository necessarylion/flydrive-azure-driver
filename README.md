# Flydrive - Azure Blob Storage Driver

This is a [Flydrive](https://flydrive.dev/) driver for the Azure Blob Storage.

## Installation

```bash
npm install flydrive-azure
```

## Usage

```ts
import { AzureDriver } from 'flydrive-azure'

const driver = new AzureDriver({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  container: 'my-container',
})
```

## AdonisJs V6 Usage

```ts
import { AzureService } from 'flydrive-azure'

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK', 'azure'),

  services: {

    // other driver config
    ....

    azure: AzureService({
      connectionString: env.get('AZURE_BLOB_STORAGE_CONN_STRING'),
      container: env.get('AZURE_BLOB_STORAGE_CONTAINER'),
    }),
  },
})
```

## Signed upload URLs

`getSignedUploadUrl` gives a URL that a client, for example a browser, can use to upload a file directly to Azure.

The client must send the header `x-ms-blob-type: BlockBlob` with the `PUT` request. Azure needs this header to know the blob type. If the header is not there, Azure refuses the upload with status `400`.

```ts
const url = await drive.use('azure').getSignedUploadUrl('avatars/1.png')

// In the client
await fetch(url, {
  method: 'PUT',
  headers: {
    'x-ms-blob-type': 'BlockBlob',
    'Content-Type': file.type,
  },
  body: file,
})
```

The signed URL does not control the `Content-Type` of the file. The `Content-Type` header of the client request sets the content type of the blob.
