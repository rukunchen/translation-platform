import type { SupabaseClient } from '@supabase/supabase-js'

type BucketOptions = {
  public: boolean
  fileSizeLimit: number
  allowedMimeTypes: string[]
}

export async function ensureStorageBucket(
  client: SupabaseClient,
  bucketId: string,
  options: BucketOptions
) {
  const { error: getError } = await client.storage.getBucket(bucketId)

  if (getError) {
    if (!isMissingBucketError(getError)) {
      throw new Error(`读取 ${bucketId} bucket 失败：${getError.message}`)
    }

    const { error: createError } = await client.storage.createBucket(bucketId, {
      public: options.public,
      fileSizeLimit: options.fileSizeLimit,
      allowedMimeTypes: options.allowedMimeTypes,
    })

    if (createError && !isExistingBucketError(createError)) {
      throw new Error(`创建 ${bucketId} bucket 失败：${createError.message}`)
    }
    return
  }

  const { error: updateError } = await client.storage.updateBucket(bucketId, {
    public: options.public,
    fileSizeLimit: options.fileSizeLimit,
    allowedMimeTypes: options.allowedMimeTypes,
  })
  if (updateError) {
    throw new Error(`更新 ${bucketId} bucket 配置失败：${updateError.message}`)
  }
}

function isMissingBucketError(error: { message: string; statusCode?: string | number }) {
  const message = error.message.toLowerCase()
  return error.statusCode === 404 || error.statusCode === '404' || message.includes('not found')
}

function isExistingBucketError(error: { message: string; statusCode?: string | number }) {
  const message = error.message.toLowerCase()
  return error.statusCode === 409 || error.statusCode === '409' || message.includes('already exists')
}
