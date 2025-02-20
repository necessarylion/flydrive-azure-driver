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
import { ServiceConfigProvider } from '@adonisjs/drive/types'
import { AzureDriver, AzureStorageDriverConfig } from 'flydrive-azure-driver'

function azureService(config: AzureStorageDriverConfig): ServiceConfigProvider<() => AzureDriver> {
  return {
    type: 'provider',
    resolver: async () => {
      return () => new AzureDriver(config)
    },
  }
}

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK', 'azure'),

  services: {

    // other driver config
    ....

    azure: azureService({
      connectionString: env.get('AZURE_BLOB_STORAGE_CONN_STRING'),
      container: env.get('AZURE_BLOB_STORAGE_CONTAINER'),
    }),
  },
})
```
