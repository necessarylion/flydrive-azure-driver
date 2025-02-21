# Flydrive Azure Storage Driver

This is a [Flydrive](https://flydrive.dev/) driver for the Azure Storage Service.

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
